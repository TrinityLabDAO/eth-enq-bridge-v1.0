// SPDX-License-Identifier: MIT
// Copyright (c) 2021 TrinityLabDAO

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
pragma solidity 0.8.7;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./libraries/WrapedTokenDeployer.sol";

import "./libraries/ECDSA.sol";
import "./interfaces/IVault.sol";

contract SPACE_BRIDGE is WrapedTokenDeployer, ECDSA, ReentrancyGuard{
    using SafeERC20 for IERC20;

    IVault public vault;
    address public governance;
    address public pendingGovernance;

    uint24 immutable public network_id;
    
    event Lock(
        bytes dst_address, 
        uint24 dst_network,
        uint256 amount, 
        address hash,
        address src_address
    );

    event Burn(
        bytes dst_address, 
        uint24 dst_network,
        uint256 amount, 
        address hash,
        address src_address
    );

    event Unlock(
        address dst_address,
        uint256 amount
    );

    event Mint(
        address token_address,
        address dst_address,
        uint256 amount
    );

    //minted содержит данные о выпущенных в сети обёрнутых активах {wrapped_hash, origin, origin_hash}, где
    //wrapped_hash - хеш обёрнутого токена
    //origin_network - идентификатор сети происхождения
    //origin_hash - хеш оригинального токена
    /*
    struct TKN{
        uint256 origin_network;
        bytes origin_hash;
    }
    */
    struct TKN{
        uint256 origin_network;
        string origin_hash;
    }
    
    mapping(address => TKN) public minted; 
    mapping(string => address) getAddressFromOriginHahs;
    mapping(string => mapping(string => mapping(uint256 => mapping(address => uint256))))  _transfers;

    struct NETWORK{
        bool valid;
        uint8 decimals;
    }
    mapping(uint256 => NETWORK) public known_networks;

    //function get_transfer(bytes memory src_address, bytes memory src_hash, uint256 src_network, address dst_address) 
    function get_transfer(string memory src_address, string memory src_hash, uint256 src_network, address dst_address) 
    public 
    view 
    returns (uint256) 
    {        
        return _transfers[src_address][src_hash][src_network][dst_address];    
    }

    // dst_address - адрес получателя в сети назначения
    // dst_network - идентификатор сети назначения
    // amount - количество
    // src_hash - хеш токена в сети отправления
    // src_address - адрес отправителя в сети отправления
    // src_network - идентификатор сети отправления
    // origin_hash - хеш токена в сети происхождения
    // origin_network - идентификатор сети происхождения
    // nonce - порядковый номер перевода
    struct TICKET{
        address dst_address;
        uint256 dst_network;
        uint256 amount;
        string src_hash;
        string src_address;
        uint256 src_network;
        string origin_hash;
        uint256 origin_network;
        uint256 nonce;
        string name;
        string symbol;
    }

    //@param id - network id
    constructor(uint24 id){
        network_id = id;
//TODO: remove
        known_networks[1] = NETWORK({valid:true, decimals:10});
        known_networks[11] = NETWORK({valid:true, decimals:10});
        known_networks[17] = NETWORK({valid:true, decimals:2});
        known_networks[23] = NETWORK({valid:true, decimals:3});
        known_networks[29] = NETWORK({valid:true, decimals:4});
//TODO END
    }

    function set_vault(address _vault) onlyGovernance public {
        vault = IVault(_vault);
    }
    
    function add_network(uint256 id, uint8 decimals_) onlyGovernance public {
        known_networks[id] = NETWORK({valid:true, decimals:decimals_});
    }

    function set_threshold(uint24 value) onlyGovernance public {
        threshold = value;
    }

    function addValidator(address validator) public onlyGovernance {
        require(
             validators[validator] == 0, 
            "Owner exist"
        );
        validators[validator] = nextValidatorId;
        nextValidatorId++;
    }
    
    function removeValidator(address validator) public onlyGovernance {
        require(
             validators[validator] != 0, 
            "dosnt exist owner"
        );
        delete validators[validator];
    }

    //
    //lock
    //
    //@param dst_address - адрес получателя в сети назначения
    //@param dst_network - идентификатор сети назначения
    //@param amount - количество
    //@param hash - хеш токена в сети отправления
    function lock(bytes memory dst_address, uint24 dst_network, uint256 amount, address hash) public nonReentrant {
        require(
            known_networks[dst_network].valid,
            "Unknown dst_network"
        );

        uint8 src_decimals;
        uint8 dst_decimals;

        src_decimals = ERC20Burnable(hash).decimals();
        dst_decimals = known_networks[dst_network].decimals;
        
        if (dst_decimals < src_decimals)
        require(
            amount % (10 ** (src_decimals - dst_decimals)) == 0,
            "Fraction too low"
        );
        
        require(
                amount <= IERC20(hash).balanceOf(msg.sender), 
                "Token balance is too low"
            );

        require(
                address(vault) != address(0), 
                "Vault not found"
            );

        require(
                IERC20(hash).allowance(msg.sender, address(vault)) >= amount,
                "Token allowance to Vault too low"
            );

        string memory t = toAsciiString(hash);
        lock_map[t] = hash;

        if(bytes(minted[hash].origin_hash).length == 0){
            vault.deposit(hash, msg.sender, amount);
            emit Lock(dst_address, dst_network, amount, hash, msg.sender);
        }else{
            vault.burn(hash, msg.sender, amount);
            emit Burn(dst_address, dst_network, amount, hash, msg.sender);
        }
        
    }

    function toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = char(hi);
            s[2*i+1] = char(lo);            
        }
        return string(s);
    }

    function char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }

    mapping(string => address) public lock_map;

    function claim(TICKET memory ticket, SIGNATURES[] memory signatures) public nonReentrant {
        require(
            ticket.dst_network == network_id,
            "Invalid destination network id"
        );
        require(
            ticket.nonce == (_transfers[ticket.src_address][ticket.src_hash][ticket.src_network][ticket.dst_address] + 1),
            "Invalid nonce"
        );

        bytes32 data_hash = ethMessageHash(ethTicketHash(ticket));
        require(
            verify(data_hash, signatures), 
            "Invalid signature"
        );

        if((ticket.origin_network == ticket.src_network) || ((ticket.origin_network != ticket.src_network) && (ticket.origin_network != network_id))) { //EСЛИ *origin_network* РАВНО *src_network*
            address token_address = getAddressFromOriginHahs[ticket.origin_hash];
            // ТО   ЕСЛИ {*origin_hash*, *origin_network*} СОДЕРЖИТСЯ В {*contract.minted.origin.hash*, *contract.minted.origin.network*}
            //     TO сминтить_токен(*amount*, *contract.minted.wrapped_hash*)
            //         передать_актив(*dst_address*, *amount*, *contract.minted.wrapped_hash*)
            //     ИНАЧЕ 
            if(token_address == address(0x0)){
                //         *new_hash* = создать_токен(*amount*)
                bytes memory bytes_hash = bytes(ticket.origin_hash);
                token_address = deploy(
                    string(abi.encodePacked(ticket.name)), 
                    string(abi.encodePacked(ticket.symbol)), 
                    ticket.origin_network, 
                    bytes_hash);
                minted[token_address] = TKN({origin_network: ticket.origin_network, origin_hash: ticket.origin_hash});//         ВСТАВИТЬ {*new_hash*, *origin_hash*, *origin_network*} В *minted*
                getAddressFromOriginHahs[ticket.origin_hash] = token_address;
            }
            // передать_актив(*dst_address*, *amount*, *new_hash*)
            WrapedToken(token_address).mint(ticket.dst_address, ticket.amount);
            emit Mint(token_address, ticket.dst_address, ticket.amount);
        } else { //if(ticket.origin_network == network_id) { // ИНАЧЕ ЕСЛИ *origin_network* РАВНО *contract.network_id*
            vault.withdraw(lock_map[ticket.origin_hash], ticket.dst_address, ticket.amount); //  ТО передать_актив(*dst_address*, *amount*, *origin_hash*)
            emit Unlock(ticket.dst_address, ticket.amount);
        }
        _transfers[ticket.src_address][ticket.src_hash][ticket.src_network][ticket.dst_address] += 1;
    }

    /**
    * @dev prefix a bytes32 value with "\x19Ethereum Signed Message:" and hash the result
    */
    function ethMessageHash(bytes32 message) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32"  , message)
        );
    }

    function ethTicketHash(TICKET memory ticket) internal pure returns (bytes32)  {
        return keccak256(abi.encodePacked(
            ticket.amount,
            ticket.dst_address,
            ticket.dst_network,
            ticket.name,
            ticket.nonce,
            ticket.origin_hash,
            ticket.origin_network,
            ticket.src_address,
            ticket.src_hash,
            ticket.src_network,
            ticket.symbol));
    }

    
    /**
     * @notice Governance address is not updated until the new governance
     * address has called `acceptGovernance()` to accept this responsibility.
     */
    function setGovernance(address _governance) external onlyGovernance {
        pendingGovernance = _governance;
    }

    /**
     * @notice `setGovernance()` should be called by the existing governance
     * address prior to calling this function.
     */
    function acceptGovernance() external {
        require(msg.sender == pendingGovernance, "pendingGovernance");
        governance = msg.sender;
    }

    modifier onlyGovernance {
        require(msg.sender == governance, "governance");
        _;
    }
}
