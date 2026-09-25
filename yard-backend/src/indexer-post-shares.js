require("dotenv").config();
const { ethers } = require("ethers");
const db = require("./db");

/*
 * CloutPostShares chain event indexer.
 *
 * Listens for PostShareTrade events on the CloutPostShares contract and
 * mirrors them into post_shares, post_share_holdings, and post_share_trades.
 * HTTP polling — no websocket required.
 */
const RPC_URL       = process.env.ARC_RPC_URL                  || "https://rpc.testnet.arc.io";
const CONTRACT_ADDR = process.env.CLOUT_POST_SHARES_ADDRESS;
const DEPLOY_BLOCK  = Number(process.env.CLOUT_POST_SHARES_DEPLOY_BLOCK || 0);
const POLL_MS       = Number(process.env.ARC_INDEXER_POLL_MS   || 12_000);
const RANGE         = 500;
const STATE_KEY     = "clout_post_shares:last-indexed-block";

const ABI = [
  "event PostShareTrade(address indexed trader, uint256 indexed postId, address indexed author, bool isBuy, uint256 shareAmount, uint256 usdcAmount, uint256 protocolFee, uint256 authorFee, uint256 supply)"
];

if (!CONTRACT_ADDR) {
  console.log("CloutPostShares indexer idle: CLOUT_POST_SHARES_ADDRESS is not configured yet");
  process.exit(0);
}
if (!ethers.isAddress(CONTRACT_ADDR)) throw new Error("Invalid CLOUT_POST_SHARES_ADDRESS");

const provider = new ethers.JsonRpcProvider(RPC_URL, 5042, { staticNetwork: true });
const contract  = new ethers.Contract(CONTRACT_ADDR, ABI, provider);
const iface     = new ethers.Interface(ABI);

function alreadyHandled(log, name) {
  const inserted = db.prepare(
    "INSERT OR IGNORE INTO chain_events (tx_hash, log_index, block_number, event_name) VALUES (?, ?, ?, ?)"
  ).run(log.transactionHash, log.index, log.blockNumber, name);
  return inserted.changes === 0;
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

// Map chain postId -> db post.id
function postByChainId(chainPostId) {
  return db.prepare("SELECT * FROM posts WHERE chain_post_id = ?").get(Number(chainPostId));
}

function handle(event, log) {
  if (alreadyHandled(log, event.name)) return;
  if (event.name !== "PostShareTrade") return;

  const a         = event.args;
  const trader    = a.trader.toLowerCase();
  const author    = a.author.toLowerCase();
  const isBuy     = a.isBuy;
  const chainPost = Number(a.postId);
  const shares    = Number(a.shareAmount);
  const usdc      = a.usdcAmount.toString();
  const supply    = Number(a.supply);

  ensureUser(trader);
  ensureUser(author);

  const post = postByChainId(chainPost);
  const dbPostId = post ? post.id : null;

  // Upsert post_shares market record
  db.prepare(`
    INSERT INTO post_shares (post_id, chain_post_id, supply, last_price, updated_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(post_id) DO UPDATE SET
      supply     = excluded.supply,
      last_price = excluded.last_price,
      updated_at = unixepoch()
  `).run(dbPostId ?? chainPost, chainPost, supply, usdc);

  // Update holder balance
  if (isBuy) {
    db.prepare(`
      INSERT INTO post_share_holdings (post_id, holder, balance)
      VALUES (?, ?, ?)
      ON CONFLICT(post_id, holder) DO UPDATE SET balance = balance + excluded.balance
    `).run(dbPostId ?? chainPost, trader, shares);
  } else {
    db.prepare(`
      UPDATE post_share_holdings SET balance = MAX(balance - ?, 0)
      WHERE post_id = ? AND holder = ?
    `).run(shares, dbPostId ?? chainPost, trader);
  }

  // Record trade
  db.prepare(`
    INSERT INTO post_share_trades
      (trader, post_id, author, is_buy, share_amount, usdc_amount, supply_after, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(trader, dbPostId ?? chainPost, author, isBuy ? 1 : 0, shares, usdc, supply, log.transactionHash);

  // Notify post author when someone buys their shares
  if (isBuy && dbPostId) {
    notify(author, "share_buy", trader, dbPostId, usdc);
  }
}

async function tick() {
  const latest = await provider.getBlockNumber();
  const saved  = db.prepare("SELECT value FROM indexer_state WHERE key = ?").get(STATE_KEY);
  let from     = saved ? Number(saved.value) + 1 : (DEPLOY_BLOCK || latest);
  if (from > latest) return;

  while (from <= latest) {
    const to   = Math.min(from + RANGE - 1, latest);
    const logs = await provider.getLogs({ address: CONTRACT_ADDR, fromBlock: from, toBlock: to });
    const parsed = logs.map(log => ({ log, parsed: iface.parseLog(log) })).filter(x => x.parsed);
    db.transaction(() => parsed.forEach(x => handle(x.parsed, x.log)))();
    db.prepare("INSERT INTO indexer_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(STATE_KEY, String(to));
    if (parsed.length) console.log(`Indexed blocks ${from}-${to}, ${parsed.length} PostShareTrade events`);
    from = to + 1;
  }
}

let running = false;
async function run() {
  if (running) return;
  running = true;
  try { await tick(); } catch (err) { console.error("PostShares indexer tick failed:", err.message); }
  finally { running = false; }
}

console.log(`CloutPostShares indexer starting for ${CONTRACT_ADDR} via ${RPC_URL}`);
run();
setInterval(run, POLL_MS);
