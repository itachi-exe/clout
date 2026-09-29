const test = require("node:test");
const assert = require("node:assert/strict");
const { validateHandle, validateAvatarData } = require("../src/profile");

test("validateHandle normalizes and accepts a Clout username", () => {
  assert.equal(validateHandle("  Arc_Builder42  "), "arc_builder42");
});

test("validateHandle rejects invalid usernames", () => {
  assert.throws(() => validateHandle("ab"), /3-24/);
  assert.throws(() => validateHandle("has space"), /3-24/);
  assert.throws(() => validateHandle("no-hyphens"), /3-24/);
});

test("validateAvatarData accepts a valid tiny PNG", () => {
  const avatar = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(validateAvatarData(avatar), avatar);
});

test("validateAvatarData rejects invalid types and forged image data", () => {
  assert.throws(() => validateAvatarData("data:image/gif;base64,R0lGODlh"), /PNG, JPEG, or WebP/);
  assert.throws(() => validateAvatarData("data:image/png;base64,aGVsbG8="), /could not be verified/);
});
