Two-way centralized swap service for ERC20<->ENQ tokens transactions

The service was developed to swap Enecuum tokens from the Ethereum network 
to native Enecuum network. 

## Installation

Create database: `mysql -p -e "DROP DATABASE IF EXISTS wallet; CREATE DATABASE wallet;"`

Create schema: ` mysql -p wallet < wallet.sql`

Install Node.JS packages: `npm i`

Use `config.json.example` to get test config for backend.

    ```
    cp config.json.example config.json
    ```

In `config.json` set required fields:
   - `nodeURL` is an address of Enecuum Blockchain Explorer
   - `eth` section:
   
        ```
            "RPC" : Ethereum node HTTPS address
            "wsRPC" : Ethereum node Websocket address
            "tokenAddr" : Ethereum token contract address to be swapped
            "cashierGasPriceLimit" : Maximum gas limit for ERC20 TX in ENQ->ERC20 swap
            "minConf" : number of confirmations in ETH network for ERC20->ENQ swap
            "minSwapLimit" : minimal amount for ENQ->ERC20 swap
        ```
   - `eth_techAddr` : Ethereum technical address, recipient for ERC20->ENQ swaps
   - `enq_techAddr`: Enecuum technical address, recipient for ENQ->ERC20 swaps
   - `keys` object manages keys for outcoming TXs for swaps
   - Database parameters

## Start

Start PM2 process: `pm2 start index.js --name wallet --log-date-format "YYYY-MM-DD HH:mm Z`

## Usage
The main goal of this service was ENQ token migration from ETH network, so the service supports the following options:
   - ERC-20 ENQ token ---> Native ENQ coin
   - Native ENQ coin ---> ERC-20 ENQ token

After service start, two swap API routes will be available:
   - /swap/erc/enq
   - /swap/enq/erc

#### ERC-20 ---> ENQ
To start ERC-20 -> ENQ (native) you need to send a special Ethereum token transaction with `X` amount of tokens (excluding fees) to be swapped to `eth_techAddr` address.
It's a basic ERC-20 token contract transaction but with additional info in `data` field. You need to add Enecuum address (the same as `pubkey` in POST body below) in data field after all contract-relative data.

The Swap service monitors all incoming Ethereum transactions to the `eth_techAddr` address. 
When a transaction of `tokenAddr` token and `eth_techAddr` recipient has been detected, the service validate this transaction and also use last 33 bytes of raw TX's `data` field as Enecuum native coins recipient address - `pubkey`.
After `minConf` block confirmations it sends Enecuum transaction of `X` coins (excluding fees) from `config.keys.enq.pub` address to `pubkey` Enecuum address obtained at previous step.

**NOTE:** Because of some issues in web3.js (probably [fixed](https://github.com/ChainSafe/web3.js/pull/3190)) there are some Websocket connection errors with Ethereum RPC. It may cause a transaction skip. For this case there is an API path:

```
POST /swap/erc/enq
```

In this case to perform a (ENQ ERC-20) ---> (ENQ native) swap you need to make POST request to /swap/erc/enq with body:

```
    {
        pubkey : Enecuum address (on which you want to get native coins) like 037507b65c61bd6a1252f1acc08fece35f9053a6806e847cd712b1eab90529b86e,
        hash : Ethereum transaction hash of token swap transaction,
        eth_addr : Ethereum address of token sender,
        amount : Amount of tokens to be swapped
    }
```

It is assumed that the ETH transaction with `hash` hash has already been made.

#### ENQ ---> ERC-20

To perform (ENQ native) ---> (ENQ ERC-20) swap you need to prepare and sign Enecuum transaction, then make a POST request to /swap/enq/erc with body:

```
{
    pubkey : Enecuum coin sender address,
    eth_addr : Ethereum addres (on which you want to get ERC-20 tokens),
    tx : { // Enecuum signed transaction object
        amount : "",
        data : "",
        from : "",
        nonce : "",
        ticker : "",
        to : ""
    }
}
```
The service are relaying `tx` object to the Enecuum node and starting to check TX status. 
When it gets status 3, an Ethereum token transaction of `tx.amount` tokens (excluding fee) from `config.keys.eth.pub` to `eth_addr` Ethereum address will be made.