pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/erc20/erc20.sol";

contract WrapedToken is ERC20 {
    string public origin;
    string public origin_hash;
    uint8 immutable _decimals;

    constructor(string memory name, string memory symbol) ERC20(name, symbol){
        (string memory origin_, string memory origin_hash_, uint8 decimals_) = IWrapedTokenDeployer(msg.sender).parameters();
        origin = origin_;
        origin_hash = origin_hash_;
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}