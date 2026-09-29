/**
 * Link previews for posts. Fetches a public page's OpenGraph/Twitter metadata, safely.
 *
 * Security model (this server sits next to other private services):
 *  - only http(s), default ports, no credentials in the URL
 *  - every DNS answer is checked against private/loopback/link-local/metadata ranges
 *  - the checked address is pinned for the actual connection, so DNS rebinding cannot
 *    swap in 127.0.0.1 between the check and the connect
 *  - redirects are followed manually (max 3) and each hop is re-validated
 *  - 5s total timeout, 512KB read cap, text/html only
 */
const dns = require("dns").promises;
const net = require("net");
const http = require("http");
const https = require("https");

const URL_RE = /https?:\/\/[^\s<>"']+/i;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const UA = "Mozilla/5.0 (compatible; CloutBot/1.0; +https://cloutonarc.fun)";

function firstUrl(text) {
  const m = String(text || "").match(URL_RE);
  if (!m) return null;
  const url = m[0].replace(/[.,;:!?)\]}]+$/, "");
  return normalizeUrl(url);
}

function normalizeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (u.port && !((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443"))) return null;
  u.hash = "";
  return u.toString();
}

function ipv4ToInt(ip) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

function isBlockedAddress(ip) {
  const addr = String(ip || "").toLowerCase();
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  if (net.isIPv4(addr)) {
    const n = ipv4ToInt(addr);
    return V4_BLOCKS.some(([base, mask]) => ((n & mask) >>> 0) === ((base & mask) >>> 0));
  }
  if (net.isIPv6(addr)) {
    if (addr === "::" || addr === "::1") return true;
    const first = parseInt(addr.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // multicast
    return false;
  }
  return true; // anything we cannot parse is refused
}

function decodeEntities(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function clean(s, max) {
  if (s == null) return null;
  const t = decodeEntities(s).replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "\u2026" : t;
}

function extractMeta(html, pageUrl) {
  const head = String(html || "").slice(0, 200000);
  const metas = {};
  const tagRe = /<meta\b[^>]*>/gi;
  let tag;
  while ((tag = tagRe.exec(head))) {
    const t = tag[0];
    const key = (t.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const content = (t.match(/\bcontent\s*=\s*"([^"]*)"/i) || t.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
    if (key && content != null && !(key.toLowerCase() in metas)) metas[key.toLowerCase()] = content;
  }
  const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const pick = (...keys) => { for (const k of keys) if (metas[k]) return metas[k]; return null; };

  let image = pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src");
  if (image) {
    try { image = new URL(decodeEntities(image).trim(), pageUrl).toString(); } catch { image = null; }
    if (image && !image.startsWith("https://")) image = null;
  }
  let host = null;
  try { host = new URL(pageUrl).hostname.replace(/^www\./, ""); } catch {}
  return {
    title: clean(pick("og:title", "twitter:title") || titleTag, 160),
    description: clean(pick("og:description", "twitter:description", "description"), 300),
    image,
    siteName: clean(pick("og:site_name", "application-name"), 60) || host,
  };
}

async function resolveSafe(rawHost) {
  const hostname = String(rawHost || "").replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error("blocked address");
    return { address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(hostname)) throw new Error("blocked host");
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!answers.length) throw new Error("no address");
  // refuse the whole host if ANY answer is private, so round-robin cannot sneak one in
  for (const a of answers) if (isBlockedAddress(a.address)) throw new Error("blocked address");
  return answers[0];
}

function requestOnce(url, pinned, deadline) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || undefined,
      path: u.pathname + u.search, method: "GET", servername: u.hostname,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en" },
      // pin the pre-validated address: DNS cannot change between check and connect.
      // Node may ask for {all:true} and then expects an array.
      lookup: (_host, opts, cb) => (opts && opts.all)
        ? cb(null, [{ address: pinned.address, family: pinned.family }])
        : cb(null, pinned.address, pinned.family),
      timeout: Math.max(500, deadline - Date.now()),
    }, res => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: new URL(res.headers.location, url).toString() });
      }
      const type = String(res.headers["content-type"] || "");
      if (status >= 400 || !/text\/html|application\/xhtml/i.test(type)) {
        res.resume();
        return reject(new Error("not an html page"));
      }
      let size = 0; const chunks = [];
      res.on("data", c => {
        size += c.length;
        chunks.push(c);
        if (size > MAX_BYTES || /<\/head>/i.test(c.toString("latin1"))) res.destroy();
      });
      const done = () => resolve({ html: Buffer.concat(chunks).toString("utf8") });
      res.on("end", done);
      res.on("close", done);
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function fetchPreview(rawUrl) {
  let url = normalizeUrl(rawUrl);
  if (!url) throw new Error("unsupported url");
  const deadline = Date.now() + TIMEOUT_MS;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(url);
    const pinned = await resolveSafe(u.hostname);
    const out = await requestOnce(url, pinned, deadline);
    if (out.redirect) {
      url = normalizeUrl(out.redirect);
      if (!url) throw new Error("unsafe redirect");
      continue;
    }
    const meta = extractMeta(out.html, url);
    if (!meta.title && !meta.description && !meta.image) throw new Error("no metadata");
    return { url, ...meta };
  }
  throw new Error("too many redirects");
}

module.exports = { firstUrl, normalizeUrl, extractMeta, isBlockedAddress, fetchPreview };
