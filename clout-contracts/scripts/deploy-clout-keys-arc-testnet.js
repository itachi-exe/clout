const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 5042002n) {
    throw new Error(`Refusing deployment: expected Arc Testnet 5042002, got ${network.chainId}`);
  }

  // Treasury must be explicit. Never silently route creator-key fees to a generated deployer.
  const treasury = process.env.CLOUT_TREASURY;
  if (!treasury || !hre.ethers.isAddress(treasury)) {
    throw new Error("CLOUT_TREASURY must be a valid explicit address before deployment");
  }

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 Arc Testnet USDC for gas. Fund it before deployment.`);
  }

  const CloutKeys = await hre.ethers.getContractFactory("CloutKeys");
  const contract = await CloutKeys.deploy(treasury);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = await deployTx.wait(2);

  const record = {
    contract: "CloutKeys",
    network: "Arc Testnet",
    chainId: Number(network.chainId),
    address,
    treasury,
    deployer: deployer.address,
    transactionHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    explorer: `https://explorer.testnet.arc.io/address/${address}`,
    deployedAt: new Date().toISOString()
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "arc-testnet-keys.json"), JSON.stringify(record, null, 2) + "\n");
  console.log(JSON.stringify(record, null, 2));
}

main().catch(err => { console.error(err.message); process.exit(1); });
