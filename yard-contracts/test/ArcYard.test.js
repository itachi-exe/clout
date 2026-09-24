const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArcYard", function () {
  let arcYard, owner, treasury, alice, bob;

  beforeEach(async function () {
    [owner, treasury, alice, bob] = await ethers.getSigners();
    const ArcYard = await ethers.getContractFactory("ArcYard");
    arcYard = await ArcYard.deploy(treasury.address);
    await arcYard.waitForDeployment();
  });

  it("sets owner and treasury on deploy", async function () {
    expect(await arcYard.owner()).to.equal(owner.address);
    expect(await arcYard.treasury()).to.equal(treasury.address);
    expect(await arcYard.feeBps()).to.equal(250);
  });

  it("registers a unique handle", async function () {
    await expect(arcYard.connect(alice).registerHandle("alice"))
      .to.emit(arcYard, "ProfileRegistered")
      .withArgs(alice.address, "alice");
    expect(await arcYard.handleOf(alice.address)).to.equal("alice");
    expect(await arcYard.addressOfHandle("alice")).to.equal(alice.address);

    await expect(arcYard.connect(bob).registerHandle("alice")).to.be.revertedWith("ArcYard: handle taken");
  });

  it("creates a post and increases author points", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("gm arc"));
    await expect(arcYard.connect(alice).createPost(hash))
      .to.emit(arcYard, "PostCreated")
      .withArgs(1, alice.address, hash, anyValue());
    expect(await arcYard.postCount()).to.equal(1);
    expect(await arcYard.points(alice.address)).to.equal(3);

    const post = await arcYard.getPost(1);
    expect(post.author).to.equal(alice.address);
    expect(post.contentHash).to.equal(hash);
  });

  it("rejects empty content hash", async function () {
    await expect(arcYard.connect(alice).createPost(ethers.ZeroHash)).to.be.revertedWith(
      "ArcYard: empty content hash"
    );
  });

  it("likes and unlikes a post, updating points and counts", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("post 1"));
    await arcYard.connect(alice).createPost(hash);

    await expect(arcYard.connect(bob).likePost(1))
      .to.emit(arcYard, "PostLiked")
      .withArgs(1, bob.address, alice.address);

    let post = await arcYard.getPost(1);
    expect(post.likeCount).to.equal(1);
    expect(await arcYard.points(alice.address)).to.equal(4); // 3 for post + 1 for like

    await expect(arcYard.connect(bob).likePost(1)).to.be.revertedWith("ArcYard: already liked");

    await arcYard.connect(bob).unlikePost(1);
    post = await arcYard.getPost(1);
    expect(post.likeCount).to.equal(0);
    expect(await arcYard.points(alice.address)).to.equal(3);
  });

  it("prevents liking your own post", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("post 1"));
    await arcYard.connect(alice).createPost(hash);
    await expect(arcYard.connect(alice).likePost(1)).to.be.revertedWith("ArcYard: cannot like own post");
  });

  it("reposts and adds points", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("post 1"));
    await arcYard.connect(alice).createPost(hash);

    await expect(arcYard.connect(bob).repost(1))
      .to.emit(arcYard, "PostReposted")
      .withArgs(1, bob.address, alice.address);

    const post = await arcYard.getPost(1);
    expect(post.repostCount).to.equal(1);
    expect(await arcYard.points(alice.address)).to.equal(5); // 3 + 2
  });

  it("tips a post: credits fee to treasury and net to author as withdrawable balances, updates points", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("post 1"));
    await arcYard.connect(alice).createPost(hash);

    const tip = ethers.parseEther("1"); // 1 USDC (18 decimals on Arc)

    await expect(arcYard.connect(bob).tipPost(1, { value: tip }))
      .to.emit(arcYard, "Tipped");

    const fee = (tip * 250n) / 10000n;
    const net = tip - fee;

    // Tips are credited as pull-payments, not pushed instantly — this is the fix for
    // SWC-113 (a broken author/treasury address could otherwise freeze all tipping).
    expect(await arcYard.pendingWithdrawals(alice.address)).to.equal(net);
    expect(await arcYard.pendingWithdrawals(treasury.address)).to.equal(fee);

    const post = await arcYard.getPost(1);
    expect(post.tipsReceived).to.equal(net);

    // Now prove the credited balance is real money: withdraw it and check it actually moves.
    const authorBalBefore = await ethers.provider.getBalance(alice.address);
    const tx = await arcYard.connect(alice).withdrawFunds();
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const authorBalAfter = await ethers.provider.getBalance(alice.address);
    expect(authorBalAfter - authorBalBefore).to.equal(net - gasCost);
    expect(await arcYard.pendingWithdrawals(alice.address)).to.equal(0);

    // Withdrawing twice with nothing left reverts, not silently succeeds.
    await expect(arcYard.connect(alice).withdrawFunds()).to.be.revertedWith("ArcYard: nothing to withdraw");
  });

  it("rejects zero-value tips and self-tips", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("post 1"));
    await arcYard.connect(alice).createPost(hash);

    await expect(arcYard.connect(bob).tipPost(1, { value: 0 })).to.be.revertedWith("ArcYard: zero tip");
    await expect(
      arcYard.connect(alice).tipPost(1, { value: ethers.parseEther("1") })
    ).to.be.revertedWith("ArcYard: cannot tip own post");
  });

  it("SWC-113 fix: an author whose address reverts on receiving ETH cannot freeze tipping on their own post", async function () {
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const hostileAuthor = await RevertingReceiver.deploy();
    await hostileAuthor.waitForDeployment();
    const hostileAddress = await hostileAuthor.getAddress();

    const arcYardAddress = await arcYard.getAddress();
    const hash = ethers.keccak256(ethers.toUtf8Bytes("hostile post"));
    await hostileAuthor.createPostAsSelf(arcYardAddress, hash);
    const post = await arcYard.getPost(1);
    expect(post.author).to.equal(hostileAddress);

    // The old push-payment version would have reverted this tip the instant it tried
    // to forward the author's share to a contract that rejects incoming ETH — meaning
    // this post could never be tipped by anyone, ever, once it existed.
    const tip = ethers.parseEther("1");
    await expect(arcYard.connect(bob).tipPost(1, { value: tip })).to.not.be.reverted;

    const fee = (tip * 250n) / 10000n;
    const net = tip - fee;
    expect(await arcYard.pendingWithdrawals(hostileAddress)).to.equal(net);
    expect(await arcYard.pendingWithdrawals(treasury.address)).to.equal(fee);

    // A second tip from a different tipper must also succeed — proving the freeze
    // never happens, not just that the first tip got lucky.
    await expect(arcYard.connect(alice).tipPost(1, { value: tip })).to.not.be.reverted;
  });

  it("SWC-113 fix: a broken treasury cannot freeze tipping globally", async function () {
    const RevertingReceiver = await ethers.getContractFactory("RevertingReceiver");
    const hostileTreasury = await RevertingReceiver.deploy();
    await hostileTreasury.waitForDeployment();
    const hostileAddress = await hostileTreasury.getAddress();

    await arcYard.connect(owner).setTreasury(hostileAddress);
    const hash = ethers.keccak256(ethers.toUtf8Bytes("post 1"));
    await arcYard.connect(alice).createPost(hash);

    const tip = ethers.parseEther("1");
    await expect(arcYard.connect(bob).tipPost(1, { value: tip })).to.not.be.reverted;

    const fee = (tip * 250n) / 10000n;
    expect(await arcYard.pendingWithdrawals(hostileAddress)).to.equal(fee);
    expect(await arcYard.pendingWithdrawals(alice.address)).to.equal(tip - fee);
  });

  it("only owner can update treasury and fee, fee capped at 10%", async function () {
    await expect(arcYard.connect(alice).setTreasury(bob.address)).to.be.revertedWith("ArcYard: not owner");
    await arcYard.connect(owner).setTreasury(bob.address);
    expect(await arcYard.treasury()).to.equal(bob.address);

    await expect(arcYard.connect(owner).setFeeBps(1500)).to.be.revertedWith("ArcYard: fee too high");
    await arcYard.connect(owner).setFeeBps(500);
    expect(await arcYard.feeBps()).to.equal(500);
  });

  it("reverts on operations against a nonexistent post", async function () {
    await expect(arcYard.connect(alice).likePost(999)).to.be.revertedWith("ArcYard: no such post");
  });
});

function anyValue() {
  return require("@nomicfoundation/hardhat-chai-matchers/withArgs").anyValue;
}
