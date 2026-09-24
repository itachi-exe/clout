// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IArcYardForTest {
    function createPost(bytes32 contentHash) external returns (uint256);
}

interface IArcYardKeysForTest {
    function buyKeys(address creator, uint256 amount) external payable;
}

/// @notice Test-only contract that calls ArcYard as itself (so it is the real
/// post author or key creator) but reverts on a direct native-currency transfer.
/// Used to prove an unpayable author, creator, or treasury cannot freeze the market.
contract RevertingReceiver {
    function createPostAsSelf(address arcYard, bytes32 contentHash) external returns (uint256) {
        return IArcYardForTest(arcYard).createPost(contentHash);
    }

    function buyFirstKeyAsSelf(address arcYardKeys) external payable {
        IArcYardKeysForTest(arcYardKeys).buyKeys{value: msg.value}(address(this), 1);
    }

    receive() external payable {
        revert("RevertingReceiver: I never accept funds");
    }
}
