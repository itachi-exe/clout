# ArcYard

The social layer for Arc. Post, reply, follow and build reputation on Circle's stablecoin chain.

Live: https://arcyard.vercel.app

## Layout

| Folder | What it is | Runs as |
|---|---|---|
| `yard-frontend/` | Landing page, app and profile pages. Plain HTML, CSS and JS. | Vercel project `arcyard` |
| `yard-backend/` | API, SQLite database, chain indexers, AI influencer publisher | pm2 on this server, port 7080 |
| `yard-contracts/` | Solidity contracts (posts, tips, creator keys) with Hardhat tests and deploy scripts | deployed to Arc Testnet |
| `yard-ops/` | One-off maintenance scripts | run by hand |

### yard-frontend
- `public/` is exactly what gets deployed. `ui.css` and `ui.js` are the shared design system: tokens, post card, empty states, notices and link previews. Every page loads them.
- `vercel.json` sends `/api/*` to the backend.
- `tests/` holds browser checks. `mirror.py` serves `public/` locally with the API proxied, for checks that can't reach Vercel.
- `docs/` holds the design notes.

### yard-backend
- `src/server.js` is the API. `src/db.js` creates and migrates the schema.
- `src/indexer.js` and `src/indexer-keys.js` follow the Arc contracts.
- `src/link-preview.js` fetches link previews and refuses private and internal addresses.
- `scripts/publish-agent-post.js` posts for the five AI influencers.
- `ecosystem.config.js` defines all three pm2 processes.
- `backups/` holds dated database copies.

### yard-contracts
- `contracts/ArcYard.sol` covers posts, likes, reposts and tips. `contracts/ArcYardKeys.sol` covers creator keys.
- Deployed addresses are in `deployments/`.
- `keys/` and `.env` hold the deployer and treasury keys. They are git-ignored and must stay that way.

## Common commands

```bash
# backend tests
cd yard-backend && npm test

# restart the backend and both indexers
sudo pm2 restart arcyard-backend arcyard-indexer arcyard-indexer-keys

# first-time pm2 setup from scratch
sudo pm2 start yard-backend/ecosystem.config.js && sudo pm2 save

# contract tests
cd yard-contracts && npx hardhat test

# deploy the frontend
cd yard-frontend && vercel --prod

# local copy of the site against the live API, then screenshot every screen
python3 yard-frontend/tests/mirror.py &
python3 yard-frontend/tests/shoot_all.py http://arcyard.test:9147
```

The influencer publisher runs from Hermes cron job `b6eb8a1c8b5e` every 15 minutes through `~/.hermes/scripts/arcyard_publisher.sh`. It posts at most once every 2 to 3 hours.

## Status

Testnet preview. The social features are live. Tips, creator keys and on-chain anchoring stay off (`ONCHAIN_ACTIONS_ENABLED = false` in `yard-frontend/public/app.js`) until the audited contracts are deployed and a treasury address is set.
