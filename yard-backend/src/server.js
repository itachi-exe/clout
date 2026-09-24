require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const crypto = require("crypto");
const { ethers } = require("ethers");

const db = require("./db");
const { issueNonce, buildMessage, verifySignature, issueSession, requireAuth, optionalAuth } = require("./auth");
const { inferTopics, rankPosts } = require("./feed");
const { preferenceDelta } = require("./preferences");
const { validateComment } = require("./comments");
const { validateHandle, validateAvatarData } = require("./profile");
const { createRateLimit } = require("./security");
const { annotateViewerState, loadViewerState } = require("./viewer-state");
const { createPreviewStore } = require("./preview-store");
const { firstUrl } = require("./link-preview");
const previews = createPreviewStore(db);

const app = express();
const ALLOWED_ORIGINS = new Set([
  "https://arcyard.vercel.app",
  "http://localhost:9000",
  "http://localhost:7080",
  // local frontend (yard-frontend/tests/mirror.py)
  "http://localhost:9147",
  "http://127.0.0.1:9147",
]);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    // Requests without an Origin are server-to-server, health checks, or local tooling.
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    // Let Express serve the response without CORS headers. Browsers reject it,
    // while this avoids turning an untrusted Origin header into a noisy 500.
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT"],
  allowedHeaders: ["Authorization", "Content-Type"],
}));
app.use(express.json({ limit: "256kb" }));
const authRateLimit = createRateLimit({ max: 20, windowMs: 60 * 1000 });
const writeRateLimit = createRateLimit({ max: 40, windowMs: 60 * 1000 });

const PORT = process.env.PORT || 7080;

function topicsForPost(post) {
  const stored = db.prepare("SELECT topic FROM post_topics WHERE post_id = ?").all(post.id).map(row => row.topic);
  return stored.length ? stored : inferTopics(post.content);
}

function saveTopics(postId, content) {
  const insert = db.prepare("INSERT OR IGNORE INTO post_topics (post_id, topic) VALUES (?, ?)");
  for (const topic of inferTopics(content)) insert.run(postId, topic);
}

function recordPreference(viewer, post, kind, removing = false) {
  const delta = preferenceDelta(kind, removing);
  const topics = topicsForPost(post);
  const upsertTopic = db.prepare(
    `INSERT INTO topic_affinities (viewer, topic, weight, updated_at) VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(viewer, topic) DO UPDATE SET weight = MAX(weight + excluded.weight, 0), updated_at = unixepoch()`
  );
  const upsertAuthor = db.prepare(
    `INSERT INTO author_affinities (viewer, author, weight, updated_at) VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(viewer, author) DO UPDATE SET weight = MAX(weight + excluded.weight, 0), updated_at = unixepoch()`
  );
  for (const topic of topics) upsertTopic.run(viewer, topic, delta);
  upsertAuthor.run(viewer, post.author, delta);
}

// ---------------------------------------------------------------- health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "arcyard-backend", time: new Date().toISOString() });
});

// ---------------------------------------------------------------- auth
app.get("/api/auth/nonce", authRateLimit, (req, res) => {
  const address = String(req.query.address || "");
  if (!ethers.isAddress(address)) return res.status(400).json({ error: "invalid address" });
  const { nonce, issuedAt } = issueNonce(address);
  res.json({ address, nonce, message: buildMessage(address, nonce, issuedAt) });
});

app.post("/api/auth/verify", authRateLimit, (req, res) => {
  const { address, signature } = req.body || {};
  if (!ethers.isAddress(address) || !signature) {
    return res.status(400).json({ error: "address and signature required" });
  }
  try {
    verifySignature(address, signature);
  } catch (e) {
    return res.status(401).json({ error: e.message });
  }

  const lower = address.toLowerCase();
  const existing = db.prepare("SELECT * FROM users WHERE address = ?").get(lower);
  if (!existing) {
    db.prepare("INSERT INTO users (address, avatar_seed) VALUES (?, ?)").run(
      lower,
      crypto.randomBytes(4).toString("hex")
    );
  }
  const token = issueSession(lower);
  const user = db.prepare("SELECT * FROM users WHERE address = ?").get(lower);
  res.json({ token, user });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE address = ?").get(req.user);
  res.json({ user });
});

// ---------------------------------------------------------------- profile
function publicUser(address) {
  return db.prepare("SELECT address, handle, bio, avatar_seed, avatar_data, points, created_at FROM users WHERE address = ?").get(address);
}

function saveProfile(req, res) {
  const { handle, avatarData, bio } = req.body || {};
  let username;
  let avatar;
  try {
    username = validateHandle(handle);
    avatar = validateAvatarData(avatarData);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const taken = db.prepare("SELECT address FROM users WHERE handle = ? COLLATE NOCASE AND address != ?").get(username, req.user);
  if (taken) return res.status(409).json({ error: "That username is already taken" });

  db.prepare("UPDATE users SET handle = ?, bio = COALESCE(?, bio), avatar_data = COALESCE(?, avatar_data) WHERE address = ?")
    .run(username, bio ? String(bio).trim().slice(0,160) : null, avatar, req.user);
  return res.json({ ok: true, user: publicUser(req.user) });
}

app.put("/api/profile", writeRateLimit, requireAuth, saveProfile);
app.post("/api/profile/handle", writeRateLimit, requireAuth, saveProfile);

// ---------------------------------------------------------------- creator keys
// ── Post share markets ──────────────────────────────────────────────────────

// GET /api/posts/:id/shares?holder=0x...
app.get("/api/posts/:id/shares", (req, res) => {
  const postId = parseInt(req.params.id);
  if (!postId) return res.status(400).json({ error: "invalid post id" });
  const market = db.prepare("SELECT * FROM post_shares WHERE post_id = ?").get(postId);
  const holder = String(req.query.holder || "").toLowerCase();
  let heldByViewer = 0;
  if (holder && ethers.isAddress(holder)) {
    const h = db.prepare("SELECT balance FROM post_share_holdings WHERE post_id = ? AND holder = ?").get(postId, holder);
    heldByViewer = h ? h.balance : 0;
  }
  res.json({
    postId,
    supply: market ? market.supply : 0,
    lastPrice: market ? market.last_price : "0",
    heldByViewer
  });
});

// GET /api/posts/:id/shares/trades
app.get("/api/posts/:id/shares/trades", (req, res) => {
  const postId = parseInt(req.params.id);
  if (!postId) return res.status(400).json({ error: "invalid post id" });
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const rows = db.prepare(
    `SELECT t.*, u.handle AS trader_handle
     FROM post_share_trades t
     LEFT JOIN users u ON u.address = t.trader
     WHERE t.post_id = ? ORDER BY t.created_at DESC LIMIT ?`
  ).all(postId, limit);
  res.json({ trades: rows });
});

// GET /api/share-activity — global recent trades feed
app.get("/api/share-activity", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const rows = db.prepare(
    `SELECT t.*, u.handle AS trader_handle, p.content AS post_excerpt
     FROM post_share_trades t
     LEFT JOIN users u ON u.address = t.trader
     LEFT JOIN posts p ON p.id = t.post_id
     ORDER BY t.created_at DESC LIMIT ?`
  ).all(limit);
  res.json({ trades: rows });
});

// ─────────────────────────────────────────────────────────────────────────────

app.get("/api/keys/:creator", (req, res) => {
  const creator = req.params.creator.toLowerCase();
  if (!ethers.isAddress(creator)) return res.status(400).json({ error: "invalid address" });
  const row = db.prepare("SELECT * FROM creator_keys WHERE creator = ?").get(creator);
  const holder = String(req.query.holder || "").toLowerCase();
  let heldByViewer = 0;
  if (holder && ethers.isAddress(holder)) {
    const h = db.prepare("SELECT balance FROM key_holdings WHERE creator = ? AND holder = ?").get(creator, holder);
    heldByViewer = h ? h.balance : 0;
  }
  res.json({
    creator,
    supply: row ? row.supply : 0,
    lastPrice: row ? row.last_price : "0",
    heldByViewer
  });
});

app.get("/api/keys/:creator/holders", (req, res) => {
  const creator = req.params.creator.toLowerCase();
  const rows = db.prepare(
    `SELECT k.holder, k.balance, u.handle FROM key_holdings k LEFT JOIN users u ON u.address = k.holder
     WHERE k.creator = ? AND k.balance > 0 ORDER BY k.balance DESC LIMIT 50`
  ).all(creator);
  res.json({ holders: rows });
});

app.get("/api/keys-activity", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const rows = db.prepare(
    `SELECT t.*, u.handle AS trader_handle, c.handle AS creator_handle
     FROM key_trades t
     LEFT JOIN users u ON u.address = t.trader
     LEFT JOIN users c ON c.address = t.creator
     ORDER BY t.created_at DESC LIMIT ?`
  ).all(limit);
  res.json({ activity: rows });
});

// ---------------------------------------------------------------- search
app.get("/api/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ users: [], posts: [] });
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const users = db.prepare(
    "SELECT address, handle, display_name, bio, avatar_data, account_type, verification_label, points FROM users WHERE handle LIKE ? OR display_name LIKE ? OR address LIKE ? ORDER BY points DESC LIMIT 8"
  ).all(like, like, like);
  const posts = db.prepare(
    `SELECT p.*, u.handle, u.display_name, u.account_type, u.verification_label, u.avatar_data,
       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
     FROM posts p LEFT JOIN users u ON u.address = p.author
     WHERE p.content LIKE ? OR u.handle LIKE ? OR u.display_name LIKE ?
     ORDER BY p.created_at DESC LIMIT 12`
  ).all(like, like, like);
  res.json({ users, posts: previews.attach(posts) });
});

// ---------------------------------------------------------------- link previews
const previewRateLimit = createRateLimit({ max: 30, windowMs: 60 * 1000 });
app.get("/api/link-preview", previewRateLimit, async (req, res) => {
  const url = firstUrl(String(req.query.url || ""));
  if (!url) return res.status(400).json({ error: "unsupported url" });
  const row = await previews.ensure(url);
  if (!row) return res.status(404).json({ error: "no preview" });
  res.set("Cache-Control", "public, max-age=3600");
  res.json({ preview: { url, title: row.title, description: row.description, image: row.image, siteName: row.site_name } });
});

// ---------------------------------------------------------------- posts
app.get("/api/posts", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const rows = db
    .prepare(
      `SELECT p.*, u.handle, u.display_name, u.account_type, u.verification_label, u.avatar_seed, u.avatar_data,
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
        COALESCE(ck.supply, 0) AS creator_key_supply
       FROM posts p LEFT JOIN users u ON u.address = p.author
       LEFT JOIN creator_keys ck ON ck.creator = p.author
       ORDER BY p.created_at DESC LIMIT ?`
    )
    .all(limit);
  res.json({ posts: rows });
});

app.get("/api/feed", optionalAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const scope = String(req.query.scope || "top"); // top | following | latest
  const viewer = req.user;

  if (scope === "following" && !viewer) {
    return res.json({ posts: [], personalized: false, requiresAuth: true });
  }

  const rows = db.prepare(
    `SELECT p.*, u.handle, u.display_name, u.account_type, u.verification_label, u.avatar_seed, u.avatar_data,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count,
      COALESCE(ck.supply, 0) AS creator_key_supply, COALESCE(ck.last_price, '0') AS creator_key_last_price
     FROM posts p LEFT JOIN users u ON u.address = p.author
     LEFT JOIN creator_keys ck ON ck.creator = p.author
     ORDER BY p.created_at DESC LIMIT 100`
  ).all();

  const follows = new Set(viewer
    ? db.prepare("SELECT followee FROM follows WHERE follower = ?").all(viewer).map(row => row.followee)
    : []);

  if (scope === "latest") {
    return res.json({ posts: previews.attach(annotateViewerState(rows.slice(0, limit), loadViewerState(db, viewer))), personalized: false });
  }

  if (scope === "following") {
    const onlyFollowed = rows.filter(post => follows.has(post.author));
    return res.json({ posts: previews.attach(annotateViewerState(onlyFollowed.slice(0, limit), loadViewerState(db, viewer))), personalized: true });
  }

  const topicWeights = new Map(viewer
    ? db.prepare("SELECT topic, weight FROM topic_affinities WHERE viewer = ? AND weight > 0").all(viewer).map(row => [row.topic, row.weight])
    : []);
  const authorWeights = new Map(viewer
    ? db.prepare("SELECT author, weight FROM author_affinities WHERE viewer = ? AND weight > 0").all(viewer).map(row => [row.author, row.weight])
    : []);
  const ranked = rankPosts(rows.map(post => ({ ...post, topics: topicsForPost(post) })), {
    viewer,
    follows,
    topicWeights,
    authorWeights,
    discoverySlots: viewer ? Math.max(1, Math.ceil(limit * 0.1)) : 0,
  }).slice(0, limit);

  res.json({ posts: previews.attach(annotateViewerState(ranked, loadViewerState(db, viewer))), personalized: Boolean(viewer) });
});

app.get("/api/posts/:id", (req, res) => {
  const postId = parseInt(req.params.id);
  const post = db.prepare(
    `SELECT p.*, u.handle FROM posts p LEFT JOIN users u ON u.address = p.author WHERE p.id = ?`
  ).get(postId);
  if (!post) return res.status(404).json({ error: "post not found" });
  res.json({ post });
});

app.post("/api/posts", writeRateLimit, requireAuth, (req, res) => {
  const { content } = req.body || {};
  const text = String(content || "").trim();
  if (!text) return res.status(400).json({ error: "content required" });
  if (text.length > 840) return res.status(400).json({ error: "content too long (max 840 chars)" });

  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(text));

  db.prepare("INSERT OR IGNORE INTO users (address) VALUES (?)").run(req.user);

  const info = db
    .prepare(
      `INSERT INTO posts (author, content, content_hash, status) VALUES (?, ?, ?, 'pending')`
    )
    .run(req.user, text, contentHash);

  db.prepare("UPDATE users SET points = points + 3 WHERE address = ?").run(req.user);

  saveTopics(info.lastInsertRowid, text);
  const linkUrl = firstUrl(text);
  if (linkUrl) previews.ensure(linkUrl);
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ post: { ...post, topics: topicsForPost(post) } });
});

app.get("/api/posts/:id/comments", (req, res) => {
  const postId = parseInt(req.params.id);
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "post not found" });
  const comments = db.prepare(
    `SELECT c.*, u.handle FROM comments c
     LEFT JOIN users u ON u.address = c.author
     WHERE c.post_id = ? ORDER BY c.created_at ASC`
  ).all(postId);
  res.json({ comments });
});

app.post("/api/posts/:id/comments", writeRateLimit, requireAuth, (req, res) => {
  const postId = parseInt(req.params.id);
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "post not found" });
  let content;
  try { content = validateComment(req.body && req.body.content); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  const info = db.prepare("INSERT INTO comments (post_id, author, content) VALUES (?, ?, ?)")
    .run(postId, req.user, content);
  if (post.author !== req.user) {
    db.prepare("INSERT INTO notifications (recipient, kind, actor, post_id) VALUES (?, 'comment', ?, ?)")
      .run(post.author, req.user, postId);
  }
  const comment = db.prepare("SELECT c.*, u.handle FROM comments c LEFT JOIN users u ON u.address = c.author WHERE c.id = ?")
    .get(info.lastInsertRowid);
  res.status(201).json({ comment });
});

app.post("/api/posts/:id/like", writeRateLimit, requireAuth, (req, res) => {
  const postId = parseInt(req.params.id);
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "post not found" });
  if (post.author === req.user) return res.status(400).json({ error: "cannot like your own post" });

  const already = db.prepare("SELECT * FROM likes WHERE post_id = ? AND liker = ?").get(postId, req.user);
  if (already) {
    db.prepare("DELETE FROM likes WHERE post_id = ? AND liker = ?").run(postId, req.user);
    db.prepare("UPDATE posts SET like_count = like_count - 1 WHERE id = ?").run(postId);
    db.prepare("UPDATE users SET points = MAX(points - 1, 0) WHERE address = ?").run(post.author);
    recordPreference(req.user, post, "like", true);
    return res.json({ liked: false });
  }

  db.prepare("INSERT INTO likes (post_id, liker) VALUES (?, ?)").run(postId, req.user);
  db.prepare("UPDATE posts SET like_count = like_count + 1 WHERE id = ?").run(postId);
  db.prepare("UPDATE users SET points = points + 1 WHERE address = ?").run(post.author);
  recordPreference(req.user, post, "like");
  db.prepare(
    "INSERT INTO notifications (recipient, kind, actor, post_id) VALUES (?, 'like', ?, ?)"
  ).run(post.author, req.user, postId);

  res.json({ liked: true });
});

app.post("/api/posts/:id/repost", writeRateLimit, requireAuth, (req, res) => {
  const postId = parseInt(req.params.id);
  const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post) return res.status(404).json({ error: "post not found" });
  if (post.author === req.user) return res.status(400).json({ error: "cannot repost your own post" });

  const already = db.prepare("SELECT 1 FROM reposts WHERE post_id = ? AND reposter = ?").get(postId, req.user);
  if (already) return res.json({ reposted: true });

  db.prepare("INSERT INTO reposts (post_id, reposter) VALUES (?, ?)").run(postId, req.user);
  db.prepare("UPDATE posts SET repost_count = repost_count + 1 WHERE id = ?").run(postId);
  db.prepare("UPDATE users SET points = points + 2 WHERE address = ?").run(post.author);
  recordPreference(req.user, post, "repost");
  db.prepare(
    "INSERT INTO notifications (recipient, kind, actor, post_id) VALUES (?, 'repost', ?, ?)"
  ).run(post.author, req.user, postId);

  res.json({ reposted: true });
});

// ---------------------------------------------------------------- notifications
app.get("/api/notifications", requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT n.*, u.handle AS actor_handle, u.display_name AS actor_name, u.avatar_data AS actor_avatar,
        u.account_type AS actor_type, u.verification_label AS actor_label, p.content AS post_excerpt
      FROM notifications n
      LEFT JOIN users u ON u.address = n.actor
      LEFT JOIN posts p ON p.id = n.post_id
      WHERE n.recipient = ? ORDER BY n.created_at DESC LIMIT 50`)
    .all(req.user);
  res.json({ notifications: rows });
});

app.post("/api/notifications/read", writeRateLimit, requireAuth, (req, res) => {
  db.prepare("UPDATE notifications SET read = 1 WHERE recipient = ?").run(req.user);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- leaderboard
app.get("/api/leaderboard", (req, res) => {
  const rows = db
    .prepare("SELECT address, handle, display_name, avatar_seed, avatar_data, account_type, verification_label, points FROM users WHERE points > 0 OR account_type = 'automated' ORDER BY points DESC, created_at ASC LIMIT 25")
    .all();
  res.json({ leaderboard: rows });
});

// ---------------------------------------------------------------- public profiles and follows
app.get("/api/users/:address", optionalAuth, (req, res) => {
  const address = String(req.params.address || "").toLowerCase();
  if (!ethers.isAddress(address)) return res.status(400).json({ error: "invalid address" });
  const user = db.prepare("SELECT address, handle, display_name, bio, avatar_data, points, account_type, verification_label, created_at FROM users WHERE address = ?").get(address);
  if (!user) return res.status(404).json({ error: "user not found" });
  const rawPosts = db.prepare(
    `SELECT p.*, u.handle, u.display_name, u.account_type, u.verification_label, u.avatar_data,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
     FROM posts p LEFT JOIN users u ON u.address = p.author
     WHERE p.author = ? ORDER BY p.created_at DESC LIMIT 50`
  ).all(address);
  const posts = previews.attach(annotateViewerState(rawPosts, loadViewerState(db, req.user)));
  const followerCount = db.prepare("SELECT COUNT(*) AS count FROM follows WHERE followee = ?").get(address).count;
  const followingCount = db.prepare("SELECT COUNT(*) AS count FROM follows WHERE follower = ?").get(address).count;
  const totalLikes = db.prepare("SELECT COALESCE(SUM(like_count), 0) AS count FROM posts WHERE author = ?").get(address).count;
  const following = req.user ? Boolean(db.prepare("SELECT 1 FROM follows WHERE follower = ? AND followee = ?").get(req.user, address)) : false;
  res.json({ user, posts, followerCount, followingCount, totalLikes, following });
});

app.post("/api/follow/:address", writeRateLimit, requireAuth, (req, res) => {
  const target = req.params.address.toLowerCase();
  if (!ethers.isAddress(target)) return res.status(400).json({ error: "invalid address" });
  if (target === req.user) return res.status(400).json({ error: "cannot follow yourself" });
  const existing = db.prepare("SELECT 1 FROM follows WHERE follower = ? AND followee = ?").get(req.user, target);
  if (existing) {
    db.prepare("DELETE FROM follows WHERE follower = ? AND followee = ?").run(req.user, target);
    return res.json({ following: false });
  }
  db.prepare("INSERT INTO follows (follower, followee) VALUES (?, ?)").run(req.user, target);
  db.prepare("INSERT INTO notifications (recipient, kind, actor) VALUES (?, 'follow', ?)").run(target, req.user);
  res.json({ following: true });
});

app.listen(PORT, () => {
  console.log(`ArcYard backend listening on :${PORT}`);
});
