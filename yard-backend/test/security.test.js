const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimit, clientKey } = require("../src/security");

function run(middleware, { ip = "198.51.100.8", forwarded, path = "/api/auth/nonce" } = {}) {
  const headers = forwarded ? { "x-forwarded-for": forwarded } : {};
  const req = { method: "GET", path, headers, ip, socket: { remoteAddress: ip } };
  const response = { headers: {}, statusCode: 200, body: null,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let passed = false;
  middleware(req, response, () => { passed = true; });
  return { response, passed };
}

test("clientKey selects the first forwarded client IP", () => {
  assert.equal(clientKey({ headers: { "x-forwarded-for": "203.0.113.3, 10.0.0.1" }, ip: "10.0.0.1" }), "203.0.113.3");
});

test("rate limiter permits the configured request budget and rejects the next request", () => {
  let clock = 1000;
  const limit = createRateLimit({ max: 2, windowMs: 1000, now: () => clock });
  assert.equal(run(limit).passed, true);
  assert.equal(run(limit).passed, true);
  const blocked = run(limit);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.match(blocked.response.body.error, /Too many requests/);
  clock += 1000;
  assert.equal(run(limit).passed, true);
});
