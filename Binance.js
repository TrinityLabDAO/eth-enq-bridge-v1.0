const config = require("./config.json");
let Utils = require('./Utils.js');
const BnbApiClient = require('@binance-chain/javascript-sdk');
const WebSocket = require('ws');
class Binance{
    constructor(){
        // TODO: change to keystore / rawkey
        this.privKey = BnbApiClient.crypto.getPrivateKeyFromMnemonic(config.keys.binance.mnemonic);
        this.api = config.binance.apiURL; /// api string
        this.bnbClient = this.init();
    }
    heartbeat() {
        clearTimeout(this.pingTimeout);
        console.log('pong');
        // Use `WebSocket#terminate()` and not `WebSocket#close()`. Delay should be
        // equal to the interval at which your server sends out pings plus a
        // conservative assumption of the latency.
        this.pingTimeout = setTimeout(() => {
            this.terminate();
        }, 30000 + 1000);
    }
    listen(callback){
        this.conn = new WebSocket("wss://testnet-dex.binance.org/api/ws/" + config.keys.binance.pubkey);

        this.conn.on('open', function(evt) {
            console.log('Starting Binance websocket...');
            //this.send(JSON.stringify({ method: "subscribe", topic: "transfers", address: "tbnb1uz02ggr8jpzsrhegajt4hp4k0sgjq47wyqz4uq" }));
        });
        this.conn.on('message', callback);
        this.conn.on('error', function(evt) {
            console.log(evt);
        });
    }
    init(){
        let bnbClient = new BnbApiClient(this.api);
        bnbClient.setPrivateKey(this.privKey);
        bnbClient.chooseNetwork("testnet"); // or this can be "mainnet"
        bnbClient.initChain();
        return bnbClient;
    }
    async getTransactionInfo(hash){
        try{
            const txURL = `${this.api}api/v1/tx/${hash}?format=json`;
            let res = await Utils.apiRequest.get(txURL);
            return res;
        }
        catch (err) {
            console.log(err.stack);
            return null;
        }
    }
    async transfer(to, amount, memo = null){
        try{
            let asset = config.binance.asset; // asset string
            let from = config.keys.binance.pubkey;//BnbApiClient.crypto.getAddressFromPrivateKey(this.privKey); // addressFrom string
            let sequenceURL = `${this.api}api/v1/account/${from}/sequence`;
            let seqRes = await Utils.apiRequest.get(sequenceURL);
            const seq = seqRes.sequence || 0;
            let res = await this.bnbClient.transfer(from, to, amount, asset, memo, seq);
            return res;
        }
        catch (err) {
            console.log(err);
            return null;
        }
    };
}
module.exports.Binance = Binance;