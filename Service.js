const logger = require('./logger');
const DB = require('./db').DB;
const config = require("./config.json");
const Utils = require("./Utils.js");
let crypto = require('crypto');
const enecuum = require("./helpers/enecuum");
const Sender = require("./helpers/Sender").Sender;
const sender = new Sender(new DB({
    host: config.dbhost,
    user: config.dbuser,
    database: config.dbname,
    password: config.dbpass.toString()
}));
class Service{
    constructor(){
        this.db = new DB({
            host: config.dbhost,
            user: config.dbuser,
            database: config.dbname,
            password: config.dbpass.toString()
        });

        // let tx = Utils.randTx();
        // logger.info(tx);
    }
    compressKey(key){
        return Utils.compressKey(key);
    }
    uncompressKey(key){
        return Utils.uncompressKey(key);
    }
    async getHistory(pubkey){
        let data = await this.db.get_history(pubkey);
        return data;
    }
    async swapERC_ENQ(body){
        try {
            //let info = await Utils.getTransactionExtInfo(body.hash);
            /**
             * Check:
             * - contract check
             * - techAddress check
             * TODO: validate linkedAddr
             */

            let db_data = {
                pubkey : body.pubkey,
                in_hash : body.hash,
                in_addr : body.eth_addr,
                out_addr : body.pubkey,
                amount : body.amount,
                status : 0,
                date : Math.floor(new Date() / 1000),
                type : Utils.swapTypes.erc_enq,
                hold : 0
            };

            let res1 = await this.db.put_erc_tx([[body.hash, body.amount, 0]]);
            let res2 = await this.db.put_history(db_data);
            return true;
        }
        catch (err) {
            logger.error(err.stack);
            return false;
        }
    }

    async bridgeERC_ENQ(body) {
        try {

            let info = await Utils.apiRequest.get(config.nodeURL + '/api/v1/tx', {hash :body.hash});

            //let info = await Utils.getTransactionExtInfo(body.hash);

            /**
             * Check:
             * - contract check
             * - techAddress check
             * TODO: validate linkedAddr
             */
            let eth_token = (await this.db.get_eth_bridge_token(info.token_hash))[0].eth_hash;
            let sign = Utils.sign_msg(eth_token, info.data, info.amount, config.keys.enq.prv);
            let unlock = {
                token : eth_token,
                recipient : info.data,
                amount : info.amount,
                sign : sign.signature,
            };

           //let res1 = await this.db.put_erc_tx([[body.hash, body.amount, 0]]);
            //let res2 = await this.db.put_history(db_data);
            return unlock;
        }
        catch (err) {
            logger.error(err.stack);
            return false;
        }
    }

    async swapERC_BEP(body){
        try {
            let info = await Utils.getTransactionExtInfo(body.hash);
            /**
             * Check:
             * - contract check
             * - techAddress check
             * - TODO: check non-zero amount
             */
            if (info.ext.to.toLowerCase() !== config.eth_techAddr.toLowerCase()
                || info.to.toLowerCase() !== config.eth.tokenAddr.toLowerCase()
                || info.ext.linkedAddr === '') {
                return false;
            }
            // Convert BEP address from hex string to ascii
            info.ext.linkedAddr = Utils.hexToString('0x' + info.ext.linkedAddr);
            let db_data = {
                pubkey : body.pubkey,
                in_hash : info.hash,
                out_addr : info.ext.linkedAddr,
                in_addr : info.from,
                amount : info.ext.amount,
                status : 0,
                date : Math.floor(new Date() / 1000),
                type : Utils.swapTypes.erc_bep,
                hold : 0
            };
            let res1 = await this.db.put_erc_tx([[info.hash, info.ext.amount, 0]]);
            let res2 = await this.db.put_history(db_data);
            return true;
        }
        catch (err) {
            logger.error(err.stack);
            return false;
        }
    }
    async swapENQ_ERC(body){
        try{
            let tx = body.tx;
            tx.to = config.enq_techAddr;
            let verifiedHash = Utils.hashTx(tx);
            if(!Utils.verify(tx.from, verifiedHash, tx.sign)){
                logger.warn(`Verification failed for tx ${JSON.stringify(tx)}`);
                return {result : false, msg: "Sign not verified"};
            }
            logger.debug(JSON.stringify(tx));
            let limit = await Utils.getSwapLimit();
            if(tx.amount < limit)
                return {result : false, msg: "Less than minimal amount to swap"};
            let txhash = Utils.hashSignedTx(tx);
            let db_data = {
                pubkey : body.pubkey,
                in_hash : txhash,
                out_addr : body.eth_addr,
                in_addr : body.pubkey,
                amount : body.tx.amount,
                status : 0,
                date : Math.floor(new Date() / 1000),
                type : Utils.swapTypes.enq_erc,
                hold : 0
            };
            let result = await this.db.put_history(db_data);
            if(!result.affectedRows)
                return {result : false};

            let posResponse;
            // Trying to send tx to node
            // TODO: Add to Sender
            try{
                posResponse = await Utils.apiRequest.post(config.nodeURL + '/api/v1/tx', [tx]);
                // In case of bad response we save tx in pending (unknown tx state)
                if(!posResponse.result[0].hash)
                    throw new Error('Invalid response');
            }
            catch(err){
                logger.warn(`no response, save ${txhash} in pending`);
                let rec = await this.db.get_history_row('in_hash', txhash);
                tx.hash = txhash;
                tx.recid = rec[0].recid;
                let senderRes = await sender.add(tx);
                return {result : senderRes};
            }
            logger.info(`ENQ TX ${posResponse.result[0].hash} for pubkey ${body.pubkey} was sent to node`);
            if(posResponse){
                if(posResponse.result[0].hash !== txhash){
                    logger.error(`Hash mismatch, node: ${posResponse.result[0].hash} | ${txhash}`);
                    return {result : true};
                }
                await this.db.put_enq_tx([[txhash, body.tx.amount, 0]]);
                return posResponse;
            }
        }
        catch(err){
            logger.error(err.stack);
            return {result : false};
        }
    }
    async swapENQ_BEP(body){
        try{
            let tx = body.tx;
            tx.to = config.enq_techAddr;
            let verifiedHash = Utils.sha256(
                ['amount','from','nonce','to'].map(v => Utils.sha256(tx[v].toString().toLowerCase())).join("")
            );
            if(!Utils.verify(tx.from, verifiedHash, tx.sign)){
                logger.warn(`Verification failed for tx ${JSON.stringify(tx)}`);
                return {result : false, msg: "Sign not verified"};
            }
            logger.debug(JSON.stringify(tx));
            // TODO: check swap limit for BEP swap
            // let limit = await Utils.getSwapLimit();
            // if(tx.amount < limit)
            //     return {result : false, msg: "Less than minimal amount to swap"};

            let posResponse = await Utils.apiRequest.post(config.nodeURL + '/api/v1/tx', [tx]);
            logger.info(`ENQ TX ${posResponse.result[0].hash} for pubkey ${body.pubkey} was sent to node`);
            let db_data = {
                pubkey : body.pubkey,
                in_hash : posResponse.result[0].hash,
                out_addr : body.linked_addr,
                in_addr : body.pubkey,
                amount : body.tx.amount,
                status : 0,
                date : Math.floor(new Date() / 1000),
                type : Utils.swapTypes.enq_bep,
                hold : 0
            };
            await this.db.put_enq_tx([[posResponse.result[0].hash, body.tx.amount, 0]]);
            let result = await this.db.put_history(db_data);
            if(result.affectedRows)
                return posResponse;
            else
                return {result : false};
        }
        catch(err){
            logger.error(err.stack);
            return {result : false};
        }
    }
    async auth(token, sign) {
        let dbres = await this.db.get_token(token);
        if(dbres === undefined)
            return false;
        if((dbres.cram === null))
            return false;
        await this.db.put_message({token: token, cram: null});
        let result = Utils.verify(dbres.pubkey, dbres.cram, sign);
        logger.debug(`${token} auth: ${result}`);
        return result;
    }
    async logout(token) {
        try{
            let dbres = await this.db.delete_token(token);
            if(dbres.affectedRows)
                return true;
            return false;
        }
        catch (err) {
            logger.error(err.stack);
            return {result : false};
        }
    }
    async login(pubkey, ua) {
        try{
            let token = crypto.randomBytes(16).toString('hex');
            let dbData = {
                token : token,
                pubkey  : pubkey,
                user_agent : ua
            };
            let dbres = await this.db.put_token(dbData);
            if(!dbres.affectedRows)
                return false;
            return token;
        }
        catch (err) {
            logger.error(err.stack);
            return false;
        }
    }
    async challenge(token) {
        try{
            let msg = crypto.randomBytes(32).toString('hex');
            // TODO: check db response
            let dbres = await this.db.put_message({token: token, cram: msg});
            if(!dbres)
                return false;
            return msg;
        }
        catch (err) {
            logger.error(err.stack);
            return false;
        }
    }
}
module.exports.Service = Service;