// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

library TransferKey {
    /// @dev Returns the key of transfer
    function compute(
        string memory src_address,
        string memory src_hash,
        uint256 src_network,
        address dst_address
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(src_address, src_hash, src_network, dst_address));
    }
}