const WINDOW_MS = 60 * 1000;

function clientKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function createRateLimit({ windowMs = WINDOW_MS, max = 60, now = () => Date.now() } = {}) {
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const key = `${req.method}:${req.path}:${clientKey(req)}`;
    const current = now();
    const bucket = buckets.get(key);
    const fresh = !bucket || current >= bucket.resetAt;
    const entry = fresh ? { count: 0, resetAt: current + windowMs } : bucket;
    entry.count += 1;
    buckets.set(key, entry);

    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    res.set("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - current) / 1000))));
      return res.status(429).json({ error: "Too many requests. Please try again shortly." });
    }
    return next();
  };
}

module.exports = { createRateLimit, clientKey };
