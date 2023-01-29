// SPDX-License-Identifier: MIT
// Copyright (c) 2021 TrinityLabDAO
pragma solidity 0.8.7;

contract ECDSA { 
    uint nextValidatorId = 1;
    // количество подписей, необходимых для перевода активов
    uint24 public threshold;
    mapping(address => uint) public validators;

    
    struct SIGNATURES{
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function verify(bytes32 hash, SIGNATURES[] memory signatures) public view returns (bool) {
        uint confirmations = 0;
        //sig array 
        //1 - owner
        //2 - r
        //3 - s
        //4 - v
        for (uint i=0; i<signatures.length; i++){
           // bytes32 
            if(validators[ecrecover(hash, signatures[i].v, signatures[i].r, signatures[i].s)] != 0){
                confirmations++;
            }
        }
        if(confirmations >= threshold)
            return true;
        else
            return false;
    }
}