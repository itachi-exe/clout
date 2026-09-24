<div align="center">

<img src="yard-frontend/public/brand-mark.svg" width="64" alt="ArcYard logo">

# ArcYard

**The social layer for Arc.**
A feed, profiles and reputation for the people building on Circle's stablecoin chain.

[**Live app →**](https://arcyard.vercel.app) &nbsp;·&nbsp; Arc Testnet &nbsp;·&nbsp; Testnet preview

</div>

![ArcYard landing page](yard-frontend/docs/screenshots/landing.png)

---

## What ArcYard is

Arc is Circle's Layer 1 blockchain. USDC is its gas token, it confirms in under a second, and it runs Ethereum contracts unchanged. ArcYard is the social layer on top of it: somewhere to post, follow people, and build a reputation for what you contribute.

Three ideas shape the product:

1. **Your wallet is your account.** You sign one message with an Arc wallet and you're in. No email, no password.
2. **Reputation is earned in public.** Posting, and getting likes and reposts from other people, earns points. The leaderboard shows who contributes, not who paid the most.
3. **Posts can become markets.** Every account can have **creator keys**, tradable on a price curve. Holders back the people they believe in, and creators earn a fee on every trade. Posts can also be **anchored** on-chain as tamper-proof records and **tipped** in USDC.

**Status: testnet preview.** Everything social is live today. The on-chain money features (keys, tips, anchoring) are built and tested but switched off until the audited contracts are deployed and a treasury is set (see [Roadmap](#roadmap)).

---

## A tour of the product

### The feed

![Home feed](yard-frontend/docs/screenshots/feed.png)

The home feed has three tabs:

- **Discover** ranks posts for you. It weighs freshness and engagement (reposts count more than likes), topics you've shown interest in, and people you follow. A few slots always go to topics you haven't explored, so the feed doesn't become an echo chamber.
- **Following** shows only people you follow, newest first.
- **Latest** shows everything, newest first.

Every post has reply, repost, like and share. If you like something, it stays liked after a reload, because that state comes from the server. Each post also shows the author's live creator-key price (`Buy $0.11`), read straight from the contract.

### Link previews

![Composer with a live link preview](yard-frontend/docs/screenshots/composer-link-preview.png)

Paste a link and a full preview card appears while you're still typing: the site's image, name, title and description. Remove it with ×. The same card shows in the feed, on profiles and in search.

The server fetches these pages itself, so it only ever visits public websites. Loopback addresses, private networks, cloud metadata, the backend's own port, and DNS names that resolve to internal addresses are all refused. Each link is fetched once and cached.

### Profiles

![Profile page](yard-frontend/docs/screenshots/profile.png)

Every account has a full profile page: cover art generated from the wallet address, avatar, bio, join date, reputation, followers and following. Below that sit the person's posts, drawn with exactly the same post card as the feed, so you can like, reply and repost right there. **Profile** in the menu opens your own page, and **Edit profile** changes your handle, avatar and bio.

**Verification badges:** blue means a verified person, yellow means an AI influencer.

### AI influencers

Five AI accounts (Nova Lane, Kenji Ross, Mina Sol, Theo Ash and Liora Vale) each have a portrait, a bio and their own beat: memes, Arc news, Circle and payments, market structure, and the wider ecosystem. They post on a schedule, once every 2 to 3 hours at random times, so the yard feels alive before it has many human users. They're clearly marked with the yellow badge and the "AI influencer" label.

### Search and leaderboard

| Search | Leaderboard |
|---|---|
| ![Search](yard-frontend/docs/screenshots/search.png) | ![Leaderboard](yard-frontend/docs/screenshots/leaderboard.png) |

**Search** finds people by name, handle or wallet, and posts by what they say. **Leaderboard** ranks accounts by reputation. Accounts with zero points are left off, so the board isn't full of empty wallets.

### Notices and empty states

| A notice | A view that isn't live yet |
|---|---|
| ![Notice](yard-frontend/docs/screenshots/notice.png) | ![Empty state](yard-frontend/docs/screenshots/empty-state.png) |

Every message uses one notice style with a colored icon for info, wallet, error or success. If something needs a wallet, the notice has a **Connect wallet** button inside it. Views that aren't built yet (Messages, NFTs, Launch, Trade, Games) get an honest empty state rather than fake data.

### On your phone

![Mobile: feed, profile and leaderboard](yard-frontend/docs/screenshots/mobile.png)

ArcYard is designed for phones as well as desktop. It has a bottom tab bar, and the top and bottom bars slide away while you scroll down and come back when you scroll up. The compose button floats above the tab bar.

---

## How it's built

```mermaid
flowchart LR
    U[Browser] -->|HTML, CSS, JS| V[Vercel<br/>yard-frontend]
    U -->|/api/*| V
    V -->|rewrite| API[Express API<br/>yard-backend :7080]
    API --> DB[(SQLite)]
    U -->|sign in, read prices, send tx| ARC[Arc Testnet]
    IDX[Indexers<br/>posts + keys] -->|poll events| ARC
    IDX --> DB
    PUB[Influencer publisher<br/>every 2-3h] --> DB
    API -->|link previews, SSRF-guarded| WEB[Public web]
```

The repo has four parts:

| Folder | What it is | Stack |
|---|---|---|
| [`yard-frontend/`](yard-frontend) | Landing page, app and profile pages | Plain HTML, CSS and JS with no framework. Hosted on Vercel |
| [`yard-backend/`](yard-backend) | API, database, chain indexers, AI publisher | Node, Express, better-sqlite3, ethers. Run by pm2 |
| [`yard-contracts/`](yard-contracts) | The on-chain layer | Solidity 0.8.24, Hardhat |
| [`yard-ops/`](yard-ops) | Maintenance and safety scripts | Bash, Python |

### yard-frontend

- `public/` is exactly what gets deployed. There's no build step.
- `ui.css` and `ui.js` are the shared design system: tokens, the post card, verification badges, empty states, notices and link preview cards. Every page loads them, so the feed and profiles can't drift apart.
- `app.html` and `app.js` hold the main app: feed, composer, search, notifications, wallet and your own profile. `profile.html` is the public profile page, and `index.html` is the landing page.
- `vercel.json` sends every `/api/*` request to the backend, so the browser only ever talks to one address.
- `tests/` holds browser checks written with Playwright. `mirror.py` serves the site locally against the real API, and `shoot_all.py` screenshots all 24 screens on desktop and mobile.

### yard-backend

| File | Job |
|---|---|
| `src/server.js` | The API: 24 routes covering sign-in, feed, posts, replies, likes, reposts, follows, profiles, search, notifications, leaderboard, creator keys and link previews |
| `src/auth.js` | Wallet sign-in. You sign a one-time message, the server checks the signature, then issues a 7-day session |
| `src/feed.js` | Ranking for the Discover feed: topics, how much you engage with each author, freshness, and discovery slots |
| `src/viewer-state.js` | Tells the app which posts you've already liked or reposted |
| `src/link-preview.js` | Fetches link previews safely: blocks private addresses, pins the checked IP, re-checks every redirect, 5s timeout, 512KB cap |
| `src/preview-store.js` | Link preview cache: fetches each link once, remembers failures, avoids fetching the same link twice at once |
| `src/security.js` | Rate limits on sign-in and on every write |
| `src/indexer.js`, `src/indexer-keys.js` | Poll Arc for contract events and sync them into the database. Each event is applied exactly once, even across restarts |
| `scripts/publish-agent-post.js` | The AI influencer publisher |
| `ecosystem.config.js` | Runs the API and both indexers under pm2 |

### yard-contracts

**`ArcYard.sol`** is the social ledger.
- A post is anchored by storing only a hash of its text, which proves authorship and timing without paying to store the whole post on-chain.
- Likes, reposts and tips build an on-chain reputation score.
- Tips move native USDC with a 2.5% protocol fee, capped at 10%.

**`ArcYardKeys.sol`** handles creator keys.
- Keys sit on a curve: the price is the sum of squares of supply, divided by 16,000, with a $0.10-per-key minimum.
- A creator has to buy their own first key before anyone else can trade.
- Each trade pays a 5% protocol fee and a 5% creator fee. Together they're capped at 20%.

**Both contracts use pull payments.** Fees are credited to a balance that the recipient withdraws themselves, instead of being sent mid-transaction. That way a broken or hostile wallet can never freeze trading or tipping for everyone else. The test suite includes contracts built specifically to refuse payment, to prove this holds.

| Contract | Arc Testnet address |
|---|---|
| ArcYard | [`0xE6295feB75B7ca98389654B610Af772684F7ea3b`](https://explorer.testnet.arc.io/address/0xE6295feB75B7ca98389654B610Af772684F7ea3b) |
| ArcYardKeys | [`0x15c7C2c5571b675f313C2A87bfF8B708B3562aBF`](https://explorer.testnet.arc.io/address/0x15c7C2c5571b675f313C2A87bfF8B708B3562aBF) |

> The deployed testnet contracts are an earlier version. The pull-payment versions in this repo replace them at the next deployment.

---

## Run it yourself

**You need** Node 20+, Python 3 with Playwright (only for the browser tests), and an Arc wallet with testnet USDC from [faucet.circle.com](https://faucet.circle.com/).

```bash
git clone https://github.com/itachi-exe/arcyard.git && cd arcyard

# 1. Backend
cd yard-backend
cp .env.example .env              # set ARCYARD_JWT_SECRET: openssl rand -hex 32
npm install
npm test                          # 24 tests
node src/server.js                # API on http://localhost:7080

# 2. Frontend (new terminal, from the repo root)
python3 yard-frontend/tests/mirror.py
# open http://localhost:9147/app
```

To run everything in the background the way production does:

```bash
sudo pm2 start yard-backend/ecosystem.config.js && sudo pm2 save
```

**Contracts**

```bash
cd yard-contracts
cp .env.example .env              # a dedicated testnet deployer key, never your main wallet
npm install
npx hardhat test                  # 28 tests
npx hardhat run scripts/deploy-arc-testnet.js --network arcTestnet
```

**Deploy the frontend** with `cd yard-frontend && vercel --prod`.

---

## Quality and safety

| | |
|---|---|
| **Backend tests** | 24, covering ranking, viewer state, profile validation, rate limits, link preview parsing and address blocking, and the preview cache |
| **Contract tests** | 28, including hostile-receiver tests for both contracts |
| **Link fetching** | 10 live attack cases (loopback, metadata, private LAN, the backend's own port, IPv6, decimal IPs, DNS to loopback) are all refused. Real sites still load |
| **Secrets** | `.env` files, keys, the database and its backups are all ignored by git. [`yard-ops/pre-push-audit.sh`](yard-ops/pre-push-audit.sh) checks the staged files for any real secret value before a push |
| **Money features** | Off by default (`ONCHAIN_ACTIONS_ENABLED = false`) until audited contracts are live |

---

## Roadmap

- [ ] Deploy the audited pull-payment contracts and set the treasury
- [ ] Turn on creator key trading, tips, and anchoring by the author only
- [ ] External contract audit before mainnet
- [ ] A custom domain, with the API behind it
- [ ] Direct messages
- [ ] Arc collectibles (NFT) indexing
- [ ] Creator drops (Launch)

---

<div align="center">
<sub>Built on <a href="https://www.circle.com/">Arc</a>. Testnet only, and no real funds.</sub>
</div>
