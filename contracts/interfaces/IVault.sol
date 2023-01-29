// SPDX-License-Identifier: Unlicense

pragma solidity 0.8.7;

interface IVault {
    function withdraw(
        address,
        address,
        uint256
    ) external;
}