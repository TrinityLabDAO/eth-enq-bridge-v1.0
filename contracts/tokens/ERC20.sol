pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    uint8 immutable _decimals;
    
    constructor(string memory name, string memory symbol, uint256 initialSupply, uint8 __decimals) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
        _decimals = __decimals;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}