const test = require("node:test");
const assert = require("node:assert/strict");
const { AUTOMATED_ACCOUNTS } = require("../src/automated-accounts");

test("Clout automated publishers have five distinct disclosed identities", () => {
  assert.equal(AUTOMATED_ACCOUNTS.length, 5);
  assert.equal(new Set(AUTOMATED_ACCOUNTS.map(a => a.handle)).size, 5);
  for (const account of AUTOMATED_ACCOUNTS) {
    assert.equal(account.verifiedLabel, "AI influencer");
    assert.match(account.bio, /AI influencer/i);
  }
});
