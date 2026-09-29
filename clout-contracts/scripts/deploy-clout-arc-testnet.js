const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 5042002n) {
    throw new Error(`Refusing deployment: expected Arc Testnet 5042002, got ${network.chainId}`);
  }

  const treasury = process.env.CLOUT_TREASURY;
  if (!treasury || !hre.ethers.isAddress(treasury)) {
    throw new Error("CLOUT_TREASURY must be a valid explicit address before deployment");
  }

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 Arc Testnet USDC for gas. Fund it before deployment.`);
  }

  // --- Deploy Clout (social layer, no tips) ---
  const Clout = await hre.ethers.getContractFactory("Clout");
  const clout = await Clout.deploy();
  await clout.waitForDeployment();
  const cloutAddress = await clout.getAddress();
  const cloutTx = clout.deploymentTransaction();
  const cloutReceipt = await cloutTx.wait(2);
  console.log("Clout deployed:", cloutAddress);

  // --- Deploy CloutPostShares (bonding-curve post shares) ---
  const CloutPostShares = await hre.ethers.getContractFactory("CloutPostShares");
  const shares = await CloutPostShares.deploy(cloutAddress, treasury);
  await shares.waitForDeployment();
  const sharesAddress = await shares.getAddress();
  const sharesTx = shares.deploymentTransaction();
  const sharesReceipt = await sharesTx.wait(2);
  console.log("CloutPostShares deployed:", sharesAddress);

  const record = {
    network: "Arc Testnet",
    chainId: Number(network.chainId),
    deployer: deployer.address,
    treasury,
    deployedAt: new Date().toISOString(),
    contracts: {
      Clout: {
        address: cloutAddress,
        transactionHash: cloutTx.hash,
        blockNumber: cloutReceipt.blockNumber,
        explorer: `https://explorer.testnet.arc.io/address/${cloutAddress}`,
      },
      CloutPostShares: {
        address: sharesAddress,
        transactionHash: sharesTx.hash,
        blockNumber: sharesReceipt.blockNumber,
        explorer: `https://explorer.testnet.arc.io/address/${sharesAddress}`,
      },
    },
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "arc-testnet.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
