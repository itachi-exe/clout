const test = require("node:test");
const assert = require("node:assert/strict");
const { validateComment } = require("../src/comments");

test("validateComment accepts a trimmed reply within the post limit", () => {
  assert.equal(validateComment("  Arc needs this.  "), "Arc needs this.");
});

test("validateComment rejects blank and oversized replies", () => {
  assert.throws(() => validateComment("   "), /content required/);
  assert.throws(() => validateComment("x".repeat(841)), /content too long/);
});
