const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Clout.sol v1: posts anchored by hash, on-chain likes and reposts, no tipping.
// Monetisation lives in CloutPostShares.sol and CloutKeys.sol.
describe("Clout", function () {
  let owner, alice, bob, carol;
  let clout;

  const HASH_A = ethers.keccak256(ethers.toUtf8Bytes("first post"));
  const HASH_B = ethers.keccak256(ethers.toUtf8Bytes("second post"));

  beforeEach(async function () {
    [owner, alice, bob, carol] = await ethers.getSigners();
    const Clout = await ethers.getContractFactory("Clout");
    clout = await Clout.deploy();
    await clout.waitForDeployment();
  });

  describe("deploy", function () {
    it("sets the deployer as owner and starts at zero posts", async function () {
      expect(await clout.owner()).to.equal(owner.address);
      expect(await clout.postCount()).to.equal(0n);
    });
  });

  describe("registerHandle", function () {
    it("registers a handle both ways and emits ProfileRegistered", async function () {
      await expect(clout.connect(alice).registerHandle("alice"))
        .to.emit(clout, "ProfileRegistered")
        .withArgs(alice.address, "alice");
      expect(await clout.handleOf(alice.address)).to.equal("alice");
      expect(await clout.addressOfHandle("alice")).to.equal(alice.address);
    });

    it("rejects an empty handle and one longer than 32 bytes", async function () {
      await expect(clout.connect(alice).registerHandle("")).to.be.revertedWith("Clout: bad handle length");
      await expect(clout.connect(alice).registerHandle("a".repeat(33))).to.be.revertedWith(
        "Clout: bad handle length"
      );
      await expect(clout.connect(alice).registerHandle("a".repeat(32))).to.not.be.reverted;
    });

    it("rejects a handle that is already taken", async function () {
      await clout.connect(alice).registerHandle("alice");
      await expect(clout.connect(bob).registerHandle("alice")).to.be.revertedWith("Clout: handle taken");
    });

    it("frees the previous handle when an account renames itself", async function () {
      await clout.connect(alice).registerHandle("alice");
      await clout.connect(alice).registerHandle("alice2");
      expect(await clout.handleOf(alice.address)).to.equal("alice2");
      expect(await clout.addressOfHandle("alice")).to.equal(ethers.ZeroAddress);
      // the released handle can be claimed by someone else
      await clout.connect(bob).registerHandle("alice");
      expect(await clout.addressOfHandle("alice")).to.equal(bob.address);
    });

    // Known v1 quirk: the contract treats "handle already yours" as taken, so a
    // user who re-submits their own handle gets "Clout: handle taken". The UI
    // avoids it by only sending a changed handle. A one-line fix
    // (allow when addressOfHandle[handle] == msg.sender) changes bytecode, so it
    // belongs in the audited redeploy, not in a rename.
    it("rejects re-registering your own current handle (documented quirk)", async function () {
      await clout.connect(alice).registerHandle("alice");
      await expect(clout.connect(alice).registerHandle("alice")).to.be.revertedWith("Clout: handle taken");
      expect(await clout.addressOfHandle("alice")).to.equal(alice.address);
    });
  });

  describe("createPost", function () {
    it("stores the post, counts it, and awards 3 reputation points", async function () {
      await expect(clout.connect(alice).createPost(HASH_A)).to.emit(clout, "PostCreated");
      expect(await clout.postCount()).to.equal(1n);
      expect(await clout.points(alice.address)).to.equal(3n);

      const post = await clout.getPost(1);
      expect(post.author).to.equal(alice.address);
      expect(post.contentHash).to.equal(HASH_A);
      expect(post.likeCount).to.equal(0n);
      expect(post.repostCount).to.equal(0n);
      expect(post.timestamp).to.be.greaterThan(0n);
    });

    it("emits PostCreated with the post id, author and content hash", async function () {
      await expect(clout.connect(alice).createPost(HASH_A))
        .to.emit(clout, "PostCreated")
        .withArgs(1n, alice.address, HASH_A, anyValue);
    });

    it("numbers posts from 1 and keeps them separate", async function () {
      await clout.connect(alice).createPost(HASH_A);
      await clout.connect(bob).createPost(HASH_B);
      expect(await clout.postCount()).to.equal(2n);
      expect((await clout.getPost(2)).contentHash).to.equal(HASH_B);
    });

    it("refuses a zero content hash", async function () {
      await expect(clout.connect(alice).createPost(ethers.ZeroHash)).to.be.revertedWith(
        "Clout: empty content hash"
      );
    });
  });

  describe("likes", function () {
    beforeEach(async function () {
      await clout.connect(alice).createPost(HASH_A);
    });

    it("likes a post: one like, one point to the author, event emitted", async function () {
      await expect(clout.connect(bob).likePost(1))
        .to.emit(clout, "PostLiked")
        .withArgs(1n, bob.address, alice.address);
      expect(await clout.hasLiked(1, bob.address)).to.equal(true);
      expect((await clout.getPost(1)).likeCount).to.equal(1n);
      expect(await clout.points(alice.address)).to.equal(4n); // 3 for posting + 1 for the like
    });

    it("refuses a second like from the same wallet", async function () {
      await clout.connect(bob).likePost(1);
      await expect(clout.connect(bob).likePost(1)).to.be.revertedWith("Clout: already liked");
    });

    it("refuses liking your own post", async function () {
      await expect(clout.connect(alice).likePost(1)).to.be.revertedWith("Clout: cannot like own post");
    });

    it("refuses liking a post that does not exist", async function () {
      await expect(clout.connect(bob).likePost(999)).to.be.revertedWith("Clout: no such post");
      await expect(clout.connect(bob).likePost(0)).to.be.revertedWith("Clout: no such post");
    });

    it("unlikes: removes the like, the count, and the point", async function () {
      await clout.connect(bob).likePost(1);
      await expect(clout.connect(bob).unlikePost(1))
        .to.emit(clout, "PostUnliked")
        .withArgs(1n, bob.address, alice.address);
      expect(await clout.hasLiked(1, bob.address)).to.equal(false);
      expect((await clout.getPost(1)).likeCount).to.equal(0n);
      expect(await clout.points(alice.address)).to.equal(3n);
    });

    it("refuses to unlike a post that was never liked", async function () {
      await expect(clout.connect(bob).unlikePost(1)).to.be.revertedWith("Clout: not liked");
    });

    it("counts likes from different wallets independently", async function () {
      await clout.connect(bob).likePost(1);
      await clout.connect(carol).likePost(1);
      expect((await clout.getPost(1)).likeCount).to.equal(2n);
      expect(await clout.points(alice.address)).to.equal(5n);
      await clout.connect(bob).unlikePost(1);
      expect((await clout.getPost(1)).likeCount).to.equal(1n);
      expect(await clout.points(alice.address)).to.equal(4n);
    });
  });

  describe("reposts", function () {
    beforeEach(async function () {
      await clout.connect(alice).createPost(HASH_A);
    });

    it("reposts: count up, 2 points to the author, event emitted", async function () {
      await expect(clout.connect(bob).repost(1))
        .to.emit(clout, "PostReposted")
        .withArgs(1n, bob.address, alice.address);
      expect((await clout.getPost(1)).repostCount).to.equal(1n);
      expect(await clout.points(alice.address)).to.equal(5n);
    });

    it("refuses reposting your own post", async function () {
      await expect(clout.connect(alice).repost(1)).to.be.revertedWith("Clout: cannot repost own post");
    });

    it("refuses reposting a post that does not exist", async function () {
      await expect(clout.connect(bob).repost(42)).to.be.revertedWith("Clout: no such post");
    });
  });

  describe("transferOwnership", function () {
    it("moves ownership and rejects a zero address", async function () {
      await clout.connect(owner).transferOwnership(bob.address);
      expect(await clout.owner()).to.equal(bob.address);
      await expect(clout.connect(bob).transferOwnership(ethers.ZeroAddress)).to.be.revertedWith(
        "Clout: bad owner"
      );
    });

    it("only the current owner can transfer", async function () {
      await expect(clout.connect(alice).transferOwnership(alice.address)).to.be.revertedWith(
        "Clout: not owner"
      );
    });
  });

  describe("getPost", function () {
    it("returns an empty struct for a post id that was never created", async function () {
      const post = await clout.getPost(7);
      expect(post.author).to.equal(ethers.ZeroAddress);
      expect(post.contentHash).to.equal(ethers.ZeroHash);
    });
  });
});
