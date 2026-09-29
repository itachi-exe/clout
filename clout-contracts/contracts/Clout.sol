// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Clout — on-chain social layer for Arc.
 *
 * Design notes:
 *  - Post CONTENT lives off-chain (backend DB); only a keccak256 hash is
 *    anchored on-chain so authorship + timestamp + integrity are verifiable.
 *  - Likes and reposts are on-chain actions that drive an on-chain reputation
 *    score powering the leaderboard.
 *  - Tipping has been removed. Post monetisation is handled by CloutPostShares,
 *    a separate bonding-curve contract where anyone can buy/sell shares of a
 *    post. The author earns a fee on every trade there.
 *  - No proxy / upgradeability: small, auditable, immutable v1.
 */
contract Clout {
    // ---------- events ----------
    event ProfileRegistered(address indexed user, string handle);
    event PostCreated(uint256 indexed postId, address indexed author, bytes32 contentHash, uint64 timestamp);
    event PostLiked(uint256 indexed postId, address indexed liker, address indexed author);
    event PostUnliked(uint256 indexed postId, address indexed liker, address indexed author);
    event PostReposted(uint256 indexed postId, address indexed reposter, address indexed author);

    // ---------- storage ----------
    struct Post {
        address author;
        bytes32 contentHash;
        uint64 timestamp;
        uint64 likeCount;
        uint64 repostCount;
    }

    address public owner;

    uint256 public postCount;
    mapping(uint256 => Post) public posts;
    mapping(uint256 => mapping(address => bool)) public hasLiked;

    mapping(address => string) public handleOf;
    mapping(string => address) public addressOfHandle;
    mapping(address => uint256) public points; // reputation score

    modifier onlyOwner() {
        require(msg.sender == owner, "Clout: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ---------- profile ----------
    function registerHandle(string calldata handle) external {
        require(bytes(handle).length > 0 && bytes(handle).length <= 32, "Clout: bad handle length");
        require(addressOfHandle[handle] == address(0), "Clout: handle taken");

        string memory prior = handleOf[msg.sender];
        if (bytes(prior).length > 0) {
            delete addressOfHandle[prior];
        }
        handleOf[msg.sender] = handle;
        addressOfHandle[handle] = msg.sender;
        emit ProfileRegistered(msg.sender, handle);
    }

    // ---------- posts ----------
    function createPost(bytes32 contentHash) external returns (uint256 postId) {
        require(contentHash != bytes32(0), "Clout: empty content hash");
        postId = ++postCount;
        posts[postId] = Post({
            author: msg.sender,
            contentHash: contentHash,
            timestamp: uint64(block.timestamp),
            likeCount: 0,
            repostCount: 0
        });
        points[msg.sender] += 3;
        emit PostCreated(postId, msg.sender, contentHash, uint64(block.timestamp));
    }

    function likePost(uint256 postId) external {
        Post storage p = _existingPost(postId);
        require(!hasLiked[postId][msg.sender], "Clout: already liked");
        require(p.author != msg.sender, "Clout: cannot like own post");

        hasLiked[postId][msg.sender] = true;
        p.likeCount += 1;
        points[p.author] += 1;
        emit PostLiked(postId, msg.sender, p.author);
    }

    function unlikePost(uint256 postId) external {
        Post storage p = _existingPost(postId);
        require(hasLiked[postId][msg.sender], "Clout: not liked");

        hasLiked[postId][msg.sender] = false;
        p.likeCount -= 1;
        if (points[p.author] > 0) points[p.author] -= 1;
        emit PostUnliked(postId, msg.sender, p.author);
    }

    function repost(uint256 postId) external {
        Post storage p = _existingPost(postId);
        require(p.author != msg.sender, "Clout: cannot repost own post");

        p.repostCount += 1;
        points[p.author] += 2;
        emit PostReposted(postId, msg.sender, p.author);
    }

    // ---------- admin ----------
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Clout: bad owner");
        owner = newOwner;
    }

    // ---------- views ----------
    function getPost(uint256 postId) external view returns (Post memory) {
        return posts[postId];
    }

    // ---------- internal ----------
    function _existingPost(uint256 postId) internal view returns (Post storage) {
        require(postId > 0 && postId <= postCount, "Clout: no such post");
        return posts[postId];
    }
}
