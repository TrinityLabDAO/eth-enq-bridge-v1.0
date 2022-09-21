pragma solidity 0.8.7;

contract ECDSA { 
    uint nextValidatorId = 1;
    uint public validatorsCount = 0;
    mapping(address => uint) public validators;

    function verify(bytes32 hash, uint8[] memory v, bytes32[] memory r, bytes32[] memory s) public view returns (bool) {
        uint confirmations = 0;
        //sig array 
        //1 - owner
        //2 - r
        //3 - s
        //4 - v
        for (uint i=0; i<v.length; i++){
           // bytes32 
            if(validators[ecrecover(hash, v[i], r[i], s[i])] != 0){
                confirmations++;
            }
        }
        if(confirmations >= (validatorsCount/2))
            return true;
        else
            return false;
    }
}