let Utils = require('./Utils.js');
const logger = require('./logger');
const DB = require('./db').DB;
//const Binance = require("./Binance").Binance;
const enecuum = require("./helpers/enecuum");
const Sender = require("./helpers/Sender").Sender;
class TxStatus {
    constructor(config){
        logger.info("TxStatus started");
        this.db = new DB({
            host: config.dbhost,
            user: config.dbuser,
            database: config.dbname,
            password: config.dbpass.toString()
        });
        BigInt.prototype.toJSON = function() { return this.toString() }
        this.sender = Sender.getInstance();
        this.config = config;
        this.ercInterval = config.intervals.ercChecker;
        this.enqInterval = config.intervals.enqChecker;
        this.bepInterval = 5000;
        this.cashierInterval = config.intervals.cashier;
        this.working = true;
        Utils.subscribe(this.onInTransaction.bind(this));
        //this.binance = new Binance();
        //this.binance.listen(this.monitorBEP.bind(this));

        this.start()
    }
    sleep(ms){
        return new Promise(function(resolve, reject){
            setTimeout(() => resolve(), ms)
        });
    };
    async start(status){
        this.ercInt = setInterval(async () => { this.check_bridge_ERC(); }, this.ercInterval);
        this.enqInt = setInterval(async () => { this.checkENQ(); }, this.enqInterval);
        //this.bepInt = setInterval(async () => { this.checkBEP(); }, this.bepInterval);

        while(this.working){
            try{
                await this.cashier_bridge_ERC();
                await this.cashier_bridge_ENQ();
            }
            catch(e){
                logger.error(e)
            }
            await this.sleep(this.cashierInterval);
        }
        //this.cashErcInt = setInterval(async () => {  }, this.cashierInterval);
        //this.cashEnqInt = setInterval(async () => {  }, this.cashierInterval);
        //this.cashBepInt = setInterval(async () => { this.cashierBEP(); }, this.cashierInterval);
    }
    stop(status){
        clearInterval(this.ercInt);
        clearInterval(this.enqInt);
        this.working = false;
        // clearInterval(this.bepInt);
        // clearInterval(this.cashEnqInt);
        // clearInterval(this.cashErcInt);
        // clearInterval(this.cashBepInt);
    }
    /** Monitor techAddr on incoming transactions.
     * Main problem is that for some reasons web3 getBlockNumber does not sync with event block,
     * So we wait for RPC sync until we get the same block and request full tx info */
    async onInTransaction(error, event){
        console.log(event);
        try{
            let isExist = await this.db.check_exist(event.transactionHash);
            if(isExist)
                return;

            let curBlock = await Utils.getBlock();
            while(curBlock < event.blockNumber){
                logger.silly(`Event block: ${event.blockNumber}, RPC block: ${curBlock}, waiting for sync...`);
                await this.sleep(5000);
                curBlock = await Utils.getBlock();
            }
            let info = await Utils.getTransactionExtInfo(event.transactionHash);

            if (info.ext.to.toLowerCase() === this.config.eth_techAddr.toLowerCase()
                && info.to.toLowerCase() === this.config.eth.tokenAddr.toLowerCase()) {
                // Check data field
                if(!Utils.enq_regexp.test(info.ext.linkedAddr)){
                    logger.warn(`Detect bad DATA, hash: ${event.transactionHash}`);
                    await this.db.put_nodata([[event.transactionHash]]);
                    return;
                }

                if(!isExist){
                    logger.info(`Detect swap ERC->ENQ, hash: ${event.transactionHash} , data is : ${info.ext.linkedAddr}`);
                    let db_data = {
                        pubkey : info.ext.linkedAddr,
                        in_hash : event.transactionHash,
                        in_addr : info.from,
                        out_addr : info.ext.linkedAddr,
                        amount : info.ext.amount,
                        status : 0,
                        date : Math.floor(new Date() / 1000),
                        type : Utils.swapTypes.erc_enq,
                        hold : 0
                    };

                    let res1 = await this.db.put_erc_tx([[event.transactionHash, info.ext.amount, 0]]);
                    let res2 = await this.db.put_history(db_data);
                }
            }
        }
        catch (err){
            logger.error(err);
        }
    }
    /**  Watch all Ethereum ERC-20 transactions. Make requests via RPC */
    async checkERC(){
        let pending = await this.db.get_pending_erc();
        if(pending.length){
            await Promise.all(pending.map(async (rec) => {
                try {
                    let tx = rec.hash;
                    let info = await Utils.getTransactionStatus(tx);

                    // Check confirmations
                    if(!info){
                        logger.info(tx + ' still in pending');
                        return;
                    }
                    if (info.status) {
                        // Check non-zero amount, contract address and "removed" status
                        if((Utils.hexToBigint(info.data.logs[0].data) > 0)
                            && (info.data.logs[0].address.toLowerCase() === this.config.eth.tokenAddr.toLowerCase())
                            && (!info.data.logs[0].removed)){
                                logger.info(`${tx} has been confirmed ${info.confirmations} times`);
                                // Tx in blochchain, check status
                                if(info.confirmations >= this.config.eth.minConf) {
                                    logger.info(`ERC TX ${tx} status OK`);
                                    // TODO: check db response
                                    let res = await this.db.update_statuses_erc([[tx, 3]]);
                                }
                        }
                        else{
                            logger.warn(`${tx} bad data, rejecting`);
                            logger.warn(info);
                            let res = this.db.update_statuses_erc([[tx, 2]]);
                        }
                    }
                    // Failed tx - set bad status in DB
                    else{
                        logger.warn(`${tx} status FAILED`);
                        let res = this.db.update_statuses_erc([[tx, 2]]);
                    }
                    await this.db.update_swap_status(tx);
                }
                catch (err) {
                    logger.error(err);
                }
            }));
        }
    }
    /**  Watch all Enecuum ENQ transactions. Make requests to Enecuum node */
    async checkENQ(){
        let pending = await this.db.get_pending_enq();
        if(pending.length) {
            // Ask tx status
            await Promise.all(pending.map(async (rec) => {
                try {
                    let res = await Utils.apiRequest.get((this.config.nodeURL + '/api/v1/tx'), {hash : rec.hash});
                    if(!res){
                        logger.debug(`empty response for ${rec.hash}`);
                        return;
                    }
                    if(res.status === undefined || res.status === null)
                        return;
                    logger.info(`ENQ TX ${rec.hash} status ${res.status}`);
                    await this.db.update_statuses_enq([[rec.hash, res.status]]);
                    await this.db.update_swap_status(rec.hash);
                }
                catch (err) {
                    logger.error(err);
                }
            }));
        }
    }
    /**  Watch all Binance BEP2 transactions. Make requests to Binance node */
    async checkBEP(){
        let pending = await this.db.get_pending_bep();
        if(pending.length) {
            // Ask tx status
            await Promise.all(pending.map(async (rec) => {
                try {
                    let res = await this.binance.getTransactionInfo(rec.hash);
                    // TODO: что делать при null? Это невалидная транза или пендинг?
                    if(!res){
                        logger.debug(`empty response for ${rec.hash}`);
                        return;
                    }
                    console.log(res);
                    /**
                     * Check:
                     * - asset
                     */
                    console.log(res.tx.value.msg[0].value.inputs);
                    console.log(res.tx.value.msg[0].value.outputs);
                    // if(res.status === undefined || res.status === null)
                    //     return;
                    logger.info(`BEP2 TX ${rec.hash} status ${res.ok}`);
                    await this.db.update_statuses_bep([[rec.hash, res.ok ? 3 : 0]]);
                    //TODO: Update BEP swaphistory status
                    await this.db.update_swap_status(rec.hash);
                }
                catch (err) {
                    logger.error(err);
                }
            }));
        }
    }


    /**  Watch all Ethereum ERC-20 transactions. Make requests via RPC */
    async check_bridge_ERC(){
        let pending = await this.db.get_pending_erc();
        if(pending.length){
            await Promise.all(pending.map(async (rec) => {
                try {
                    let tx = rec.hash;
                    let info = await Utils.getTransactionStatus(tx);

                    // Check confirmations
                    if(!info){
                        logger.info(tx + ' still in pending');
                        return;
                    }
                    if (info.status) {
                        // Check non-zero amount, contract address and "removed" status
                        if((Utils.hexToBigint(info.data.logs[0].data) > 0)
                            && (info.data.logs[0].address.toLowerCase() !== undefined)
                            && (!info.data.logs[0].amount > 0)){
                            logger.info(`${tx} has been confirmed ${info.confirmations} times`);
                            // Tx in blochchain, check status
                            if(info.confirmations >= this.config.eth.minConf) {
                                logger.info(`ERC TX ${tx} status OK`);
                                // TODO: check db response
                                let res = await this.db.update_statuses_erc([[tx, 3]]);
                            }
                        }
                        else{
                            logger.warn(`${tx} bad data, rejecting`);
                            logger.warn(info);
                            let res = this.db.update_statuses_erc([[tx, 2]]);
                        }
                    }
                    // Failed tx - set bad status in DB
                    else{
                        logger.warn(`${tx} status FAILED`);
                        let res = this.db.update_statuses_erc([[tx, 2]]);
                    }
                    await this.db.update_swap_status(tx);
                }
                catch (err) {
                    logger.error(err);
                }
            }));
        }
    }

    /** BEP2 -> ENQ
     *  Get succesful BEP2 transactions from DB and transfer tokens */
    async cashierBEP(){
        let inputs = await this.db.get_success_beps();
        for(let i = 0; i < inputs.length; i++){
            try {
                let rec = inputs[i];
                // Additional check
                let info = await this.binance.getTransactionInfo(rec.in_hash);
                console.log(info);
                if(rec.type === Utils.swapTypes.bep_enq){
                    await this.db.set_hold(rec.recid, 1);
                    let res = await this.transferENQ(rec.out_addr, rec.amount);
                    if(res.hasOwnProperty("status")){
                        await this.db.put_enq_tx([[res.hash, rec.amount, res.status]]);
                        logger.info(`ENQ TX ${res.hash} for ${rec.pubkey} was sent to node.`);
                        let dbRes = await this.db.put_history_out({
                            out_hash: res.hash,
                            in_hash: rec.in_hash,
                            amount: rec.amount
                        });
                        await this.db.set_hold(rec.recid, 0);
                    }
                }
                else{
                    logger.warn('Incorrect swap type, swap will be in hold')
                    // error
                }
            }
            catch (err) {
                logger.error(err);
            }
        }
    }

    /** ERC-20 -> ENQ
     *  ERC-20 -> BEP2
     *  Get succesful ERC-20 transactions from DB and transfer ENQ coins back */
    async cashierERC(){
        let inputs = await this.db.get_success_ercs();
        for(let i = 0; i < inputs.length; i++){
            try {
                let rec = inputs[i];
                // Additional check
                let info = await Utils.getTransactionExtInfo(rec.in_hash);

                if (info.ext.to.toLowerCase() === this.config.eth_techAddr.toLowerCase()
                    && info.to.toLowerCase() === this.config.eth.tokenAddr.toLowerCase()) {

                    logger.info(`ETH hash ${rec.in_hash} for ${rec.pubkey} OK, transfer...`);
                    if(rec.type === Utils.swapTypes.erc_enq){
                        let keys = this.config.keys.enq;
                        let balance = await enecuum.getBalance(keys.pub);
                        if(BigInt(balance) < BigInt(info.ext.amount)){
                            logger.warn('Out of ENQ');
                            return null;
                        }
                        await this.db.set_hold(rec.recid, 1);
                        // Hold tx if no data field
                        if(info.ext.linkedAddr !== ''){
                            let tx = {
                                amount: info.ext.amount,
                                data : '',
                                from: keys.pub,
                                nonce: Math.floor(Math.random() * 1e15),
                                ticker : Utils.ENQ_TOKEN_NAME,
                                to: info.ext.linkedAddr
                            };
                            let signHash = Utils.hashTx(tx);
                            tx.sign = Utils.sign(keys.prv, signHash);
                            let txhash = Utils.hashSignedTx(tx);
                            let dbRes = await this.db.put_history_out({
                                out_hash: txhash,
                                in_hash: rec.in_hash,
                                amount: info.ext.amount
                            });
                            let res = await enecuum.sendTransaction(tx);
                            if(!res){
                                // Add to sender queue
                                logger.warn(`no response, save ${txhash} in pending`);
                                tx.hash = txhash;
                                tx.recid = rec.recid;
                                let senderRes = await this.sender.add(tx);
                                //return {result : senderRes};
                            }
                            else{
                                res = res.result[0];
                                if(res.hasOwnProperty("status")){
                                    let hash = txhash;
                                    if(res.hasOwnProperty("hash")){
                                        hash = res.hash;
                                    }
                                    await this.db.put_enq_tx([[hash, info.ext.amount, res.status]]);
                                    if(res.status === 2){
                                        logger.warn(`Status 2 for ENQ tx ${txhash}`);
                                        await this.db.update_swap_status(hash);
                                    }
                                    else {
                                        logger.info(`ENQ TX ${hash} for ${rec.pubkey} was sent to node.`);
                                    }
                                    await this.db.set_hold(rec.recid, 0);
                                }
                            }
                        }
                        else{
                            logger.warn(`ETH hash ${rec.in_hash} for ${rec.pubkey} without data`);
                        }
                    }
                    else if(rec.type === Utils.swapTypes.erc_bep){
                        await this.db.set_hold(rec.recid, 1);
                        // Binance use float value instead of decimals
                        let res = await this.binance.transfer(rec.out_addr, info.ext.amount / 1e10, rec.in_hash);
                        console.log(res);

                        if (res.status === 200 && res.result[0].ok === true) {
                            await this.db.put_bep_tx([[res.result[0].hash, info.ext.amount, (res.status === 200 ? 0 : 2)]]);
                            logger.info(`BEP TX ${res.result[0].hash} for ${rec.pubkey} was sent to node.`);
                            let dbRes = await this.db.put_history_out({
                                out_hash: res.result[0].hash,
                                in_hash: rec.in_hash,
                                amount: info.ext.amount
                            });
                            await this.db.set_hold(rec.recid, 0);
                            //await this.db.swap.erc_bep.set_hold('hash_erc', rec.hash_erc, 0);
                        }
                    }
                    else {
                        logger.warn('Incorrect swap type, swap will be in hold')
                        // error
                    }
                }
                // Tx substitution detected
                else {
                    logger.warn(`Tx substitution detected: ${rec.in_hash} from ${rec.pubkey}`);
                    let res = await this.db.update_statuses_erc([[rec.in_hash, 2]]);
                    //await this.db.update_swap_status_byERC({hash_erc: rec.hash_erc});
                    await this.db.set_hold(rec.recid, 0);
                }
            }
            catch (err) {
                logger.error(err);
            }
        }
    }

    /** Bridge lock ERC20 in smart-contract -> Create Token in Enecuum network
     *
     *   */
    async cashier_bridge_ERC() {
        let inputs = await this.db.get_success_ercs();
        for (let i = 0; i < inputs.length; i++) {
            try {
                let rec = inputs[i];
                // Additional check
                let info = await Utils.getTransactionExtInfo(rec.in_hash);

                if (info.to.toLowerCase() === this.config.eth_techAddr.toLowerCase()) {

                    logger.info(`ETH hash ${rec.in_hash} for ${rec.pubkey} OK, transfer...`);
                    if (rec.type === Utils.swapTypes.erc_enq) {
                        await this.db.set_hold(rec.recid, 1);
                        let keys = this.config.keys.enq;
                        let token_hash = (await this.db.get_enq_bridge_token(info.token.eth_hash))[0];

                        if (token_hash === undefined) {
                            //Create token
                            let enq_decimals =
                            let native_token_info = (await enecuum.getTokenInfo(this.config.enq_native_token_hash))[0];
                            let create_tx = await Utils.CreateToken(keys, info.token, native_token_info);

                            let create_res = await enecuum.sendTransaction(create_tx);
                            if (create_res.err === 0) {
                                info.token.enq_hash = create_res.result[0].hash;
                                await this.db.put_bridge_token(info.token);
                                await this.db.set_hold(rec.recid, 0);
                            }
                        } else {
                            //Mint - Send
                            token_hash = token_hash.enq_hash;

                            let balance = await enecuum.getTokenBalance(keys.pub, token_hash);
                            let amount = BigInt(info.method.params.find(param => {if(param.name === "amount") return param}).value);
                            rec.out_addr = info.method.params.find(param => {if(param.name === "enq_address") return param}).value
                            if (BigInt(balance) < amount) {
                                logger.warn('Out of ENQ');
                                return null;
                            }
                            //await this.db.set_hold(rec.recid, 1);
                            // Hold tx if no data field
                            if (rec.out_addr !== '') {
                                let tx = {
                                    amount: amount,
                                    data: '',
                                    from: keys.pub,
                                    nonce: Math.floor(Math.random() * 1e15),
                                    ticker: token_hash,
                                    to: rec.out_addr
                                };
                                let signHash = Utils.hashTx(tx);
                                tx.sign = Utils.sign(keys.prv, signHash);
                                let txhash = Utils.hashSignedTx(tx);
                                let dbRes = await this.db.put_history_out({
                                    out_hash: txhash,
                                    in_hash: rec.in_hash,
                                    amount: amount
                                });
                                let res = await enecuum.sendTransaction(tx);
                                if (!res) {
                                    // Add to sender queue
                                    logger.warn(`no response, save ${txhash} in pending`);
                                    tx.hash = txhash;
                                    tx.recid = rec.recid;
                                    let senderRes = await this.sender.add(tx);
                                    //return {result : senderRes};
                                } else {
                                    res = res.result[0];
                                    if (res.hasOwnProperty("status")) {
                                        let hash = txhash;
                                        if (res.hasOwnProperty("hash")) {
                                            hash = res.hash;
                                        }
                                        await this.db.put_enq_tx([[hash, amount, res.status]]);
                                        if (res.status === 2) {
                                            logger.warn(`Status 2 for ENQ tx ${txhash}`);
                                            await this.db.update_swap_status(hash);
                                        } else {
                                            logger.info(`ENQ TX ${hash} for ${rec.pubkey} was sent to node.`);
                                        }
                                        await this.db.set_hold(rec.recid, 0);
                                    }
                                }
                            } else {
                                logger.warn(`ETH hash ${rec.in_hash} for ${rec.pubkey} without data`);
                            }
                        }
                    } else if (rec.type === Utils.swapTypes.erc_bep) {
                        await this.db.set_hold(rec.recid, 1);
                        // Binance use float value instead of decimals
                        let res = await this.binance.transfer(rec.out_addr, info.ext.amount / 1e10, rec.in_hash);
                        console.log(res);

                        if (res.status === 200 && res.result[0].ok === true) {
                            await this.db.put_bep_tx([[res.result[0].hash, info.ext.amount, (res.status === 200 ? 0 : 2)]]);
                            logger.info(`BEP TX ${res.result[0].hash} for ${rec.pubkey} was sent to node.`);
                            let dbRes = await this.db.put_history_out({
                                out_hash: res.result[0].hash,
                                in_hash: rec.in_hash,
                                amount: info.ext.amount
                            });
                            await this.db.set_hold(rec.recid, 0);
                            //await this.db.swap.erc_bep.set_hold('hash_erc', rec.hash_erc, 0);
                        }
                    } else {
                        logger.warn('Incorrect swap type, swap will be in hold')
                        // error
                    }
                }
                // Tx substitution detected
                else {
                    logger.warn(`Tx substitution detected: ${rec.in_hash} from ${rec.pubkey}`);
                    let res = await this.db.update_statuses_erc([[rec.in_hash, 2]]);
                    //await this.db.update_swap_status_byERC({hash_erc: rec.hash_erc});
                    await this.db.set_hold(rec.recid, 0);
                }
            } catch (err) {
                logger.error(err);
                await this.db.set_hold(rec.recid, 0);
            }
        }
    }

    /** ENQ -> ERC-20
     *  ENQ -> BEP2
     *  Get succesful ENQ transactions from DB and transfer tokens */
    async cashierENQ(){
        let inputs = await this.db.get_success_enqs();
        for(let i = 0; i < inputs.length; i++){
            try {
                let rec = inputs[i];
                // Additional check
                // TODO: Can be removed
                let info = await Utils.apiRequest.get(this.config.nodeURL + '/api/v1/tx', {hash : rec.in_hash});
                if (info.to.toLowerCase() === this.config.enq_techAddr.toLowerCase()
                    && info.from.toLowerCase() === rec.in_addr.toLowerCase()
                    && info.status === 3) {

                    logger.info(`ENQ hash ${rec.in_hash} for ${rec.pubkey} OK, transfer...`);
                    if(rec.type === Utils.swapTypes.enq_erc){
                        try {
                            // Hold swap
                            await this.db.set_hold(rec.recid, 1);
                            // Calc erc hash locally
                            let tx = await Utils.createTokenTransaction(rec.out_addr, info.amount, rec.in_hash);
                            let hash_erc = tx.hash;


                            logger.info(`Attempting to send ${info.amount} to ${rec.out_addr}`);

                            let resp = await Utils.sendTokenTransaction(tx.raw, info.amount);
                            console.log(resp);
                            if(resp){
                                logger.info(`TX ${resp} for ${rec.in_addr} was sent to node.`);
                                // Change inwork status to 0
                                await this.db.put_erc_tx([[hash_erc, info.amount, 0]]);
                                let dbRes = await this.db.put_history_out({
                                    in_hash: rec.in_hash,
                                    out_hash: hash_erc,
                                    amount: info.amount
                                });
                                await this.db.set_hold(rec.recid, 0);
                            }
                        }
                        catch (err) {
                            logger.error(err.stack)
                        }
                    }
                    else if(rec.type === Utils.swapTypes.enq_bep){
                        await this.db.set_hold(rec.recid, 1);
                        logger.info(`Attempting to send ${info.amount} to ${rec.out_addr}`);
                        // Binance use float value instead of decimals
                        let res = await this.binance.transfer(rec.out_addr, info.amount / 1e10, rec.in_hash);
                        console.log(res);

                        if (res.status === 200 && res.result[0].ok === true) {
                            await this.db.put_bep_tx([[res.result[0].hash, info.amount, (res.status === 200 ? 0 : 2)]]);
                            logger.info(`BEP TX ${res.result[0].hash} for ${rec.pubkey} was sent to node.`);
                            let dbRes = await this.db.put_history_out({
                                out_hash: res.result[0].hash,
                                in_hash: rec.in_hash,
                                amount: info.amount
                            });
                            await this.db.set_hold(rec.recid, 0);
                            //await this.db.swap.erc_bep.set_hold('hash_erc', rec.hash_erc, 0);
                        }
                    }
                    else {
                        logger.warn('Incorrect swap type, swap will be in hold')
                        // error
                    }

                }
                // Tx substitution detected
                else {
                    logger.warn(`Tx substitution detected: ${rec.in_hash} from ${rec.pubkey}`);
                    let res = await this.db.update_statuses_enq([[rec.in_hash, 2]]);
                    //await this.db.update_swap_status_byENQ({hash_enq: rec.hash_enq});
                }
            }
            catch (err) {
                logger.error(err);
            }
        }
    }

    /** Bridge ENQ -> unlock ERC-20 in smart-contract
     *
     *  Get succesful ENQ transactions from DB and unlock tokens in smart-contract */
    async cashier_bridge_ENQ(){
        let inputs = await this.db.get_success_enqs();
        for(let i = 0; i < inputs.length; i++){
            try {
                let rec = inputs[i];
                // Additional check
                // TODO: Can be removed
                let info = await Utils.apiRequest.get(this.config.nodeURL + '/api/v1/tx', {hash : rec.in_hash});
                if (info.to.toLowerCase() === this.config.enq_techAddr.toLowerCase()
                    && info.from.toLowerCase() === rec.in_addr.toLowerCase()
                    && info.status === 3) {

                    logger.info(`ENQ hash ${rec.in_hash} for ${rec.pubkey} OK, transfer...`);
                    if(rec.type === Utils.swapTypes.enq_erc){
                        try {
                            // Hold swap
                            await this.db.set_hold(rec.recid, 1);
                            // Calc erc hash locally
                            let tx = await Utils.createTokenTransaction(rec.out_addr, info.amount, rec.in_hash);
                            let hash_erc = tx.hash;


                            logger.info(`Attempting to send ${info.amount} to ${rec.out_addr}`);

                            let resp = await Utils.sendTokenTransaction(tx.raw, info.amount);
                            console.log(resp);
                            if(resp){
                                logger.info(`TX ${resp} for ${rec.in_addr} was sent to node.`);
                                // Change inwork status to 0
                                await this.db.put_erc_tx([[hash_erc, info.amount, 0]]);
                                let dbRes = await this.db.put_history_out({
                                    in_hash: rec.in_hash,
                                    out_hash: hash_erc,
                                    amount: info.amount
                                });
                                await this.db.set_hold(rec.recid, 0);
                            }
                        }
                        catch (err) {
                            logger.error(err.stack)
                        }
                    }
                    else if(rec.type === Utils.swapTypes.enq_bep){
                        await this.db.set_hold(rec.recid, 1);
                        logger.info(`Attempting to send ${info.amount} to ${rec.out_addr}`);
                        // Binance use float value instead of decimals
                        let res = await this.binance.transfer(rec.out_addr, info.amount / 1e10, rec.in_hash);
                        console.log(res);

                        if (res.status === 200 && res.result[0].ok === true) {
                            await this.db.put_bep_tx([[res.result[0].hash, info.amount, (res.status === 200 ? 0 : 2)]]);
                            logger.info(`BEP TX ${res.result[0].hash} for ${rec.pubkey} was sent to node.`);
                            let dbRes = await this.db.put_history_out({
                                out_hash: res.result[0].hash,
                                in_hash: rec.in_hash,
                                amount: info.amount
                            });
                            await this.db.set_hold(rec.recid, 0);
                            //await this.db.swap.erc_bep.set_hold('hash_erc', rec.hash_erc, 0);
                        }
                    }
                    else {
                        logger.warn('Incorrect swap type, swap will be in hold')
                        // error
                    }

                }
                // Tx substitution detected
                else {
                    logger.warn(`Tx substitution detected: ${rec.in_hash} from ${rec.pubkey}`);
                    let res = await this.db.update_statuses_enq([[rec.in_hash, 2]]);
                    //await this.db.update_swap_status_byENQ({hash_enq: rec.hash_enq});
                }
            }
            catch (err) {
                logger.error(err);
            }
        }
    }

    async monitorBEP(evt){
        console.log(evt);
        evt = JSON.parse(evt);
        if(evt.stream === 'transfers')
        {
            console.log('Transfers detected');
            let transfer = {
                hash: evt.data.H,
                from: evt.data.f,
                to: evt.data.t[0].o,
                asset: evt.data.t[0].c[0].a,
                amount: evt.data.t[0].c[0].A
            };
            // TODO: handle multiple tx sending
            console.log(transfer);
            if(transfer.to === this.config.keys.binance.pubkey
                && transfer.asset === this.config.binance.asset
                && transfer.amount > 0){
                // Check hash memo
                let res = await this.binance.getTransactionInfo(transfer.hash);
                let memo = res.tx.value.memo;
                if(memo){
                    // TODO: validate memo

                    // TODO: only ENQ swap, memo = pubkey
                    let db_data = {
                        pubkey : memo,
                        in_hash : transfer.hash,
                        out_addr : memo,
                        in_addr : transfer.from,
                        amount : transfer.amount * 1e10,
                        status : 0,
                        date : Math.floor(new Date() / 1000),
                        type : Utils.swapTypes.bep_enq,
                        hold : 0
                    };
                    await this.db.put_bep_tx([[transfer.hash, transfer.amount * 1e10, 3]]);
                    let result = await this.db.put_history(db_data);
                }
                else{
                    console.log('Memo not found');
                }
            }
        }
    }

    // TODO: Move to Utils
    async transferENQ(addr, amount){
        try {
            let keys = this.config.keys.enq;
            let balance = await enecuum.getBalance(keys.pub);
            if(balance < amount){
                logger.warn('Out of ENQ');
                return null;
            }
            let tx = {
                amount: amount,
                from: keys.pub,
                nonce: Math.floor(Math.random() * 1e15),
                to: addr
            };
            let signHash = Utils.hashTx(tx);
            tx.sign = Utils.sign(keys.prv, signHash);
            let res = await enecuum.sendTransaction(tx);
            /*
            await this.db.put_enq_tx([[res.hash, info.ext.amount, res.status]]);
                                logger.info(`ENQ TX ${res.hash} for ${rec.pubkey} was sent to node.`);
                                let dbRes = await this.db.put_history_out({
                                    out_hash: res.hash,
                                    in_hash: rec.in_hash,
                                    amount: info.ext.amount
                                });
            */
            if(!res)
                return null;
            return res.result[0];
        }
        catch (err) {
            logger.error(err.stack);
            return null
        }
    }
}
module.exports.TxStatus = TxStatus;