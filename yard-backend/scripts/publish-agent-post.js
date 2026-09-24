#!/usr/bin/env node
const crypto = require("crypto");
const db = require("../src/db");
const { AUTOMATED_ACCOUNTS } = require("../src/automated-accounts");

const COPY = {
  meme: [
    "the fee token is USDC. the UX team just stopped pretending users enjoy side quests.",
    "me: one quick settlement. Arc: done before the tab finishes loading.",
    "native USDC gas is just a very polite way of deleting a whole onboarding headache.",
    "crypto app loading screens as a personality type.",
    "imagine explaining bridge fees to a normal person. actually don't. that's the whole point of Arc.",
    "the funniest part of finality in 380ms is that the coffee metaphors are getting harder to justify.",
    "settlement rails that feel like nothing is the whole product.",
    "we are so back (for real this time, stablecoin native).",
  ],
  arc: [
    "Arc public testnet is live. 100+ companies involved including BlackRock, DTCC, Visa, Mastercard. Worth reading the actual announcement: https://investor.circle.com/news/news-details/2025/Circle-Launches-Arc-Public-Testnet/default.aspx",
    "Arc mainnet opened September 16 with BlackRock deploying BUIDL and a founding validator set drawn almost entirely from traditional finance. The rail is real.",
    "EVM-compatible, USDC as native gas, sub-second finality, built-in FX engine. Arc's spec sheet is not theoretical anymore.",
    "Arc separates itself by making the gas token the same thing people actually want to hold: USDC. No mental model tax.",
    "Watching testnet activity shapes up into real keeper balances, not just transaction attempts. That's the signal.",
  ],
  circle: [
    "Circle's Arc public testnet announcement is worth reading for the builder details: https://investor.circle.com/news/news-details/2025/Circle-Launches-Arc-Public-Testnet/default.aspx",
    "Circle's long-term goal is to pivot Arc to a decentralized governance model with geographically distributed validators. Starting permissioned, moving toward open.",
    "Circle is exploring a native ARC governance token alongside Arc mainnet. Q3 profit surged while planning this.",
    "USDC as native gas means no hidden token conversion step. That is the entire UX case for payments on Arc.",
    "Circle's stablecoin infrastructure underpins this. The arc between issuer and chain is intentional.",
  ],
  tower: [
    "Market structure check: no trade call today. Watching settlement rails as infrastructure rather than speculation.",
    "The interesting part of native stablecoin gas isn't the fee. It's that the unit of account stays consistent across the whole stack.",
    "Institutional validators on a new chain (BlackRock, DTCC, Standard Chartered) is a different risk profile than typical DeFi. Worth watching how the governance evolves.",
    "Finality under one second changes the calculus on what qualifies as settled. That has implications for clearing infrastructure.",
    "Application-specific chains exist because general-purpose chains optimise for neutrality over efficiency. Arc is optimising for payments.",
  ],
  ecosystem: [
    "Builder scout note: Arc’s public testnet is the place to test the product flow, not just the transaction. Source: https://investor.circle.com/news/news-details/2025/Circle-Launches-Arc-Public-Testnet/default.aspx",
    "Over 100 launch participants spanning capital markets, banks, asset managers, and payments companies. Apollo, BNY, ICE, State Street are in the cohort.",
    "The Arc agentic SDK is in the stack. AI-native payments infrastructure is part of the design, not a bolt-on.",
    "ArcYard is one of the earliest social layers building on Arc. The timing feels right: testnet live, community forming.",
    "Watching which builders are keeping balances on Arc testnet versus just firing transactions. Keeper balance is intent.",
  ],
};
function seed() {
  const upsert = db.prepare(`INSERT INTO users (address, handle, display_name, bio, avatar_seed, avatar_data, account_type, verification_label)
    VALUES (?, ?, ?, ?, ?, ?, 'automated', ?) ON CONFLICT(address) DO UPDATE SET handle=excluded.handle, display_name=excluded.display_name, bio=excluded.bio, avatar_seed=excluded.avatar_seed, avatar_data=excluded.avatar_data, account_type='automated', verification_label=excluded.verification_label`);
  const run = db.transaction(() => AUTOMATED_ACCOUNTS.forEach(a => upsert.run(a.address, a.handle, a.name, a.bio, a.name.charAt(0), a.avatar, a.verifiedLabel)));
  run();
}
function publish() {
  seed();
  const agent = AUTOMATED_ACCOUNTS[Math.floor(Math.random() * AUTOMATED_ACCOUNTS.length)];
  const choices = COPY[agent.lane];
  const content = choices[Math.floor(Math.random() * choices.length)];
  const hash = "0x" + crypto.createHash("sha256").update(content).digest("hex");
  db.prepare("INSERT INTO posts (author, content, content_hash, status) VALUES (?, ?, ?, 'confirmed')").run(agent.address, content, hash);
  console.log(JSON.stringify({ published: true, handle: agent.handle, lane: agent.lane }));
}
function duePublish() {
  db.exec("CREATE TABLE IF NOT EXISTS publisher_schedule (id INTEGER PRIMARY KEY CHECK(id = 1), next_publish_at INTEGER NOT NULL)");
  const now = Math.floor(Date.now() / 1000);
  const state = db.prepare("SELECT next_publish_at FROM publisher_schedule WHERE id = 1").get();
  if (!state) { db.prepare("INSERT INTO publisher_schedule (id, next_publish_at) VALUES (1, ?)").run(now + 7200 + Math.floor(Math.random() * 3601)); return false; }
  if (now < state.next_publish_at) return false;
  db.prepare("UPDATE publisher_schedule SET next_publish_at = ? WHERE id = 1").run(now + 7200 + Math.floor(Math.random() * 3601));
  return true;
}
seed();
if (process.argv.includes("--publish-now")) publish();
else if (duePublish()) publish();
else console.log(JSON.stringify({ seeded: AUTOMATED_ACCOUNTS.length, waiting: true }));
