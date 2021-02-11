const r = require('jsrsasign');
const crypto = require('crypto');
const config = require("../config.json");
const logger = require('../logger');
const Utils = require("../Utils.js");
const enecuum = require("./enecuum");

let instance = null;
class Sender{
    constructor(db){
        if (!instance) {
            instance = this;
        }
        this.db = db;
        this.defaultDelay = 10000;
        this.working = true;
        this.watch();
        return instance;
    }
    async watch(){
        logger.info('Enecuum Node watcher started');
        while(this.working){
            try {
                let inputs = await this.db.get_prepending_enq();
                logger.silly(`${inputs.length} ENQ TXs in pending`);
                for (let i = 0; i < inputs.length; i++) {
                    let rec = inputs[i];
                    let tx = {
                        amount : rec.amount,
                        data : rec.data,
                        from : rec.from,
                        nonce : rec.nonce,
                        sign : rec.sign,
                        ticker : rec.ticker,
                        to : rec.to
                    };
                    logger.debug(`Trying to send TX ${rec.hash}...`);
                    let res = await enecuum.sendTransaction(tx);
                    if(res){
                        if(res.result[0].hasOwnProperty('status')){
                            logger.info(`ENQ TX ${res.result[0].hash} for pubkey ${rec.from} was sent to node`);
                            let dbres = await this.db.delete_prepending_enq(rec.recid);
                            await this.db.put_enq_tx([[res.result[0].hash, tx.amount, 0]]);
                            await this.db.set_hold(rec.recid, 0);
                        }
                    }
                    else{
                        // TODO Increase time to send
                        logger.warn('Response timeout');
                    }
                }
            }
            catch (err){
                logger.error(err);
            }
            await Utils.sleep(this.defaultDelay)
        }
    }
    async add(tx){
        let res = await this.db.put_prepending_enq(tx);
        return !!res.affectedRows;
    }

    static getInstance(){
        return instance;
    }
}
module.exports.Sender = Sender;