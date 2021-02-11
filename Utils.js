const r = require('jsrsasign');
const crypto = require('crypto');
const config = require("./config.json");
const logger = require('./logger');
const CONTRACT_ABI = require("./abi.json");
const web3 = require('web3');
//const web3js = new web3(new web3.providers.HttpProvider(config.eth.RPC));
let web3js = getWeb3Instance();
const contract = new web3js.eth.Contract(CONTRACT_ABI, config.eth.tokenAddr);
// const provider = web3js.currentProvider;
// provider.on("connect", function () {
//     logger.info("Infura Websocket Provider connection established!");
// });
// provider.on("error", function (err) {
//     logger.error(err);
// });
const Tx = require('ethereumjs-tx').Transaction;

function getWeb3Instance(){
    let web3js = new web3(new web3.providers.WebsocketProvider(config.eth.wsRPC));
    const provider = web3js.currentProvider;
    provider.on("connect", function () {
        logger.info("Infura Websocket Provider connection established!");
    });
    provider.on("error", async function (err) {
        logger.error(err);
        await sleep(5000);
        return getWeb3Instance();
    });
    return web3js;
}

function apiRequest(options){
    let request = require('request');
    options.timeout = 15000;
    logger.debug(JSON.stringify(options));
    return new Promise(function(resolve, reject){
            request(options, (err, res, body) => {
                if (err) {
                    return reject(new Error('apiRequest error : ' + err));
                }
                if(!body)
                    return resolve(null);
                logger.debug(body);
                if(options.method === 'GET')
                    try {
                        body = JSON.parse(body);
                    }
                    catch (err) {
                        return reject(new Error('apiRequest parse error : ' + err));
                    }
                return resolve(body);
            });
    });
}

async function getBalance(addr){
    let balanceEther = await web3js.eth.getBalance(addr);
    return web3js.utils.fromWei(balanceEther);
}

function getContract(){
    return contract;
}
module.exports = {
    sign : function(prvkey, msg){
        let sig = new r.Signature({"alg": 'SHA256withECDSA'});
        sig.init({ d: prvkey, curve: 'secp256k1' });
        sig.updateString(msg);
        return sig.sign();
    },
    test : function(){
        return new Promise(function(resolve, reject){
            return reject(new Error('api error'))
        });
    },
    verify : function(cpkey, msg, signedMsg){
        let sig = new r.Signature({ "alg": 'SHA256withECDSA' });
        try{
            let pkey = crypto.ECDH.convertKey(cpkey, 'secp256k1', 'hex', 'hex', 'uncompressed');
            sig.init({ xy: pkey, curve: 'secp256k1' });
            sig.updateString(msg);
            return sig.verify(signedMsg);
        }
        catch (e) {
            logger.error(e.stack);
            return false;
        }
    },
    randTx : function(){
        let keys = this.genKeys();
        let tx = {
            amount : Math.floor(Math.random() * 1e5),
            from: keys.pubkey,
            nonce: Math.floor(Math.random() * 1e15),
            to: crypto.randomBytes(32).toString('hex')
        };
        tx.sign = this.sign(keys.prvkey, this.hashTx(tx));
        return tx;
    },
    genKeys : function(){
        const bob = crypto.createECDH('secp256k1');
        bob.generateKeys();
        return {
            prvkey : bob.getPrivateKey().toString('hex'),
            pubkey : bob.getPublicKey('hex', 'compressed')
        };
    },
    sha256 : function(str){
        return crypto.createHash('sha256').update(str).digest('hex');
    },
    hashSignedTx : function(tx){
        return this.sha256(
            ['amount','data','from','nonce','sign','ticker','to'].map(v => this.sha256(tx[v].toString().toLowerCase())).join("")
        );
    },
    hashTx : function(tx){
        return this.sha256(
            ['amount','data','from','nonce','ticker','to'].map(v => this.sha256(tx[v].toString().toLowerCase())).join("")
        );
    },
    calc_fee(tokendata, amount){
        amount = BigInt(amount);
        if(tokendata.fee_type === 0)
            return BigInt(tokendata.fee_value);
        if(tokendata.fee_type === 1){
            if(amount <= tokendata.fee_min)
                return BigInt(tokendata.fee_min);
            let fee =  amount / (this.PERCENT_FORMAT_SIZE + BigInt(tokendata.fee_value)) * BigInt(tokendata.fee_value);
            //fee = Number(fee);
            if(fee < tokendata.fee_min)
                return BigInt(tokendata.fee_min);
            return fee;
        }
    },
    PERCENT_FORMAT_SIZE : BigInt(10000),
    ENQ_TOKEN_NAME : "0000000000000000000000000000000000000000000000000000000000000000",
    swapTypes : {
        erc_enq : 1,
        erc_bep : 2,
        enq_erc : 3,
        enq_bep : 4,
        bep_enq : 5
    },
    enq_regexp : /^(02|03)[0-9a-fA-F]{64}$/i,
    hexToBigint : function(num){
        return BigInt(web3js.utils.toBN(num));
    },
    hexToString : function(str){
        return web3js.utils.hexToAscii(str)
    },
    uncompressKey(key){
        return crypto.ECDH.convertKey(key, 'secp256k1', 'hex', 'hex', 'uncompressed');
    },
    compressKey(key){
        return crypto.ECDH.convertKey(key, 'secp256k1', 'hex', 'hex', 'compressed');
    },
    apiRequest : {
        get : function(url, data){
            let options = {
                method:  'GET',
                url: url,
                qs : data
            };
            return apiRequest(options)
        },
        post : function(url, data){
            let options = {
                method:  'POST',
                url: url,
                body: data,
                json: true
            };
            return apiRequest(options)
        }
    },

    getSwapLimit : async function(){
        // return this.apiRequest.get('swaplimit');
        return config.eth.minSwapLimit;
    },
    // This request doesn't get tx status.
    getTransactionExtInfo : async function(txHash){
        const trx = await web3js.eth.getTransaction(txHash);
        trx.ext = {
            method : trx.input.substring(0, 10),
            to : ('0x' + trx.input.substring(34, 74)),
            amount : BigInt(web3js.utils.toBN('0x' + trx.input.substring(74, 138)).toString()),
            linkedAddr : trx.input.substring(138, trx.input.length)
        };
        return trx;
    },
    // This request returns null while tx is in pending.
    getTransactionStatus : async function(txHash) {
        try {
            let trx = await web3js.eth.getTransactionReceipt(txHash);
            // Tx probably in pending
            if(!trx)
                return;
            logger.debug(trx);
            // Check logs
            // There are two reasons of empty log array - self-sending and bad tx behavior
            if(trx.logs.length){
                const currentBlock = await web3js.eth.getBlockNumber();
                return {
                    confirmations : trx.blockNumber === null ? 0 : currentBlock - trx.blockNumber,
                    status : trx.status,
                    data : trx
                }
            }
            return {status : false};
        }
        catch (err) {
            logger.error(err.stack)
        }
    },
    // This request returns null while tx is in pending.
    getReceipt : async function(txHash) {
        try {
            const trx = await web3js.eth.getTransactionReceipt(txHash);
            const currentBlock = await web3js.eth.getBlockNumber();
            return trx.blockNumber === null ? 0 : currentBlock - trx.blockNumber
        }
        catch (err) {
            logger.error(err)
        }
    },
    // This reuqest returns tx info, but no status. Bad tx will be in block too
    getConfirmations : async function(txHash) {
        try {
            const trx = await web3js.eth.getTransaction(txHash);
            const currentBlock = await web3js.eth.getBlockNumber();
            return trx.blockNumber === null ? 0 : currentBlock - trx.blockNumber
        }
        catch (err) {
            logger.error(err)
        }
    },
    getGas : async function(){
        let gas = parseInt(await web3js.eth.getGasPrice()) + 2000000000;
        if(config.eth.cashierGasPrice)
            return config.eth.cashierGasPrice;
        return (gas > config.eth.cashierGasPriceLimit) ? config.eth.cashierGasPriceLimit : gas;
    },
    getBalance : getBalance,
    getContract : getContract,
    createTokenTransaction : async function(toAddress, amount, data){
        return new Promise(async function(resolve, reject) {
            try {
                let account = config.keys.eth[0];
                let from = account.pub;
                let contract = this.getContract();
                let count = await web3js.eth.getTransactionCount(from, "pending");
                let gasPrice = await this.getGas();
                let rawTransaction = {
                    "from": from,
                    "nonce": web3js.utils.toHex(count),
                    "gasPrice": web3js.utils.toHex(gasPrice),
                    "gasLimit": web3js.utils.toHex(config.eth.cashierGasLimit),
                    "to": config.eth.tokenAddr,
                    "value": "0x0",
                    "data": contract.methods.transfer(toAddress, amount).encodeABI() + data
                };
                let privKey = new Buffer.from(account.prv, 'hex');
                //logger.debug(rawTransaction);

                let transaction = new Tx(rawTransaction, {chain: config.eth.chainId});
                transaction.sign(privKey);

                return resolve({
                    hash : ('0x' + transaction.hash().toString('hex')),
                    raw : ('0x' + transaction.serialize().toString('hex'))
                });
            }
            catch (err) {
                logger.error(err);
                return reject(new Error(err));
            }
        }.bind(this));
    },
    sendTokenTransaction : async function(tx, amount){
        return new Promise(async function(resolve, reject) {
            try {
                let contract = getContract();
                let from = config.keys.eth[0].pub;
                let balance = await contract.methods.balanceOf(from).call();
                if (BigInt(balance) < BigInt(amount))
                    return reject(new Error('out of tokens'));

                let ethLimit =  web3js.utils.toHex(config.eth.cashierGasPrice * config.eth.cashierGasLimit);
                ethLimit = web3js.utils.fromWei(ethLimit);
                let balanceEther = await getBalance(from);

                if (balanceEther < ethLimit)
                    return reject(new Error('out of ether'));

                web3js.eth.sendSignedTransaction(tx)
                .on('transactionHash', function (hash) {
                    return resolve(hash)
                })
            }
            catch (err) {
                logger.error(err);
                return reject(new Error(err));
            }
        });
    },
    subscribe : async function(cb) {
        let contract = getContract();
        contract.events.Transfer({
            filter: {to: config.eth_techAddr},
            fromBlock: 'latest'
        }, (error, event) => {
            return cb(error, event);
            //console.log(event.transactionHash);
        })
    },
    getBlock : async function(){
        return await web3js.eth.getBlockNumber();
    },
    sleep : function(ms){
        return new Promise(function(resolve, reject){
            setTimeout(() => resolve(), ms)
        });
    }
};