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
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./libraries/WrapedTokenDeployer.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/ECDSA.sol";
import "./interfaces/IVault.sol";

contract SPACE_BRIDGE is WrapedTokenDeployer, Ownable, ECDSA, ReentrancyGuard{
    using SafeERC20 for IERC20;

    IVault vault;

    mapping(bytes32 => bool) public invoices;

    uint24 immutable public network_id;
    
    mapping(uint256 => uint256) public known_networks;

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
    struct TKN{
        uint256 origin_network;
        bytes origin_hash;
    }
    mapping(address => TKN) public minted; 
    mapping(bytes => address) getAddressFromOriginHahs;
    mapping(bytes => mapping(bytes => mapping(uint256 => mapping(address => uint256))))  _transfers;

    function get_transfer(bytes memory src_address, bytes memory src_hash, uint256 src_network, address dst_address) 
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
        bytes src_hash;
        bytes src_address;
        uint256 src_network;
        bytes origin_hash;
        uint256 origin_network;
        uint256 nonce;
        string name;
        string symbol;
    }

    //@param id - network id
    constructor(uint24 id){
        network_id = id;
    }

    function set_vault(address _vault) onlyOwner public {
        vault = IVault(_vault);
    }

    function add_network(uint256 id, uint256 decimals) onlyOwner public {
        known_networks[id] = decimals;
    }

    function set_threshold(uint24 value) onlyOwner public {
        threshold = value;
    }

    function set_minted(uint256 origin_network, bytes memory origin_hash) internal returns(address addr)  {
        addr = address(bytes20(keccak256(abi.encodePacked(block.difficulty, block.timestamp))));
        minted[addr]= TKN(origin_network, origin_hash);
    }
    
    function addValidator(address validator) public onlyOwner {
        require(
             validators[validator] == 0, 
            "Owner exist"
        );
        validators[validator] = nextValidatorId;
        nextValidatorId++;
    }
    
    function removeValidator(address validator) public onlyOwner {
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
                amount <= IERC20(hash).balanceOf(msg.sender), 
                "Token balance is too low"
            );
        require(
                IERC20(hash).allowance(msg.sender, address(this)) >= amount,
                "Token allowance too low"
            );
        if(minted[hash].origin_hash.length == 0){
            emit Lock(dst_address, dst_network, amount, hash, msg.sender);
            require(address(vault) != address(0), "Vault not found");
            IERC20(hash).safeTransferFrom(msg.sender, address(vault), amount);
        }else{
            emit Burn(dst_address, dst_network, amount, hash, msg.sender);
            ERC20Burnable(hash).burnFrom(msg.sender, amount); 
        }
        
    }

    //
    //Claim
    //
    //@param ticket - структура TICKET
    //@param signatures - массив структуры SIGNATURES
    function claim(TICKET memory ticket, SIGNATURES[] memory signatures) public nonReentrant {
        require(
            ticket.dst_network == network_id,
            "Invalid destination network id"
        );
        require(
            ticket.nonce == (_transfers[ticket.src_address][ticket.src_hash][ticket.src_network][ticket.dst_address] + 1),
            "Invalid nonce"
        );
        _transfers[ticket.src_address][ticket.src_hash][ticket.src_network][ticket.dst_address] += 1;

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
                token_address = deploy(
                    string(abi.encodePacked("Wraped ", ticket.name)), 
                    string(abi.encodePacked("WR", substring(ticket.symbol, 0, 8))), 
                    ticket.origin_network, 
                    ticket.origin_hash);
                minted[token_address] = TKN({origin_network: ticket.origin_network, origin_hash: ticket.origin_hash});//         ВСТАВИТЬ {*new_hash*, *origin_hash*, *origin_network*} В *minted*
                getAddressFromOriginHahs[ticket.origin_hash] = token_address;
        
            }
            // передать_актив(*dst_address*, *amount*, *new_hash*)
            WrapedToken(token_address).mint(ticket.dst_address, ticket.amount);
            emit Mint(token_address, ticket.dst_address, ticket.amount);
        } else { //if(ticket.origin_network == network_id) { // ИНАЧЕ ЕСЛИ *origin_network* РАВНО *contract.network_id*
            address token = toAddress(abi.encode(ticket.origin_hash));
            require(address(vault) != address(0), "Vault not found");
            vault.withdraw(token, ticket.dst_address, ticket.amount); //  ТО передать_актив(*dst_address*, *amount*, *origin_hash*)
            emit Unlock(ticket.dst_address, ticket.amount);
        }
    }

    function substring(string memory str, uint startIndex, uint endIndex) internal pure returns (string memory ) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(endIndex-startIndex);
        for(uint i = startIndex; i < endIndex; i++) {
            result[i-startIndex] = strBytes[i];
        }
        return string(result);
    }

    function toBytes(address a) internal pure returns (bytes memory) {
        return abi.encode(a);
    }

    function toAddress(bytes memory a) internal pure returns (address addr) {
        addr = abi.decode(a,(address));
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
                ticket.dst_address,
                ticket.dst_network,
                ticket.amount,
                ticket.src_hash,
                ticket.src_address,
                ticket.src_network,
                ticket.origin_hash,
                ticket.origin_network,
                ticket.nonce,
                ticket.name,
                ticket.symbol
            )
        );
    }
 
    function ethInvoceHash(bytes32 enqTxHash, address token, address recipient, uint amount) private pure returns (bytes32)  {
        return keccak256(abi.encodePacked(enqTxHash, token, recipient,  amount));
    }
}