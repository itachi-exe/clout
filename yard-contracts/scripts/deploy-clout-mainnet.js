const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 5042n) {
    throw new Error(`Refusing: expected Arc Mainnet 5042, got ${network.chainId}`);
  }

  const treasury = deployer.address; // deployer is treasury on launch
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "USDC");

  // Deploy Clout.sol
  const Clout = await hre.ethers.getContractFactory("Clout");
  const clout = await Clout.deploy();
  await clout.waitForDeployment();
  const cloutAddr = await clout.getAddress();
  const cloutTx = clout.deploymentTransaction();
  const cloutReceipt = await cloutTx.wait(2);
  console.log("Clout deployed:", cloutAddr);

  // Deploy CloutPostShares.sol
  const CloutPostShares = await hre.ethers.getContractFactory("CloutPostShares");
  const shares = await CloutPostShares.deploy(cloutAddr, treasury);
  await shares.waitForDeployment();
  const sharesAddr = await shares.getAddress();
  const sharesTx = shares.deploymentTransaction();
  const sharesReceipt = await sharesTx.wait(2);
  console.log("CloutPostShares deployed:", sharesAddr);

  // Deploy CloutKeys (ArcYardKeys renamed)
  const CloutKeys = await hre.ethers.getContractFactory("ArcYardKeys");
  const keys = await CloutKeys.deploy(treasury);
  await keys.waitForDeployment();
  const keysAddr = await keys.getAddress();
  const keysTx = keys.deploymentTransaction();
  const keysReceipt = await keysTx.wait(2);
  console.log("CloutKeys deployed:", keysAddr);

  const record = {
    network: "Arc Mainnet",
    chainId: 5042,
    deployer: deployer.address,
    treasury,
    deployedAt: new Date().toISOString(),
    contracts: {
      Clout: { address: cloutAddr, tx: cloutTx.hash, block: cloutReceipt.blockNumber, explorer: `https://explorer.arc.io/address/${cloutAddr}` },
      CloutPostShares: { address: sharesAddr, tx: sharesTx.hash, block: sharesReceipt.blockNumber, explorer: `https://explorer.arc.io/address/${sharesAddr}` },
      CloutKeys: { address: keysAddr, tx: keysTx.hash, block: keysReceipt.blockNumber, explorer: `https://explorer.arc.io/address/${keysAddr}` },
    }
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "arc-mainnet.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
