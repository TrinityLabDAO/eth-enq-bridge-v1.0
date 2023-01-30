// SPDX-License-Identifier: MIT

pragma solidity 0.8.7;

interface IVault {
    function deposit(
        address,
        address,
        uint256
    ) external;

    function burn(
        address,
        address,
        uint256
    ) external;

    function withdraw(
        address,
        address,
        uint256
    ) external;
}