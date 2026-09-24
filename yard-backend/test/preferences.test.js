const test = require("node:test");
const assert = require("node:assert/strict");
const { preferenceDelta } = require("../src/preferences");

test("preferenceDelta makes reposts a stronger intent signal than likes", () => {
  assert.equal(preferenceDelta("like"), 1);
  assert.equal(preferenceDelta("repost"), 3);
});

test("preferenceDelta reverses exactly the signal it added", () => {
  assert.equal(preferenceDelta("like", true), -1);
  assert.equal(preferenceDelta("repost", true), -3);
});
