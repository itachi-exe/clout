require("dotenv").config();
const { ethers } = require("ethers");
const db = require("./db");

/*
 * ArcYard chain event indexer.
 *
 * Starts only after ARCYARD_CONTRACT_ADDRESS is set. HTTP polling is deliberate:
 * it works with Arc's official public RPC without requiring a websocket provider.
 * The chain_events primary key makes every log idempotent across restarts.
 */
const RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = process.env.ARCYARD_CONTRACT_ADDRESS;
const DEPLOY_BLOCK = Number(process.env.ARCYARD_DEPLOY_BLOCK || 0);
const POLL_MS = Number(process.env.ARC_INDEXER_POLL_MS || 12_000);
const RANGE = 500;
const STATE_KEY = "arcyard:last-indexed-block";

const ABI = [
  "event PostCreated(uint256 indexed postId, address indexed author, bytes32 contentHash, uint64 timestamp)",
  "event PostLiked(uint256 indexed postId, address indexed liker, address indexed author)",
  "event PostUnliked(uint256 indexed postId, address indexed liker, address indexed author)",
  "event PostReposted(uint256 indexed postId, address indexed reposter, address indexed author)",
  "event Tipped(address indexed from, address indexed to, uint256 indexed postId, uint256 amount, uint256 fee)"
];

if (!CONTRACT_ADDRESS) {
  console.log("ArcYard indexer idle: ARCYARD_CONTRACT_ADDRESS is not configured yet");
  process.exit(0);
}
if (!ethers.isAddress(CONTRACT_ADDRESS)) throw new Error("Invalid ARCYARD_CONTRACT_ADDRESS");

const provider = new ethers.JsonRpcProvider(RPC_URL, 5042002, { staticNetwork: true });
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
const iface = new ethers.Interface(ABI);

function alreadyHandled(log, name) {
  const inserted = db.prepare(
    "INSERT OR IGNORE INTO chain_events (tx_hash, log_index, block_number, event_name) VALUES (?, ?, ?, ?)"
  ).run(log.transactionHash, log.index, log.blockNumber, name);
  return inserted.changes === 0;
}

function postByChainId(chainPostId) {
  return db.prepare("SELECT * FROM posts WHERE chain_post_id = ?").get(Number(chainPostId));
}

function ensureUser(address) {
  db.prepare("INSERT OR IGNORE INTO users (address) VALUES (?)").run(address.toLowerCase());
}

function notify(recipient, kind, actor, postId, amount = null) {
  if (recipient.toLowerCase() === actor.toLowerCase()) return;
  db.prepare(
    "INSERT INTO notifications (recipient, kind, actor, post_id, amount) VALUES (?, ?, ?, ?, ?)"
  ).run(recipient.toLowerCase(), kind, actor.toLowerCase(), postId, amount);
}

function handle(event, log) {
  if (alreadyHandled(log, event.name)) return;
  const a = event.args;

  if (event.name === "PostCreated") {
    const author = a.author.toLowerCase();
    const hash = a.contentHash;
    const chainPostId = Number(a.postId);
    ensureUser(author);

    const pending = db.prepare(
      "SELECT id FROM posts WHERE author = ? AND content_hash = ? AND chain_post_id IS NULL ORDER BY created_at DESC LIMIT 1"
    ).get(author, hash);
    if (pending) {
      db.prepare("UPDATE posts SET chain_post_id = ?, tx_hash = ?, status = 'confirmed' WHERE id = ?")
        .run(chainPostId, log.transactionHash, pending.id);
    } else {
      db.prepare(
        "INSERT INTO posts (chain_post_id, author, content, content_hash, tx_hash, status) VALUES (?, ?, ?, ?, ?, 'confirmed')"
      ).run(chainPostId, author, `[On-chain post #${chainPostId}]`, hash, log.transactionHash);
    }
    db.prepare("UPDATE users SET points = points + 3 WHERE address = ?").run(author);
    return;
  }

  const chainPostId = Number(a.postId);
  const post = postByChainId(chainPostId);
  if (!post) return; // It will be picked up after its PostCreated log reaches this indexer.

  if (event.name === "PostLiked") {
    db.prepare("UPDATE posts SET like_count = like_count + 1 WHERE id = ?").run(post.id);
    db.prepare("UPDATE users SET points = points + 1 WHERE address = ?").run(post.author);
    notify(post.author, "like", a.liker, post.id);
  } else if (event.name === "PostUnliked") {
    db.prepare("UPDATE posts SET like_count = MAX(like_count - 1, 0) WHERE id = ?").run(post.id);
    db.prepare("UPDATE users SET points = MAX(points - 1, 0) WHERE address = ?").run(post.author);
  } else if (event.name === "PostReposted") {
    db.prepare("UPDATE posts SET repost_count = repost_count + 1 WHERE id = ?").run(post.id);
    db.prepare("UPDATE users SET points = points + 2 WHERE address = ?").run(post.author);
    notify(post.author, "repost", a.reposter, post.id);
  } else if (event.name === "Tipped") {
    const amount = a.amount.toString();
    db.prepare("UPDATE posts SET tips_received = CAST(tips_received AS INTEGER) + ? WHERE id = ?").run(amount, post.id);
    notify(post.author, "tip", a.from, post.id, amount);
  }
}

async function tick() {
  const latest = await provider.getBlockNumber();
  const saved = db.prepare("SELECT value FROM indexer_state WHERE key = ?").get(STATE_KEY);
  let from = saved ? Number(saved.value) + 1 : (DEPLOY_BLOCK || latest);
  if (from > latest) return;

  while (from <= latest) {
    const to = Math.min(from + RANGE - 1, latest);
    const logs = await provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock: from, toBlock: to });
    const parsed = logs.map(log => ({ log, parsed: iface.parseLog(log) })).filter(x => x.parsed);
    db.transaction(() => parsed.forEach(x => handle(x.parsed, x.log)))();
    db.prepare("INSERT INTO indexer_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(STATE_KEY, String(to));
    console.log(`Indexed blocks ${from}-${to}, ${parsed.length} ArcYard events`);
    from = to + 1;
  }
}

let running = false;
async function run() {
  if (running) return;
  running = true;
  try { await tick(); } catch (err) { console.error("Indexer tick failed:", err.message); }
  finally { running = false; }
}

console.log(`ArcYard indexer starting for ${CONTRACT_ADDRESS} via ${RPC_URL}`);
run();
setInterval(run, POLL_MS);
