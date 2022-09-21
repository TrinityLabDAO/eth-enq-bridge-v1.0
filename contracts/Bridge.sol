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
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./libraries/WrapedTokenDeployer.sol";

import "./libraries/Ownable.sol";
import "./libraries/ECDSA.sol";

contract TABULA_BRIDGE is WrapedTokenDeployer, Ownable, ECDSA, ReentrancyGuard{

    mapping(bytes32 => bool) public invoices;

    uint24 immutable public network_id;
    // количество подписей, необходимых для перевода активов
    uint24 public threshold;
 
    //minted содержит данные о выпущенных в сети обёрнутых активах {wrapped_hash, origin, origin_hash}, где
    //wrapped_hash - хеш обёрнутого токена
    //origin - идентификатор сети происхождения
    //origin_hash - хеш оригинального токена
    struct TKN{
        uint24 origin;
        bytes32 origin_hash;
    }
    mapping(address => TKN) public minted; 
    //transfers содержит данные о совершённых переводах {src_address, dst_address, src_network, nonce}

    // src_address - адрес отправителя в сети отправления
    // dst_address - адрес получателя в сети назначения
    // src_network - идентификатор сети отправления
    // src_hash - хеш токена в сети отправления
    // nonce - порядковый номер перевода
    struct TRAS{
        bytes32 dst_address;
        uint24 src_network;
        bytes32 src_hash;
        uint256 nonce;
    }
    mapping(address => TRAS) public transfers; 

    // dst_address - адрес получателя в сети назначения
    // dst_network - идентификатор сети назначения
    // amount - количество
    // src_hash - хеш токена в сети отправления
    // src_address - адрес отправителя в сети отправления
    // src_network - идентификатор сети отправления
    // origin_hash - хеш токена в сети происхождения
    // origin_network - идентификатор сети происхождения
    // nonce - порядковый номер перевода
    struct ticket{
        bytes32 dst_address;
        uint24 dst_network;
        uint256 amount;
        bytes32 src_hash;
        bytes32 src_address;
        uint24 src_network;
        bytes32 origin_hash;
        uint24 origin_network;
        uint256 origin;
    }

    //@param id - network id
    constructor(uint24 id){
        network_id = id;
    }

    function set_minted(uint24 origin, bytes32 origin_hash) public returns(address addr)  {
        addr = address(bytes20(keccak256(abi.encodePacked(block.difficulty, block.timestamp))));
        minted[addr]= TKN(origin, origin_hash);
    }
    
    function addValidator(address validator) public isOwner {
        require(
             validators[validator] == 0, 
            "Owner exist"
        );
        validatorsCount++;
        validators[validator] = nextValidatorId;
        nextValidatorId++;
    }
    
    function removeValidator(address validator) public isOwner {
        require(
             validators[validator] != 0, 
            "dosnt exist owner"
        );
        validatorsCount--;
        delete validators[validator];
    }

    //@param dst_address - адрес получателя в сети назначения
    //@param dst_network - идентификатор сети назначения
    //@param amount - количество
    //@param hash - хеш токена в сети отправления
    function lock(bytes32 dst_address, uint24 dst_network, uint256 amount, address hash) public nonReentrant {
        require(
                amount <= IERC20(hash).balanceOf(msg.sender), 
                "Token balance is too low"
            );
        require(
                IERC20(hash).allowance(msg.sender, address(this)) >= amount,
                "Token allowance too low"
            );
        if(minted[hash]){
            ERC20Burnable(hash).burnFrom(msg.sender, amount);
        }else{
            bool sent = IERC20(hash).transferFrom(msg.sender, address(this), amount);
            require(sent, "Token transfer failed");
        }

    }

    //
    //BRIDGE ETH->ENQ
    //Deposit to contract
    //
    function lock_old(address token, uint256 amount, string memory receiver) public nonReentrant {
        require(
            amount <= IERC20(token).balanceOf(msg.sender), 
            "Token balance is too low"
        );
        require(
            IERC20(token).allowance(msg.sender, address(this)) >= amount,
            "Token allowance too low"
        );
        require(
            bytes(receiver).length == 66,
            "Invalid receiver ENQ address format"
        );
        //balances[msg.sender][token] = balances[msg.sender][token].add(amount);
        bool sent = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(sent, "Token transfer failed");
    }
    
    //
    //BRIDGE ENQ->ETH
    //Unlock from contract
    //
    function unlock(bytes32 enqTxHash, address token, address receiver, uint amount, uint8[] memory v, bytes32[] memory r, bytes32[] memory s) public nonReentrant { 
        bytes32 invoice = ethInvoceHash(enqTxHash, token, receiver, amount);
        bytes32 data_hash = ethMessageHash(invoice);
        bool exits = invoices[data_hash];
        require(!exits, "Invoice has already been used.");
        
        bool valid_sign = verify(data_hash, v, r, s);
        require(valid_sign, "Invalid signature. Unlock failed");

        bool sent = IERC20(token).transfer(receiver, amount);
        require(sent, "Token transfer failed");
        invoices[data_hash] = true;
    }

    function testDeploy(
        string memory name,
        string memory symbol,
        string memory origin,
        string memory origin_hash,
        uint8 decimals
    ) external returns (address token) {
        //parameters = Parameters({factory: factory, token0: token0, token1: token1, fee: fee, tickSpacing: tickSpacing});
        //token = address(new WrapedToken{salt: keccak256(abi.encode(token0, token1, fee))}());
        //delete parameters;

        token = deploy(name, symbol, origin, origin_hash, decimals);
    }


    /**
    * @dev prefix a bytes32 value with "\x19Ethereum Signed Message:" and hash the result
    */
    function ethMessageHash(bytes32 message) private pure returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32"  , message)
        );
    }
 
    function ethInvoceHash(bytes32 enqTxHash, address token, address recipient, uint amount) private pure returns (bytes32)  {
        return keccak256(abi.encodePacked(enqTxHash, token, recipient,  amount));
    }
}