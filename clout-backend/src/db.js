const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "..", "clout.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  address TEXT PRIMARY KEY,
  handle TEXT UNIQUE,
  display_name TEXT,
  bio TEXT DEFAULT '',
  avatar_seed TEXT,
  avatar_data TEXT,
  account_type TEXT NOT NULL DEFAULT 'person',
  verification_label TEXT,
  points INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_post_id INTEGER,          -- null until confirmed on-chain
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  tx_hash TEXT,
  status TEXT DEFAULT 'pending',  -- pending | confirmed | failed
  like_count INTEGER DEFAULT 0,
  repost_count INTEGER DEFAULT 0,
  tips_received TEXT DEFAULT '0',  -- kept for migration safety, no longer updated
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(author) REFERENCES users(address)
);

CREATE TABLE IF NOT EXISTS likes (
  post_id INTEGER NOT NULL,
  liker TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (post_id, liker)
);

CREATE TABLE IF NOT EXISTS reposts (
  post_id INTEGER NOT NULL,
  reposter TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (post_id, reposter)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(post_id) REFERENCES posts(id),
  FOREIGN KEY(author) REFERENCES users(address)
);

CREATE TABLE IF NOT EXISTS post_topics (
  post_id INTEGER NOT NULL,
  topic TEXT NOT NULL,
  PRIMARY KEY (post_id, topic),
  FOREIGN KEY(post_id) REFERENCES posts(id)
);

CREATE TABLE IF NOT EXISTS topic_affinities (
  viewer TEXT NOT NULL,
  topic TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (viewer, topic)
);

CREATE TABLE IF NOT EXISTS author_affinities (
  viewer TEXT NOT NULL,
  author TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (viewer, author)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL,             -- like | repost | share_buy | share_sell | follow | mention
  actor TEXT,
  post_id INTEGER,
  amount TEXT,
  read INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS follows (
  follower TEXT NOT NULL,
  followee TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (follower, followee)
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS chain_events (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient, read);
`);

// Existing installations predate avatar_data. SQLite only needs this additive migration once.
const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map(column => column.name));
if (!userColumns.has("avatar_data")) db.exec("ALTER TABLE users ADD COLUMN avatar_data TEXT");
if (!userColumns.has("display_name")) db.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
if (!userColumns.has("account_type")) db.exec("ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'person'");
if (!userColumns.has("verification_label")) db.exec("ALTER TABLE users ADD COLUMN verification_label TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS creator_keys (
  creator TEXT PRIMARY KEY,
  supply INTEGER NOT NULL DEFAULT 0,
  last_price TEXT NOT NULL DEFAULT '0',
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS key_holdings (
  creator TEXT NOT NULL,
  holder TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (creator, holder)
);

CREATE TABLE IF NOT EXISTS key_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trader TEXT NOT NULL,
  creator TEXT NOT NULL,
  is_buy INTEGER NOT NULL,
  key_amount INTEGER NOT NULL,
  usdc_amount TEXT NOT NULL,
  supply_after INTEGER NOT NULL,
  tx_hash TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_key_trades_created ON key_trades(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_holdings_holder ON key_holdings(holder);

-- Post share markets (CloutPostShares contract)
CREATE TABLE IF NOT EXISTS post_shares (
  post_id INTEGER PRIMARY KEY,   -- matches posts.id (db id, not chain_post_id)
  chain_post_id INTEGER,         -- chain post id for contract lookups
  supply INTEGER NOT NULL DEFAULT 0,
  last_price TEXT NOT NULL DEFAULT '0',  -- raw curve price for 1 share in wei
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS post_share_holdings (
  post_id INTEGER NOT NULL,
  holder TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, holder)
);

CREATE TABLE IF NOT EXISTS post_share_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trader TEXT NOT NULL,
  post_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  is_buy INTEGER NOT NULL,
  share_amount INTEGER NOT NULL,
  usdc_amount TEXT NOT NULL,     -- raw curve price (before fees) in wei
  supply_after INTEGER NOT NULL,
  tx_hash TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_post_share_trades_post ON post_share_trades(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_share_trades_trader ON post_share_trades(trader, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_share_holdings_holder ON post_share_holdings(holder);

CREATE TABLE IF NOT EXISTS link_previews (
  url TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  image TEXT,
  site_name TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  fetched_at INTEGER DEFAULT (unixepoch())
);
`);

// FTS5 full-text search on posts
db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  content,
  content='posts',
  content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, content) VALUES('delete', old.id, old.content);
END;
CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO posts_fts(rowid, content) VALUES (new.id, new.content);
END;
`);

module.exports = db;
