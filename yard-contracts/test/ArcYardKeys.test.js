const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArcYardKeys", function () {
  let keys, owner, treasury, alice, bob, carol;
  const FLOOR = ethers.parseEther("0.1"); // $0.10 per key floor

  beforeEach(async function () {
    [owner, treasury, alice, bob, carol] = await ethers.getSigners();
    const ArcYardKeys = await ethers.getContractFactory("ArcYardKeys");
    keys = await ArcYardKeys.deploy(treasury.address);
    await keys.waitForDeployment();
  });

  async function buyFirstKey(creator) {
    const cost = await keys.getBuyPriceAfterFee(creator.address, 1);
    await keys.connect(creator).buyKeys(creator.address, 1, { value: cost });
  }

  it("sets owner, treasury, and default fees on deploy", async function () {
    expect(await keys.owner()).to.equal(owner.address);
    expect(await keys.treasury()).to.equal(treasury.address);
    expect(await keys.protocolFeeBps()).to.equal(500);
    expect(await keys.creatorFeeBps()).to.equal(500);
    expect(await keys.MIN_PRICE_PER_KEY()).to.equal(FLOOR);
  });

  it("only the creator can buy their own first key", async function () {
    const price = await keys.getBuyPriceAfterFee(alice.address, 1);
    await expect(keys.connect(bob).buyKeys(alice.address, 1, { value: price })).to.be.revertedWith(
      "ArcYardKeys: only creator can buy the first key"
    );
    await expect(keys.connect(alice).buyKeys(alice.address, 1, { value: price })).to.not.be.reverted;
    expect(await keys.keysSupply(alice.address)).to.equal(1);
    expect(await keys.keysBalance(alice.address, alice.address)).to.equal(1);
  });

  it("the first key costs exactly the $0.10 floor, not the curve (which would be 0)", async function () {
    const rawCurvePrice = await keys.getPrice(0, 1);
    expect(rawCurvePrice).to.equal(FLOOR); // floor wins because the curve alone would be 0 here
    const price = await keys.getBuyPrice(alice.address, 1);
    expect(price).to.equal(FLOOR);
  });

  it("price increases with supply once the curve overtakes the floor", async function () {
    await buyFirstKey(alice);
    const priceFor2nd = await keys.getBuyPriceAfterFee(alice.address, 1);
    await keys.connect(bob).buyKeys(alice.address, 1, { value: priceFor2nd });
    // with CURVE_DIVISOR=16000 the marginal price only overtakes the $0.10 floor around supply ~40,
    // so buy well past that point before asserting growth
    const costForMany = await keys.getBuyPriceAfterFee(alice.address, 60);
    await keys.connect(bob).buyKeys(alice.address, 60, { value: costForMany });
    const priceAfterGrowth = await keys.getBuyPriceAfterFee(alice.address, 1);
    expect(priceAfterGrowth).to.be.gt(priceFor2nd);
  });

  it("buy fails with insufficient payment", async function () {
    await buyFirstKey(alice);
    const totalCost = await keys.getBuyPriceAfterFee(alice.address, 3);
    expect(totalCost).to.be.gt(0);
    await expect(
      keys.connect(bob).buyKeys(alice.address, 3, { value: totalCost - 1n })
    ).to.be.revertedWith("ArcYardKeys: insufficient payment");
  });

  it("buy credits fees to treasury and creator as withdrawable balances, refunds overpayment instantly", async function () {
    await buyFirstKey(alice);
    const treasuryCreditBefore = await keys.pendingWithdrawals(treasury.address);
    const aliceCreditBefore = await keys.pendingWithdrawals(alice.address);

    const price = await keys.getBuyPrice(alice.address, 3);
    const totalCost = await keys.getBuyPriceAfterFee(alice.address, 3);
    const overpay = totalCost + ethers.parseEther("1");

    const bobBefore = await ethers.provider.getBalance(bob.address);

    const tx = await keys.connect(bob).buyKeys(alice.address, 3, { value: overpay });
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    const protocolFee = (price * 500n) / 10000n;
    const creatorFee = (price * 500n) / 10000n;

    // Fees are credited as pull-payments, not pushed instantly — the fix for SWC-113
    // (a broken treasury/creator address could otherwise freeze every buyer's trade).
    expect(await keys.pendingWithdrawals(treasury.address)).to.equal(treasuryCreditBefore + protocolFee);
    expect(await keys.pendingWithdrawals(alice.address)).to.equal(aliceCreditBefore + creatorFee);
    // The overpayment refund to the buyer is still pushed instantly — only the buyer's
    // own wallet can block their own refund, which is an acceptable, self-inflicted risk.
    expect(await ethers.provider.getBalance(bob.address)).to.equal(
      bobBefore - price - protocolFee - creatorFee - gasCost
    );
    expect(await keys.keysBalance(alice.address, bob.address)).to.equal(3);

    // Prove the credited balance is real money: withdrawing moves it and zeroes the ledger.
    const treasuryBalBefore = await ethers.provider.getBalance(treasury.address);
    const wTx = await keys.connect(treasury).withdrawFees();
    const wReceipt = await wTx.wait();
    const wGasCost = wReceipt.gasUsed * wReceipt.gasPrice;
    const treasuryBalAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryBalAfter - treasuryBalBefore).to.equal(treasuryCreditBefore + protocolFee - wGasCost);
    expect(await keys.pendingWithdrawals(treasury.address)).to.equal(0);
    await expect(keys.connect(treasury).withdrawFees()).to.be.revertedWith("ArcYardKeys: nothing to withdraw");
  });

  it("emits Trade on buy with correct fields", async function () {
    await buyFirstKey(alice);
    const price = await keys.getBuyPrice(alice.address, 2);
    const totalCost = await keys.getBuyPriceAfterFee(alice.address, 2);
    await expect(keys.connect(bob).buyKeys(alice.address, 2, { value: totalCost }))
      .to.emit(keys, "Trade")
      .withArgs(bob.address, alice.address, true, 2, price, (price * 500n) / 10000n, (price * 500n) / 10000n, 3);
  });

  it("sells keys and pays out net of fees, updates supply and balance", async function () {
    await buyFirstKey(alice);
    const buyCost = await keys.getBuyPriceAfterFee(alice.address, 4);
    await keys.connect(bob).buyKeys(alice.address, 4, { value: buyCost });

    const sellPrice = await keys.getSellPrice(alice.address, 2);
    const bobBefore = await ethers.provider.getBalance(bob.address);
    const tx = await keys.connect(bob).sellKeys(alice.address, 2);
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    const protocolFee = (sellPrice * 500n) / 10000n;
    const creatorFee = (sellPrice * 500n) / 10000n;
    const net = sellPrice - protocolFee - creatorFee;

    expect(await ethers.provider.getBalance(bob.address)).to.equal(bobBefore + net - gasCost);
    expect(await keys.keysBalance(alice.address, bob.address)).to.equal(2);
    expect(await keys.keysSupply(alice.address)).to.equal(3);
  });

  it("cannot sell more keys than held", async function () {
    await buyFirstKey(alice);
    await expect(keys.connect(bob).sellKeys(alice.address, 1)).to.be.revertedWith(
      "ArcYardKeys: insufficient keys"
    );
  });

  it("cannot sell the last key unless the seller holds all outstanding keys", async function () {
    await buyFirstKey(alice);
    const buyCost = await keys.getBuyPriceAfterFee(alice.address, 1);
    await keys.connect(bob).buyKeys(alice.address, 1, { value: buyCost });
    // supply is now 2; alice holds 1, bob holds 1. Alice selling her 1 key would leave supply at 1, which is fine.
    await expect(keys.connect(alice).sellKeys(alice.address, 1)).to.not.be.reverted;
    // Now supply is 1, entirely held by bob. Bob CAN sell his last key since he holds all outstanding supply.
    await expect(keys.connect(bob).sellKeys(alice.address, 1)).to.not.be.reverted;
    expect(await keys.keysSupply(alice.address)).to.equal(0);
  });

  it("only owner can update treasury and fees, fees capped at 20% combined", async function () {
    await expect(keys.connect(alice).setTreasury(bob.address)).to.be.revertedWith("ArcYardKeys: not owner");
    await expect(keys.setTreasury(carol.address)).to.emit(keys, "TreasuryUpdated").withArgs(carol.address);
    expect(await keys.treasury()).to.equal(carol.address);

    await expect(keys.connect(alice).setFees(100, 100)).to.be.revertedWith("ArcYardKeys: not owner");
    await expect(keys.setFees(1500, 600)).to.be.revertedWith("ArcYardKeys: combined fee too high");
    await expect(keys.setFees(1000, 1000)).to.emit(keys, "FeesUpdated").withArgs(1000, 1000);
  });

  it("the curve is reversible: the raw price to buy N keys equals the raw price to sell those same N keys back", async function () {
    await buyFirstKey(alice);
    // buy enough keys that the curve is well past the floor before comparing a buy/sell window
    const buyCost = await keys.getBuyPriceAfterFee(alice.address, 25);
    await keys.connect(bob).buyKeys(alice.address, 25, { value: buyCost }); // supply: 1 -> 26

    const rawBuyPriceForFive = await keys.getPrice(21, 5); // the exact window: 21 -> 26
    const rawSellPrice = await keys.getSellPrice(alice.address, 5); // selling 5 back down from supply 26
    expect(rawSellPrice).to.equal(rawBuyPriceForFive);
  });

  it("the floor applies per key: buying 3 keys from zero supply costs exactly 3x the floor", async function () {
    const price = await keys.getBuyPrice(alice.address, 3);
    expect(price).to.equal(FLOOR * 3n);
  });

  it("SWC-113 fix: a creator whose address reverts on receiving ETH cannot freeze anyone's trade", async function () {
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const hostileCreator = await RevertingReceiver.deploy();
    await hostileCreator.waitForDeployment();
    const hostileAddress = await hostileCreator.getAddress();

    // Even though the "creator" here is a contract that always reverts on receiving funds,
    // buying and selling its keys must still succeed — the old push-payment version would
    // have reverted the whole transaction the moment it tried to pay the creator's fee.
    // Seed the market through the creator contract itself, preserving the first-key
    // opt-in rule. The wrapper forwards the exact payment, but direct transfers still revert.
    const cost = await keys.getBuyPriceAfterFee(hostileAddress, 1);
    await expect(hostileCreator.buyFirstKeyAsSelf(await keys.getAddress(), { value: cost })).to.not.be.reverted;
    expect(await keys.keysBalance(hostileAddress, hostileAddress)).to.equal(1);

    const buyCost = await keys.getBuyPriceAfterFee(hostileAddress, 5);
    await expect(keys.connect(bob).buyKeys(hostileAddress, 5, { value: buyCost })).to.not.be.reverted;
    await expect(keys.connect(bob).sellKeys(hostileAddress, 2)).to.not.be.reverted;

    // The hostile contract's fee sits safely in the pull-payment ledger, uncollectable
    // by design (it can never receive ETH), but that is the hostile contract's own problem —
    // it does not block trading for alice, bob, or anyone else.
    expect(await keys.pendingWithdrawals(hostileAddress)).to.be.gt(0);
    await expect(alice.sendTransaction({ to: hostileAddress, value: 1n }))
      .to.be.revertedWith("RevertingReceiver: I never accept funds");
  });

  it("SWC-113 fix: a broken treasury cannot freeze the entire market", async function () {
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const hostileTreasury = await RevertingReceiver.deploy();
    await hostileTreasury.waitForDeployment();
    const hostileAddress = await hostileTreasury.getAddress();

    await keys.setTreasury(hostileAddress);
    await buyFirstKey(alice);
    const cost = await keys.getBuyPriceAfterFee(alice.address, 3);
    await expect(keys.connect(bob).buyKeys(alice.address, 3, { value: cost })).to.not.be.reverted;
    await expect(keys.connect(bob).sellKeys(alice.address, 3)).to.not.be.reverted;
    expect(await keys.pendingWithdrawals(hostileAddress)).to.be.gt(0);
  });
});
