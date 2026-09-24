// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ArcYardKeys — bonding-curve creator keys for ArcYard.
 *
 * Design notes:
 *  - Every address is its own "creator". Anyone can buy that creator's keys;
 *    the first key must be bought by the creator itself (standard friend.tech
 *    safeguard so a market can't exist before the creator opts in).
 *  - Price follows a simple quadratic sum curve: the cost to move supply from
 *    a to b is sum(i^2) for i in [a, b), scaled down by CURVE_DIVISOR so early
 *    keys are cheap and price accelerates as supply grows.
 *  - Buys and sells both pay a protocol fee (bps of the trade value) split to
 *    a treasury address, plus a smaller subject fee paid to the creator
 *    themself for every trade of their own keys.
 *  - No proxy / upgradeability here on purpose, same philosophy as ArcYard.sol:
 *    a small, auditable, immutable v1.
 */
contract ArcYardKeys {
    event Trade(
        address indexed trader,
        address indexed creator,
        bool isBuy,
        uint256 keyAmount,
        uint256 usdcAmount,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 supply
    );
    event TreasuryUpdated(address indexed newTreasury);
    event FeesUpdated(uint16 protocolFeeBps, uint16 creatorFeeBps);
    event Withdrawal(address indexed who, uint256 amount);

    address public owner;
    address public treasury;
    uint16 public protocolFeeBps = 500; // 5% to protocol treasury
    uint16 public creatorFeeBps = 500;  // 5% to the creator being traded

    uint256 private constant CURVE_DIVISOR = 16000;
    uint256 public constant MIN_PRICE_PER_KEY = 0.1 ether; // $0.10 floor, matches GreenTown-style creator keys

    mapping(address => uint256) public keysSupply; // creator => total keys outstanding
    mapping(address => mapping(address => uint256)) public keysBalance; // creator => holder => balance

    /// @notice Pull-payment ledger for protocol and creator fees.
    /// Fees are credited here instead of pushed immediately, so a broken or hostile
    /// treasury or creator address can never freeze other users' trades (SWC-113).
    /// Anyone with a nonzero balance withdraws it themselves via withdrawFees().
    mapping(address => uint256) public pendingWithdrawals;

    modifier onlyOwner() {
        require(msg.sender == owner, "ArcYardKeys: not owner");
        _;
    }

    constructor(address _treasury) {
        require(_treasury != address(0), "ArcYardKeys: bad treasury");
        owner = msg.sender;
        treasury = _treasury;
    }

    // ---------- curve math ----------
    function _sumOfSquares(uint256 n) internal pure returns (uint256) {
        // sum_{i=0}^{n-1} i^2 == (n-1) * n * (2n-1) / 6, guarded for n == 0
        if (n == 0) return 0;
        return ((n - 1) * n * (2 * n - 1)) / 6;
    }

    /// @notice Raw curve price (before fees) to move `amount` keys starting at `supply`,
    /// with a $0.10-per-key floor so the very first keys are never free.
    function getPrice(uint256 supply, uint256 amount) public pure returns (uint256) {
        uint256 sum1 = _sumOfSquares(supply);
        uint256 sum2 = _sumOfSquares(supply + amount);
        uint256 curvePrice = ((sum2 - sum1) * 1 ether) / CURVE_DIVISOR;
        uint256 floorPrice = MIN_PRICE_PER_KEY * amount;
        return curvePrice > floorPrice ? curvePrice : floorPrice;
    }

    function getBuyPrice(address creator, uint256 amount) external view returns (uint256) {
        return getPrice(keysSupply[creator], amount);
    }

    function getSellPrice(address creator, uint256 amount) external view returns (uint256) {
        require(amount <= keysSupply[creator], "ArcYardKeys: amount exceeds supply");
        return getPrice(keysSupply[creator] - amount, amount);
    }

    function getBuyPriceAfterFee(address creator, uint256 amount) external view returns (uint256) {
        uint256 price = getPrice(keysSupply[creator], amount);
        return price + _feeSplit(price);
    }

    function getSellPriceAfterFee(address creator, uint256 amount) external view returns (uint256) {
        require(amount <= keysSupply[creator], "ArcYardKeys: amount exceeds supply");
        uint256 price = getPrice(keysSupply[creator] - amount, amount);
        return price - _feeSplit(price);
    }

    function _feeSplit(uint256 price) internal view returns (uint256 total) {
        total = (price * protocolFeeBps) / 10_000 + (price * creatorFeeBps) / 10_000;
    }

    // ---------- trading ----------
    function buyKeys(address creator, uint256 amount) external payable {
        require(amount > 0, "ArcYardKeys: zero amount");
        uint256 supply = keysSupply[creator];
        require(supply > 0 || creator == msg.sender, "ArcYardKeys: only creator can buy the first key");

        uint256 price = getPrice(supply, amount);
        uint256 protocolFee = (price * protocolFeeBps) / 10_000;
        uint256 creatorFee = (price * creatorFeeBps) / 10_000;
        uint256 totalCost = price + protocolFee + creatorFee;
        require(msg.value >= totalCost, "ArcYardKeys: insufficient payment");

        keysBalance[creator][msg.sender] += amount;
        keysSupply[creator] = supply + amount;
        uint256 newSupply = keysSupply[creator];

        // Fees are credited, not pushed — a broken treasury or creator address
        // can never block this purchase or anyone else's.
        if (protocolFee > 0) pendingWithdrawals[treasury] += protocolFee;
        if (creatorFee > 0) pendingWithdrawals[creator] += creatorFee;

        if (msg.value > totalCost) {
            // Refunding the caller's own overpayment back to the caller is safe to push:
            // if their own wallet can't receive ETH, only their own transaction fails.
            (bool refunded, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(refunded, "ArcYardKeys: refund failed");
        }

        emit Trade(msg.sender, creator, true, amount, price, protocolFee, creatorFee, newSupply);
    }

    function sellKeys(address creator, uint256 amount) external {
        require(amount > 0, "ArcYardKeys: zero amount");
        uint256 supply = keysSupply[creator];
        require(amount <= supply, "ArcYardKeys: amount exceeds supply");
        require(keysBalance[creator][msg.sender] >= amount, "ArcYardKeys: insufficient keys");
        // last key can never be sold, so a market always has a floor (matches friend.tech convention)
        require(supply - amount > 0 || keysBalance[creator][msg.sender] == supply, "ArcYardKeys: cannot sell the last key unless you hold all of it");

        uint256 price = getPrice(supply - amount, amount);
        uint256 protocolFee = (price * protocolFeeBps) / 10_000;
        uint256 creatorFee = (price * creatorFeeBps) / 10_000;
        uint256 net = price - protocolFee - creatorFee;

        keysBalance[creator][msg.sender] -= amount;
        keysSupply[creator] = supply - amount;
        uint256 newSupply = keysSupply[creator];

        // Fees are credited, not pushed — a broken or hostile creator address can never
        // trap a seller's own principal. Crediting unconditionally (even when creator == msg.sender)
        // avoids the previous version's leak where a creator's own creatorFee vanished into the
        // contract balance with no way to recover it.
        if (protocolFee > 0) pendingWithdrawals[treasury] += protocolFee;
        if (creatorFee > 0) pendingWithdrawals[creator] += creatorFee;

        // Paying the seller's own principal is safe to push: if their own wallet can't
        // receive ETH, only their own transaction fails — it never blocks anyone else.
        (bool sentSeller, ) = payable(msg.sender).call{value: net}("");
        require(sentSeller, "ArcYardKeys: seller transfer failed");

        emit Trade(msg.sender, creator, false, amount, price, protocolFee, creatorFee, newSupply);
    }

    /// @notice Withdraw any protocol or creator fees credited to the caller.
    /// Zeroes the balance before sending (checks-effects-interactions), so this
    /// function is safe even if the caller is a contract with an unusual receive hook.
    function withdrawFees() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "ArcYardKeys: nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "ArcYardKeys: withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }

    // ---------- admin ----------
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "ArcYardKeys: bad treasury");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setFees(uint16 newProtocolFeeBps, uint16 newCreatorFeeBps) external onlyOwner {
        require(newProtocolFeeBps + newCreatorFeeBps <= 2000, "ArcYardKeys: combined fee too high"); // hard cap 20%
        protocolFeeBps = newProtocolFeeBps;
        creatorFeeBps = newCreatorFeeBps;
        emit FeesUpdated(newProtocolFeeBps, newCreatorFeeBps);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ArcYardKeys: bad owner");
        owner = newOwner;
    }
}
