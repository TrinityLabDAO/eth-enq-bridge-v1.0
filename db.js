const mysql = require('mysql');
const logger = require('./logger');
const Utils = require('./Utils.js');
class DB {
    constructor(config){
        this.config = config;
        this.con = null;
        this.coonect();
    }
    coonect() {
        this.con = mysql.createConnection(this.config);
        let that = this;
        this.con.connect(function(err) {
            if(err) {
                logger.error(`Database error: ${err}, reconnecting...`);
                setTimeout(that.coonect.bind(that), 2000);
            }
            else
                logger.info(`Connected to DB engine, using DB ${that.config.database}`);
        });

        this.con.on('error', function(err) {
            logger.error(`Database error: ${err}`);
            that.coonect();
        });
    }
	request(sql) {
		return new Promise(function(resolve, reject){
            logger.silly(sql);
			this.con.query(sql, function (err, result) {
				if (err)
					reject(new Error(err));
				resolve(result);
			});
		}.bind(this));
	};

	async get_history(addr){
		return await this.request(mysql.format('SELECT out_hash,out_addr,amount,status,date,type ' +
            'FROM swaphistory WHERE `pubkey`=?', addr));
	}
    async get_history_row(key, value){
        return await this.request(mysql.format('SELECT * FROM swaphistory WHERE ?? = ?', [key, value]));
    }
    async get_pending_enq(){
        return await this.request(mysql.format('SELECT hash FROM enq_txs WHERE `status`= 0'));
    }
    async get_pending_erc(){
        return await this.request(mysql.format('SELECT hash FROM erc_txs WHERE `status`= 0'));
    }
    async get_pending_bep(){
        return await this.request(mysql.format('SELECT hash FROM bep_txs WHERE `status`= 0'));
    }

    async check_exist(hash){
        return (await this.request(mysql.format('SELECT EXISTS(SELECT 1 FROM swaphistory WHERE in_hash = ? LIMIT 1) as result', hash)))[0].result;
    }
    async put_nodata(hash){
        return await this.request(mysql.format('INSERT INTO nodata_txs VALUES (?)', hash));
    }
    async put_prepending_enq(data){
        return await this.request(mysql.format('INSERT INTO pending_enq SET ?', [data]));
    }
    async delete_prepending_enq(id){
        return await this.request(mysql.format('DELETE FROM pending_enq where recid = ?', [id]));
    }
    async get_prepending_enq(){
        return await this.request(mysql.format('SELECT * FROM pending_enq'));
    }


    async get_success_ercs(){
	    return await this.request(mysql.format('SELECT * FROM swaphistory hist ' +
            'INNER JOIN erc_txs AS erc ON hist.in_hash = erc.hash AND hist.out_hash is NULL AND erc.status = 3 AND hist.hold = 0 LIMIT 50'));
    }
    async get_success_enqs(){
        return await this.request(mysql.format('SELECT * FROM swaphistory hist ' +
            'INNER JOIN enq_txs AS enq ON hist.in_hash = enq.hash AND hist.out_hash is NULL AND enq.status = 3 AND hist.hold = 0'));
    }
    async get_success_beps(){
        return await this.request(mysql.format('SELECT * FROM swaphistory hist ' +
            'INNER JOIN bep_txs AS bep ON hist.in_hash = bep.hash AND hist.out_hash is NULL AND bep.status = 3 AND hist.hold = 0 '));
    }

	async put_history(data){
		return await this.request(mysql.format('INSERT INTO swaphistory SET ?', [data]));
	}
    async put_history_in(data){
        return await this.request(mysql.format('UPDATE swaphistory SET in_hash = ?, amount = ? WHERE out_hash = ?', [data.in_hash, data.amount,data.out_hash]));
    }
    async put_history_out(data){
        return await this.request(mysql.format('UPDATE swaphistory SET out_hash = ?, amount = ? WHERE in_hash = ?', [data.out_hash, data.amount,data.in_hash]));
    }

    async update_swap_status(hash){
	    let rec = (await this.request(mysql.format('SELECT recid,type FROM swaphistory WHERE in_hash = ? OR out_hash = ?', [hash, hash])))[0];
	    let a, b;
	    switch (rec.type){
            case Utils.swapTypes.enq_erc : a = 'enq_txs'; b = 'erc_txs'; break;
            case Utils.swapTypes.enq_bep : a = 'enq_txs'; b = 'bep_txs'; break;
            case Utils.swapTypes.erc_enq : a = 'erc_txs'; b = 'enq_txs'; break;
            case Utils.swapTypes.erc_bep : a = 'erc_txs'; b = 'bep_txs'; break;
            case Utils.swapTypes.bep_enq : a = 'bep_txs'; b = 'enq_txs'; break;
        }
        return await this.request(mysql.format('UPDATE swaphistory AS s ' +
            'LEFT JOIN ?? AS a ON s.in_hash = a.hash ' +
            'LEFT JOIN ?? AS b ON s.out_hash = b.hash ' +
            'SET s.status = (IFNULL(a.status, 0) + IFNULL(b.status, 0)) ' +
            'WHERE s.recid = ?', [a, b, rec.recid]));
    }

    async set_hold(recid, state){
        return await this.request(mysql.format('UPDATE swaphistory SET hold = ? WHERE recid = ?', [state, recid]));
    }

    async put_enq_tx(data){
        return await this.request(mysql.format('INSERT INTO enq_txs VALUES ?', [data]));
    }
    async put_erc_tx(data){
        return await this.request(mysql.format('INSERT INTO erc_txs VALUES ?', [data]));
    }
    async put_bep_tx(data){
        return await this.request(mysql.format('INSERT INTO bep_txs VALUES ?', [data]));
    }

    async update_statuses_enq(data){
        return await this.request(mysql.format('INSERT INTO enq_txs (hash, status) VALUES ? ' +
            'ON DUPLICATE KEY UPDATE status = VALUES(status);', [data]));
    }
    async update_statuses_erc(data){
        return await this.request(mysql.format('INSERT INTO erc_txs (hash, status) VALUES ? ' +
            'ON DUPLICATE KEY UPDATE status = VALUES(status);', [data]));
    }
    async update_statuses_bep(data){
        return await this.request(mysql.format('INSERT INTO bep_txs (hash, status) VALUES ? ' +
            'ON DUPLICATE KEY UPDATE status = VALUES(status);', [data]));
    }

	async put_token(data){
		return await this.request(mysql.format('INSERT IGNORE INTO tokens SET ?', [data]));
	}
	async get_token(token){
		return (await this.request(mysql.format('SELECT * FROM tokens WHERE `token`=?', token)))[0];
	}
    async delete_token(token){
        return await this.request(mysql.format('DELETE from tokens where `token`=?', token));
    }
	async put_message(data){
		return await this.request(mysql.format('UPDATE tokens SET cram = ? WHERE token = ?', [data.cram, data.token]));
	}
    async put_account(pubkey, eth_addr){
        return await this.request(mysql.format('INSERT INTO accounts VALUES ?', [{pkey : pubkey, eth_addr : eth_addr}]));
    }

    async put_bridge_token(data){
        return await this.request(mysql.format('INSERT IGNORE INTO bridge_tokens SET ?', [data]));
    }

    async get_enq_bridge_token(eth_hash){
        return await this.request(mysql.format('Select enq_hash FROM bridge_tokens WHERE eth_hash = ?', [eth_hash]));
    }

    async get_eth_bridge_token(enq_hash){
        return await this.request(mysql.format('Select eth_hash FROM bridge_tokens WHERE enq_hash = ?', [enq_hash]));
    }
}
module.exports.DB = DB;