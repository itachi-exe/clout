// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICloutForTest {
    function createPost(bytes32 contentHash) external returns (uint256);
}

interface ICloutKeysForTest {
    function buyKeys(address creator, uint256 amount) external payable;
}

/// @notice Test-only contract that calls Clout as itself (so it is the real
/// post author or key creator) but reverts on a direct native-currency transfer.
/// Used to prove an unpayable author, creator, or treasury cannot freeze the market.
contract RevertingReceiver {
    function createPostAsSelf(address clout, bytes32 contentHash) external returns (uint256) {
        return ICloutForTest(clout).createPost(contentHash);
    }

    function buyFirstKeyAsSelf(address cloutKeys) external payable {
        ICloutKeysForTest(cloutKeys).buyKeys{value: msg.value}(address(this), 1);
    }

    receive() external payable {
        revert("RevertingReceiver: I never accept funds");
    }
}
