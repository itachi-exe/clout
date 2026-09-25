require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("dotenv").config({ path: "./keys/mainnet-deployer.env", override: false });

const DEPLOYER_KEY = process.env.ARCYARD_DEPLOYER_KEY || "0x" + "11".repeat(32);
const MAINNET_DEPLOYER_KEY = process.env.ARCYARD_MAINNET_DEPLOYER_KEY || "0x" + "11".repeat(32);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    arcTestnet: {
      url: "https://rpc.testnet.arc.io",
      chainId: 5042002, // Arc Testnet — verified live against the node, never share a deployer key with mainnet
      accounts: [DEPLOYER_KEY],
    },
    arcMainnet: {
      // Verified live 2026-09-23 via eth_chainId against https://rpc.mainnet.arc.io.
      // 5042 vs testnet's 5042002 — deliberately distinct so a copy-paste mistake fails loudly
      // instead of silently signing a mainnet transaction with a testnet key or vice versa.
      url: process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io",
      chainId: 5042,
      accounts: [MAINNET_DEPLOYER_KEY],
    },
  },
};
