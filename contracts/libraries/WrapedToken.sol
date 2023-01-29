// SPDX-License-Identifier: MIT
// Copyright (c) 2021 TrinityLabDAO
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IWrapedTokenDeployer.sol";

contract WrapedToken is ERC20, ERC20Burnable, Ownable {

    uint256 public origin;
    bytes public origin_hash;

    constructor(string memory name, string memory symbol) ERC20(name, symbol){
        (uint256 origin_,  bytes memory origin_hash_) = IWrapedTokenDeployer(msg.sender).parameters();
        origin = origin_;
        origin_hash = origin_hash_;
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}