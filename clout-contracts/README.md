# Clout contract deployment

The web product is live at https://cloutonarc.fun.

## Network, verified against live Arc RPCs

- Network: Arc Testnet
- Chain ID: `5042002` (`0x4cef52`)
- Official RPC: `https://rpc.testnet.arc.io`
- Explorer: `https://explorer.testnet.arc.io`
- Gas token: native USDC, 18 decimals

## Contract status

`contracts/Clout.sol` is compiled and has 11 passing local EVM tests.

The deploy script is deliberately fail-safe:

```bash
export CLOUT_TREASURY=0xYOUR_TREASURY_ADDRESS
npx hardhat run scripts/deploy-clout-arc-testnet.js --network arcTestnet
```

It refuses to deploy unless:

1. The network is exactly Arc Testnet (5042002).
2. `CLOUT_TREASURY` is an explicit valid address.
3. The deployer has native testnet USDC gas.

## Current deployment blocker

Deployer address: `0x33DfbAF10Dba3655a46d655a14CF6F5A86Cd2e24`

Balance was checked against the live official RPC on 2026-09-22 and is `0.0` native testnet USDC. Fund it from https://faucet.circle.com, then choose the address that should receive the contract's 2.5% protocol tip fee as `CLOUT_TREASURY`.

## After deployment

The deploy script writes `deployments/arc-testnet.json` with the contract address, transaction hash, block, and explorer link. Configure the backend with:

```dotenv
CLOUT_CONTRACT_ADDRESS=0xDEPLOYED_CONTRACT
CLOUT_DEPLOY_BLOCK=DEPLOYMENT_BLOCK
ARC_RPC_URL=https://rpc.testnet.arc.io
```

Then start `src/indexer.js`. It polls contract events idempotently, anchors matching off-chain posts by content hash, and indexes likes, reposts, tips, notifications, and reputation changes.
