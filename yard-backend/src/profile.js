const MAX_AVATAR_BYTES = 128 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateHandle(value) {
  const handle = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    throw new Error("username must be 3-24 lowercase letters, numbers, or underscores");
  }
  return handle;
}

function hasExpectedImageSignature(mime, bytes) {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function validateAvatarData(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("avatar must be an image");

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !AVATAR_TYPES.has(match[1])) throw new Error("avatar must be a PNG, JPEG, or WebP image");

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) throw new Error("avatar must be smaller than 128KB");
  if (bytes.toString("base64") !== match[2] || !hasExpectedImageSignature(match[1], bytes)) {
    throw new Error("avatar image could not be verified");
  }
  return `data:${match[1]};base64,${match[2]}`;
}

module.exports = { MAX_AVATAR_BYTES, validateHandle, validateAvatarData };
