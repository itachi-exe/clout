// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ArcYard — on-chain social layer for Arc.
 *
 * Design notes:
 *  - Post CONTENT lives off-chain (backend DB); only a keccak256 hash of the
 *    content is anchored on-chain, so authorship + timestamp + integrity are
 *    verifiable without paying gas to store full text.
 *  - Likes, reposts and tips are on-chain actions that drive an on-chain
 *    reputation score, which is what powers the leaderboard.
 *  - Tips move native USDC (Arc's gas token) directly between users, with a
 *    small protocol fee taken as basis points, sent to a treasury address.
 *  - No proxy / upgradeability here on purpose: this is a v1 reputation
 *    ledger, not a token, so we keep it small, auditable and immutable.
 */
contract ArcYard {
    // ---------- events ----------
    event ProfileRegistered(address indexed user, string handle);
    event PostCreated(uint256 indexed postId, address indexed author, bytes32 contentHash, uint64 timestamp);
    event PostLiked(uint256 indexed postId, address indexed liker, address indexed author);
    event PostUnliked(uint256 indexed postId, address indexed liker, address indexed author);
    event PostReposted(uint256 indexed postId, address indexed reposter, address indexed author);
    event Tipped(address indexed from, address indexed to, uint256 indexed postId, uint256 amount, uint256 fee);
    event TreasuryUpdated(address indexed newTreasury);
    event FeeUpdated(uint16 newFeeBps);
    event Withdrawal(address indexed who, uint256 amount);

    // ---------- storage ----------
    struct Post {
        address author;
        bytes32 contentHash;
        uint64 timestamp;
        uint64 likeCount;
        uint64 repostCount;
        uint128 tipsReceived; // total USDC (wei) tipped to this post
    }

    address public owner;
    address public treasury;
    uint16 public feeBps = 250; // 2.5% protocol fee on tips, in basis points (max 10_000)

    uint256 public postCount;
    mapping(uint256 => Post) public posts;
    mapping(uint256 => mapping(address => bool)) public hasLiked;

    mapping(address => string) public handleOf;
    mapping(string => address) public addressOfHandle;
    mapping(address => uint256) public points; // reputation score

    /// @notice Pull-payment ledger for tip proceeds. Both the post author's net share
    /// and the protocol fee are credited here instead of pushed mid-transaction, so a
    /// broken or hostile author address (or a broken treasury) can never freeze tipping
    /// on other posts (SWC-113: DoS with failed call). Withdraw via withdrawFunds().
    mapping(address => uint256) public pendingWithdrawals;

    // ---------- modifiers ----------
    modifier onlyOwner() {
        require(msg.sender == owner, "ArcYard: not owner");
        _;
    }

    constructor(address _treasury) {
        require(_treasury != address(0), "ArcYard: bad treasury");
        owner = msg.sender;
        treasury = _treasury;
    }

    // ---------- profile ----------
    function registerHandle(string calldata handle) external {
        require(bytes(handle).length > 0 && bytes(handle).length <= 32, "ArcYard: bad handle length");
        require(addressOfHandle[handle] == address(0), "ArcYard: handle taken");

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
        require(contentHash != bytes32(0), "ArcYard: empty content hash");
        postId = ++postCount;
        posts[postId] = Post({
            author: msg.sender,
            contentHash: contentHash,
            timestamp: uint64(block.timestamp),
            likeCount: 0,
            repostCount: 0,
            tipsReceived: 0
        });
        points[msg.sender] += 3; // posting earns reputation
        emit PostCreated(postId, msg.sender, contentHash, uint64(block.timestamp));
    }

    function likePost(uint256 postId) external {
        Post storage p = _existingPost(postId);
        require(!hasLiked[postId][msg.sender], "ArcYard: already liked");
        require(p.author != msg.sender, "ArcYard: cannot like own post");

        hasLiked[postId][msg.sender] = true;
        p.likeCount += 1;
        points[p.author] += 1;
        emit PostLiked(postId, msg.sender, p.author);
    }

    function unlikePost(uint256 postId) external {
        Post storage p = _existingPost(postId);
        require(hasLiked[postId][msg.sender], "ArcYard: not liked");

        hasLiked[postId][msg.sender] = false;
        p.likeCount -= 1;
        if (points[p.author] > 0) points[p.author] -= 1;
        emit PostUnliked(postId, msg.sender, p.author);
    }

    function repost(uint256 postId) external {
        Post storage p = _existingPost(postId);
        require(p.author != msg.sender, "ArcYard: cannot repost own post");

        p.repostCount += 1;
        points[p.author] += 2;
        emit PostReposted(postId, msg.sender, p.author);
    }

    // ---------- tipping (native USDC, Arc's gas token) ----------
    function tipPost(uint256 postId) external payable {
        require(msg.value > 0, "ArcYard: zero tip");
        Post storage p = _existingPost(postId);
        require(p.author != msg.sender, "ArcYard: cannot tip own post");

        uint256 fee = (msg.value * feeBps) / 10_000;
        uint256 net = msg.value - fee;

        p.tipsReceived += uint128(net);
        points[p.author] += uint256(net / 1e15); // small rep bump scaled to tip size

        // Credited, not pushed — a broken or hostile author address can never block
        // tipping on other posts, and a broken treasury can never block tipping globally.
        pendingWithdrawals[p.author] += net;
        if (fee > 0) pendingWithdrawals[treasury] += fee;

        emit Tipped(msg.sender, p.author, postId, msg.value, fee);
    }

    /// @notice Withdraw any tip proceeds or protocol fees credited to the caller.
    /// Zeroes the balance before sending (checks-effects-interactions).
    function withdrawFunds() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "ArcYard: nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ArcYard: withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }

    // ---------- admin ----------
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "ArcYard: bad treasury");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "ArcYard: fee too high"); // hard cap 10%
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ArcYard: bad owner");
        owner = newOwner;
    }

    // ---------- views ----------
    function getPost(uint256 postId) external view returns (Post memory) {
        return posts[postId];
    }

    // ---------- internal ----------
    function _existingPost(uint256 postId) internal view returns (Post storage) {
        require(postId > 0 && postId <= postCount, "ArcYard: no such post");
        return posts[postId];
    }
}
