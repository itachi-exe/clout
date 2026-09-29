const { ethers } = require("ethers");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET = process.env.CLOUT_JWT_SECRET || crypto.randomBytes(32).toString("hex");
const nonces = new Map(); // address -> { nonce, expires }

function issueNonce(address) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  nonces.set(address.toLowerCase(), { nonce, issuedAt, expires: Date.now() + 5 * 60 * 1000 });
  return { nonce, issuedAt };
}

function buildMessage(address, nonce, issuedAt) {
  return (
    `Clout wants you to sign in with your Arc wallet.\n\n` +
    `Address: ${address}\n` +
    `Nonce: ${nonce}\n` +
    `Issued: ${issuedAt}`
  );
}

function verifySignature(address, signature) {
  const entry = nonces.get(address.toLowerCase());
  if (!entry) throw new Error("No nonce issued for this address, request one first");
  if (Date.now() > entry.expires) {
    nonces.delete(address.toLowerCase());
    throw new Error("Nonce expired, request a new one");
  }
  const message = buildMessage(address, entry.nonce, entry.issuedAt);
  const recovered = ethers.verifyMessage(message, signature);
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new Error("Signature does not match address");
  }
  nonces.delete(address.toLowerCase());
  return true;
}

function issueSession(address) {
  return jwt.sign({ sub: address.toLowerCase() }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "invalid or expired session" });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET).sub;
  } catch {
    // A public feed remains available when a stale session is present.
  }
  next();
}

module.exports = { issueNonce, buildMessage, verifySignature, issueSession, requireAuth, optionalAuth };
