// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * CloutPostShares — bonding-curve post shares for Clout.
 *
 * Design:
 *  - Each post (identified by its uint256 postId from Clout.sol) has its own
 *    independent share market. Anyone can buy shares of any post at any time.
 *  - Price follows the same quadratic sum curve as CloutKeys: cost to move
 *    supply from a to b is sum(i^2) scaled by CURVE_DIVISOR, with a per-share
 *    floor so early shares are never free.
 *  - On every trade the post author earns an author fee and the protocol earns
 *    a protocol fee. Both are pull-payment (credited to pendingWithdrawals),
 *    so a broken or hostile author address can never freeze other users' trades.
 *  - Post author is resolved once (on first buy) from the Clout.sol contract
 *    and stored — no repeated external calls on every trade.
 *  - No proxy / upgradeability: small, auditable, immutable v1.
 */

interface IClout {
    struct Post {
        address author;
        bytes32 contentHash;
        uint64 timestamp;
        uint64 likeCount;
        uint64 repostCount;
    }
    function getPost(uint256 postId) external view returns (Post memory);
    function postCount() external view returns (uint256);
}

contract CloutPostShares {

    // ---------- events ----------
    event PostShareTrade(
        address indexed trader,
        uint256 indexed postId,
        address indexed author,
        bool    isBuy,
        uint256 shareAmount,
        uint256 usdcAmount,      // raw curve price (before fees)
        uint256 protocolFee,
        uint256 authorFee,
        uint256 supply           // supply AFTER the trade
    );
    event TreasuryUpdated(address indexed newTreasury);
    event FeesUpdated(uint16 protocolFeeBps, uint16 authorFeeBps);
    event Withdrawal(address indexed who, uint256 amount);

    // ---------- state ----------
    address public owner;
    address public treasury;
    IClout  public immutable clout;

    uint16 public protocolFeeBps = 500;  // 5 % to protocol treasury
    uint16 public authorFeeBps   = 500;  // 5 % to post author

    uint256 private constant CURVE_DIVISOR    = 16_000;
    uint256 public  constant MIN_PRICE_PER_SHARE = 0.1 ether; // $0.10 floor

    /// @dev Resolved once on first buy, then immutable per postId.
    mapping(uint256 => address) public postAuthor;

    mapping(uint256 => uint256)                          public shareSupply;  // postId => total outstanding
    mapping(uint256 => mapping(address => uint256))      public shareBalance; // postId => holder => balance

    /// Pull-payment ledger for protocol and author fees.
    mapping(address => uint256) public pendingWithdrawals;

    // ---------- modifiers ----------
    modifier onlyOwner() {
        require(msg.sender == owner, "CloutPostShares: not owner");
        _;
    }

    // ---------- constructor ----------
    constructor(address _clout, address _treasury) {
        require(_clout    != address(0), "CloutPostShares: bad clout");
        require(_treasury != address(0), "CloutPostShares: bad treasury");
        owner    = msg.sender;
        clout    = IClout(_clout);
        treasury = _treasury;
    }

    // ---------- curve math ----------
    function _sumOfSquares(uint256 n) internal pure returns (uint256) {
        if (n == 0) return 0;
        return ((n - 1) * n * (2 * n - 1)) / 6;
    }

    /// @notice Raw curve price (before fees) to buy/sell `amount` shares of a
    ///         post whose current supply is `supply`.
    function getPrice(uint256 supply, uint256 amount) public pure returns (uint256) {
        uint256 sum1       = _sumOfSquares(supply);
        uint256 sum2       = _sumOfSquares(supply + amount);
        uint256 curvePrice = ((sum2 - sum1) * 1 ether) / CURVE_DIVISOR;
        uint256 floorPrice = MIN_PRICE_PER_SHARE * amount;
        return curvePrice > floorPrice ? curvePrice : floorPrice;
    }

    function getBuyPrice(uint256 postId, uint256 amount) external view returns (uint256) {
        return getPrice(shareSupply[postId], amount);
    }

    function getSellPrice(uint256 postId, uint256 amount) external view returns (uint256) {
        uint256 supply = shareSupply[postId];
        require(amount <= supply, "CloutPostShares: amount exceeds supply");
        return getPrice(supply - amount, amount);
    }

    function _totalFees(uint256 price) internal view returns (uint256) {
        return (price * protocolFeeBps) / 10_000 + (price * authorFeeBps) / 10_000;
    }

    function getBuyPriceAfterFee(uint256 postId, uint256 amount) external view returns (uint256) {
        return getPrice(shareSupply[postId], amount) + _totalFees(getPrice(shareSupply[postId], amount));
    }

    function getSellPriceAfterFee(uint256 postId, uint256 amount) external view returns (uint256) {
        uint256 supply = shareSupply[postId];
        require(amount <= supply, "CloutPostShares: amount exceeds supply");
        uint256 price = getPrice(supply - amount, amount);
        return price - _totalFees(price);
    }

    // ---------- resolving post author ----------
    function _resolveAuthor(uint256 postId) internal returns (address author) {
        author = postAuthor[postId];
        if (author == address(0)) {
            // First trade on this post — resolve and cache.
            IClout.Post memory p = clout.getPost(postId);
            require(p.author != address(0), "CloutPostShares: post does not exist");
            postAuthor[postId] = p.author;
            author = p.author;
        }
    }

    // ---------- trading ----------
    function buyShares(uint256 postId, uint256 amount) external payable {
        require(amount > 0, "CloutPostShares: zero amount");

        address author = _resolveAuthor(postId);
        uint256 supply = shareSupply[postId];

        uint256 price       = getPrice(supply, amount);
        uint256 protocolFee = (price * protocolFeeBps) / 10_000;
        uint256 authorFee   = (price * authorFeeBps)   / 10_000;
        uint256 totalCost   = price + protocolFee + authorFee;

        require(msg.value >= totalCost, "CloutPostShares: insufficient payment");

        shareBalance[postId][msg.sender] += amount;
        shareSupply[postId]               = supply + amount;
        uint256 newSupply                 = supply + amount;

        if (protocolFee > 0) pendingWithdrawals[treasury]  += protocolFee;
        if (authorFee   > 0) pendingWithdrawals[author]    += authorFee;

        if (msg.value > totalCost) {
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refunded, "CloutPostShares: refund failed");
        }

        emit PostShareTrade(msg.sender, postId, author, true, amount, price, protocolFee, authorFee, newSupply);
    }

    function sellShares(uint256 postId, uint256 amount) external {
        require(amount > 0, "CloutPostShares: zero amount");

        address author = _resolveAuthor(postId);
        uint256 supply = shareSupply[postId];

        require(amount <= supply,                              "CloutPostShares: amount exceeds supply");
        require(shareBalance[postId][msg.sender] >= amount,    "CloutPostShares: insufficient shares");
        // Cannot fully drain a post's market (keep at least 1 share outstanding so
        // price history is preserved and the market can't be trivially reset).
        require(supply - amount > 0, "CloutPostShares: cannot sell the last share");

        uint256 price       = getPrice(supply - amount, amount);
        uint256 protocolFee = (price * protocolFeeBps) / 10_000;
        uint256 authorFee   = (price * authorFeeBps)   / 10_000;
        uint256 net         = price - protocolFee - authorFee;

        shareBalance[postId][msg.sender] -= amount;
        shareSupply[postId]               = supply - amount;
        uint256 newSupply                 = supply - amount;

        if (protocolFee > 0) pendingWithdrawals[treasury] += protocolFee;
        if (authorFee   > 0) pendingWithdrawals[author]   += authorFee;

        // Safe to push to seller — if their own wallet can't receive ETH,
        // only their own transaction fails, not anyone else's.
        (bool sent, ) = payable(msg.sender).call{value: net}("");
        require(sent, "CloutPostShares: transfer to seller failed");

        emit PostShareTrade(msg.sender, postId, author, false, amount, price, protocolFee, authorFee, newSupply);
    }

    /// @notice Withdraw any author or protocol fees credited to the caller.
    function withdrawFees() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "CloutPostShares: nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "CloutPostShares: withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }

    // ---------- views ----------
    function getHolding(uint256 postId, address holder) external view returns (uint256) {
        return shareBalance[postId][holder];
    }

    function getMarket(uint256 postId) external view returns (
        address author,
        uint256 supply,
        uint256 buyPrice1,   // cost to buy 1 share right now (before fees)
        uint256 sellPrice1   // proceeds from selling 1 share right now (before fees)
    ) {
        author     = postAuthor[postId];
        supply     = shareSupply[postId];
        buyPrice1  = getPrice(supply, 1);
        sellPrice1 = supply > 1 ? getPrice(supply - 1, 1) : 0;
    }

    // ---------- admin ----------
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "CloutPostShares: bad treasury");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setFees(uint16 newProtocolFeeBps, uint16 newAuthorFeeBps) external onlyOwner {
        require(newProtocolFeeBps + newAuthorFeeBps <= 2000, "CloutPostShares: combined fee too high");
        protocolFeeBps = newProtocolFeeBps;
        authorFeeBps   = newAuthorFeeBps;
        emit FeesUpdated(newProtocolFeeBps, newAuthorFeeBps);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CloutPostShares: bad owner");
        owner = newOwner;
    }
}
