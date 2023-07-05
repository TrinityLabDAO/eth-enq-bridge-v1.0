// SPDX-License-Identifier: MIT
pragma solidity 0.8.7;

library Storage {
    
    struct NETWORK{
        bool valid;
        uint8 decimals;
    }

    struct TKN{
        uint256 origin_network;
        string origin_hash;
        uint8 origin_decimals;
    }
}

library Bridge {
    
    // dst_address - адрес получателя в сети назначения
    // dst_network - идентификатор сети назначения
    // amount - количество
    // src_hash - хеш токена в сети отправления
    // src_address - адрес отправителя в сети отправления
    // src_network - идентификатор сети отправления
    // origin_hash - хеш токена в сети происхождения
    // origin_network - идентификатор сети происхождения
    // nonce - порядковый номер перевода
    // origin_decimals - децималс оригинального токена
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
        uint8 origin_decimals;
    }
}