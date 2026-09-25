require("dotenv").config();
const { ethers } = require("ethers");
const db = require("./db");

/*
 * ArcYardKeys chain event indexer.
 *
 * Separate process from indexer.js on purpose: two contracts, two independent
 * poll loops, so a stall or bug in one never blocks the other. Same idempotent
 * chain_events pattern (tx_hash + log_index primary key) as the ArcYard indexer.
 */
const RPC_URL = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = process.env.ARCYARD_KEYS_CONTRACT_ADDRESS;
const DEPLOY_BLOCK = Number(process.env.ARCYARD_KEYS_DEPLOY_BLOCK || 0);
const POLL_MS = Number(process.env.ARC_INDEXER_POLL_MS || 12_000);
const RANGE = 500;
const STATE_KEY = "arcyardkeys:last-indexed-block";

const ABI = [
  "event Trade(address indexed trader, address indexed creator, bool isBuy, uint256 keyAmount, uint256 usdcAmount, uint256 protocolFee, uint256 creatorFee, uint256 supply)"
];

if (!CONTRACT_ADDRESS) {
  console.log("ArcYardKeys indexer idle: ARCYARD_KEYS_CONTRACT_ADDRESS is not configured yet");
  process.exit(0);
}
if (!ethers.isAddress(CONTRACT_ADDRESS)) throw new Error("Invalid ARCYARD_KEYS_CONTRACT_ADDRESS");

const provider = new ethers.JsonRpcProvider(RPC_URL, 5042, { staticNetwork: true });
const iface = new ethers.Interface(ABI);

function alreadyHandled(log, name) {
  const inserted = db.prepare(
    "INSERT OR IGNORE INTO chain_events (tx_hash, log_index, block_number, event_name) VALUES (?, ?, ?, ?)"
  ).run(log.transactionHash, log.index, log.blockNumber, "keys:" + name);
  return inserted.changes === 0;
}

function ensureUser(address) {
  db.prepare("INSERT OR IGNORE INTO users (address) VALUES (?)").run(address.toLowerCase());
}

function notify(recipient, kind, actor, amount) {
  if (recipient.toLowerCase() === actor.toLowerCase()) return;
  db.prepare(
    "INSERT INTO notifications (recipient, kind, actor, amount) VALUES (?, ?, ?, ?)"
  ).run(recipient.toLowerCase(), kind, actor.toLowerCase(), amount);
}

function handle(event, log) {
  if (alreadyHandled(log, event.name)) return;
  if (event.name !== "Trade") return;
  const a = event.args;

  const trader = a.trader.toLowerCase();
  const creator = a.creator.toLowerCase();
  const isBuy = Boolean(a.isBuy);
  const keyAmount = Number(a.keyAmount);
  const usdcAmount = a.usdcAmount.toString();
  const supply = Number(a.supply);

  ensureUser(trader);
  ensureUser(creator);

  db.prepare(
    `INSERT INTO creator_keys (creator, supply, last_price, updated_at) VALUES (?, ?, ?, unixepoch())
     ON CONFLICT(creator) DO UPDATE SET supply = excluded.supply, last_price = excluded.last_price, updated_at = unixepoch()`
  ).run(creator, supply, usdcAmount);

  const delta = isBuy ? keyAmount : -keyAmount;
  db.prepare(
    `INSERT INTO key_holdings (creator, holder, balance) VALUES (?, ?, ?)
     ON CONFLICT(creator, holder) DO UPDATE SET balance = balance + excluded.balance`
  ).run(creator, trader, delta);

  db.prepare(
    `INSERT INTO key_trades (trader, creator, is_buy, key_amount, usdc_amount, supply_after, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(trader, creator, isBuy ? 1 : 0, keyAmount, usdcAmount, supply, log.transactionHash);

  if (trader !== creator) notify(creator, isBuy ? "key_buy" : "key_sell", trader, usdcAmount);
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
    console.log(`ArcYardKeys indexed blocks ${from}-${to}, ${parsed.length} trade events`);
    from = to + 1;
  }
}

let running = false;
async function run() {
  if (running) return;
  running = true;
  try { await tick(); } catch (err) { console.error("ArcYardKeys indexer tick failed:", err.message); }
  finally { running = false; }
}

console.log(`ArcYardKeys indexer starting for ${CONTRACT_ADDRESS} via ${RPC_URL}`);
run();
setInterval(run, POLL_MS);
