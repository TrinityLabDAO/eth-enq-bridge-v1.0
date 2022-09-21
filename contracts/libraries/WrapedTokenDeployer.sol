pragma solidity >=0.7.6;

import "../interface/IWrapedTokenDeployer.sol";

contract WrapedTokenDeployer is IWrapedTokenDeployer {
    struct Parameters {
        string origin;
        string origin_hash;
        uint8 decimals;
    }

    /// @inheritdoc IWrapedTokenDeployer
    Parameters public override parameters;

    /// @dev Deploys a pool with the given parameters by transiently setting the parameters storage slot and then
    /// clearing it after deploying the pool.
    /// @param name token name
    /// @param symbol token symbol
    /// @param origin chain ID
    /// @param origin_hash hash in origin chain
    /// @param decimals token decimals
    function deploy(
        string memory name,
        string memory symbol,
        string memory origin,
        string memory origin_hash,
        uint8 decimals
    ) internal returns (address token) {
        parameters = Parameters({origin: origin, origin_hash: origin_hash, decimals: decimals});
        token = address(new WrapedToken{salt: keccak256(abi.encode(origin, origin_hash, decimals))}(name, symbol));
        delete parameters;
    }
}