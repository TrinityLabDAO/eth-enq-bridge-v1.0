let Utils = require('./Utils.js');
let express = require('express');
let app = express();
let bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//app.set('views', '../sitev2');
app.engine('html', require('ejs').renderFile);
//app.set('view engine', 'ejs');
//app.use(express.static('../sitev2'));

const logger = require('./logger');
const TxStatus = require('./TxStatus').TxStatus;
const config = require("./config.json");
const Service = require("./Service").Service;

let txStatus = new TxStatus(config);
let service = new Service();

app.use(function (req, res, next) {
    logger.debug(`Request ${req.headers['x-forwarded-for']} | ${req.connection.remoteAddress} ${req.method} \t ${req.url}`);
	next();
});

app.use(function (err, req, res, next) {
	return res.status(400).send({result : false, err : 1});
});

let auth = async function(req, res, next) {
    logger.silly(`Auth attempt`);
	let token = req.headers['x-session-token'];
	if(!token)
        return res.status(401).send({result: false});
	let authRes = await service.auth(token, req.body.sign);
	if(authRes)
	    next();
	else return res.status(401).send({result: false});
};

let validate = async function(req, res, next) {
    // let token = req.headers['x-session-token'];
    // if(!token){
    //     return res.status(401).send({result: false});
    // }
	let eth_regexp = /^(0x)?[0-9a-fA-F]{40}$/i;
	let hash_regexp = /^(0x)?[0-9a-fA-F]{64}$/i;
    let enq_regexp = /^(02|03)[0-9a-fA-F]{64}$/i;
	let data = req.body;
/*
	if(!enq_regexp.test(data.pubkey))
        return res.status(400).send({result: false, msg : "pubkey format error"});
*/
	if(!data.hasOwnProperty('hash') && !data.hasOwnProperty('tx'))
        return res.status(400).send({result: false, msg : "Data error"});
    // TODO: eth_addr only with tx
    // if(!(data.hasOwnProperty('eth_addr') && data.hasOwnProperty('tx')))
    //     return res.status(400).send({result: false, msg : "Data error"});

    if(data.hasOwnProperty('eth_addr')){
        if(!eth_regexp.test(data.eth_addr))
            return res.status(400).send({result: false, msg : "Eth address error"});
        return next();
    }
	if(data.hasOwnProperty('hash')){
		if(!hash_regexp.test(data.hash))
			return res.status(400).send({result: false, msg : "Hash error"});
        return next();
	}
	else if(data.hasOwnProperty('tx')){
		for (let prop of ['amount','from','nonce','sign','to']){
			if(!data.tx.hasOwnProperty(prop))
                return res.status(400).send({result: false, msg : "TX format error"});
		}
        return next();
	}
};

app.get('/dev/compress', function(req, res) {
    const key = service.compressKey(key);
    return res.send(key);
});

app.get('/dev/uncompress', function(req, res) {
    const key = service.uncompressKey(key);
    return res.send(key);
});

app.post('/getHistory', async function (req, res) {
	let data = await service.getHistory(req.body.pubkey);
	res.status(200).send(data);
});

app.get('/getConfig', async function (req, res) {
    let cfg = {
        nodeURL : config.nodeURL,
        enq_techAddr : config.enq_techAddr,
        eth_techAddr : config.eth_techAddr,
        tokenAddr : config.eth.tokenAddr
	};
    res.status(200).send(cfg);
});

/** ERC -> ENQ swap */
app.post('/bridge/erc/enq',
    (config.authState ? auth : (req, res, next)=>{next()}),
    validate,
    async function (req, res) {
        let body = req.body;
        logger.info(`Swap ERC->ENQ for pubkey ${body.pubkey}, ETH hash is ${body.hash}`);
        try{
            let result = await service.bridgeERC_ENQ(body);
            return res.status(200).send({result: result});
        }
        catch (err) {
            logger.error(err);
            return res.status(200).send({result: false});
        }
});

/** ENQ -> ERC swap */
app.post('/bridge/enq/erc',
    (config.authState ? auth : (req, res, next)=>{next()}),
    validate,
    async function (req, res) {
        let body = req.body;
        logger.info(`Swap ENQ->ERC for pubkey ${req.body.pubkey}`);
        let result = await service.bridgeENQ_ERC(body);
        return res.status(200).send(result);
});


app.listen(config.port, function () {
    logger.info(`Bridge is running on port ${config.port}!`);
});

app.use(function(req, res, next){
    res.status(404).render('404.html', {title: "Sorry, page not found"});
});

let token = '0xf6958cf3127e62d3eb26c79f4f45d3f3b2ccded4';
let address = '0x78B77d5d7A1DFd9a2DA3EE91AFbc205B7eDD1D4d';
let amount = 100000;
let sign = Utils.sign_msg(token, address, amount, config.keys.enq.prv);