const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const web3 = require('web3');
const privateKeyToAddress = require('ethereum-private-key-to-address');
const Utils = require('./Utils');
const config = require("./config.json");


describe("Test contracts", function () {
    let ZX = "0x0000000000000000000000000000000000000000";
    this.timeout(10000);
    //private keys
    let prvs = [
        "4d7c91407e5954e6b80e2c5f3658363452cf932b3a74fa4703472a7978960302",
        "1c15507d37b3e02c88cecdd01b818e4bbac9d561c98e39e031d586b6a31484fa",
        "b3b9e0e271150cc08edb7274fdf8cef930fc1edf4af4f35da64f5e791279aaf5",
        "433a6d0b925735bfd54f0c86e7043cbd0d6bae2cb80d9a1054df8c3ecaa54d2a",
        "51132e11390a73c5a454e25c14e2c3d67fd9e623c679fab4c1f67edb87e26ef9",
        "730e0e8ad6d0500ab1940aab8138e5fd4ed1c5c1a4c9952b3b842d01a0caa733",
        "8b0b0e5683f3e5a3094b100998a117fa05b75085f97cad47180f0dc75f3764ba",
        "1ffa51c863d8dc416e3c75050a2cfe927b722996e43fd6c3b65e22bd4f45e81a",
        "24ad377f3cc21124bbbe58a25e351e5d4dfdb013eb20b0fcb335483605458d8a",
        "5f7f6cde580eaf79162abe96ac04d96b565525414200f723e13f0b2062c627c9",

        "8a5908d4d7064c1f7089c03704724b29d52ce7e8dcddb59b266afcf169db08d6",
        "7b7a7de0c4d6cb234777a595da5a240e4c84e7cd22954b61a093f66aa6676ea4",
        "1b28cc85de15b3b1547215585726a272f4f76c6be56dd6dc7399f3f5cb099db0",
        "954781eccfad0fbaab60c665d7c4d73ef21d7c6852816b4a36ebc3b945533332",
        "a4cd6b9c614b57536481bc092a7065757eda14643e2c1d6a23ec840990cacffe",
        "5f6b9ec2d25373a30dbaec11fcbb0b78ce980c116a5369133c09cc3960d95b5f",
        "05e813f75819e554944f1702b9ed9d50ff098e3b1fed292dc300838ba4f478f5",
        "b10b711515e4648036aad785efeace686463f37421281c24bfe68aa2b8bc19cd",
        "8850aa7796ce4cc6a83887b29328eb9bf40a2480d58906c929d9d71b40a5d2fd",
        "a42f1cd4e571b7023d360c383802efc1f62bc95388b84cc4d41897ffdc7943ed",

        "8266ea5348644f948a0c6c6e731185872f76bb29285938e21b5b31357bb8bef3",
        "6d03e85d6b8dc214586859348d21ac9109511820d0e2dd663cba990858ffaff9",
        "110a756e3b98f96805fda4e3152bc66affb14454191ca6022867cc2df1bb6f7e",
        "d89da2ebd17ca8b2a54b6dae2fec71e841d9a150b4e279354071732af7022c69",
        "4fafb8a1cea86dfdfa1cfc020294e119bc98737be63173144a84c799b0a3f468",
        "0883727864ec427ed160856646b5808ea486da37d450b006fd719da1b05f3280",
        "740c72fd21c970aca88ccbc8b07806dd37898e90c3276c63ac3bcc41e168d3b5",
        "348a112ccdf7eb2e8158f3ef535f6c0de8c3fabd93ad7d71cc9a4694eb585e0d",
        "d580c01775721336b33c367260f935bbcdd397c9b2b1fb3c66213d0eb9016a7d",
        "cb47a3b8fa6eb6c021feb45c28059a2b7bf7213ddfa4fde9ab58858ae2423d28"
    ];

    let web3js = getWeb3Instance();

    function getWeb3Instance() {
        let web3js = new web3(new web3.providers.WebsocketProvider(config.eth.wsRPC));
        const provider = web3js.currentProvider;
        provider.on("connect", function () {
            console.log("Infura Websocket Provider connection established!");
        });
        provider.on("error", async function (err) {
            console.log(err);
            await sleep(5000);
            return getWeb3Instance();
        });
        return web3js;
    }

    function signMsg(ticket, sign_count) {
        let values = [
            {value: ticket.amount.toString(), type: 'uint256'},
            {value: ticket.dst_address, type: 'address'},
            {value: ticket.dst_network, type: 'uint256'},
            {value: ticket.name, type: 'string'},
            {value: ticket.nonce, type: 'uint256'},
            {value: ticket.origin_hash, type: 'string'},
            {value: ticket.origin_network, type: 'uint256'},
            {value: ticket.src_address, type: 'string'},
            {value: ticket.src_hash, type: 'string'},
            {value: ticket.src_network, type: 'uint256'},
            {value: ticket.symbol, type: 'string'},
        ];

        let invoice = web3.utils.soliditySha3(...values);

        let print_count = 1;//prvs.length;
        let owner = [];
        let s = [];
        let r = [];
        let v = [];
        for (let i = 0; i < prvs.length; i++) {
            let res = privateKeyToAddress(prvs[i]);
            owner.push(res);
        }
        //console.log(JSON.stringify(owner));
        let signs = [];
        for (let j = 0; j < sign_count; j++)
            for (let i = 0; i < print_count; i++) {
                let res = Utils.sign_message(invoice, prvs[i]);
                v.push(res.v);
                r.push(res.r);
                s.push(res.s);
                let sign = {v: res.v, r: res.r, s: res.s};
                //signs.push(sign);
                signs.push([res.v, res.r, res.s]);
            }
        //console.log(JSON.stringify(signs));
        return signs;
    }

    it('sign (s r v) with web3 Bridge', async () => {
        let Ticket = {
            dst_address: "0x78B77d5d7A1DFd9a2DA3EE91AFbc205B7eDD1D4d",
            dst_network: 97,
            amount: 1000,
            src_hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
            src_address: "0x02025547a8e82f04feee617a27858a9e081bfde3fee3a57260137c5f686d7e6936",
            src_network: 7,
            origin_hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
            origin_network: 7,
            nonce: 2,
            name: "BIT enecuum testnet",
            symbol: "BITtestTOKEN"
        };
        signMsg(Ticket, 2);
    });

    //
    // Deploy contracts
    //
    async function deployFixture() {
        const SpaceVault = await ethers.getContractFactory("SpaceVault");
        const SpaceStorage = await ethers.getContractFactory("SpaceStorage");
        const SpaceBridge = await ethers.getContractFactory("SpaceBridge");
        const [owner, addr1, addr2] = await ethers.getSigners();

        // To deploy our contract, we just have to call Token.deploy() and await
        // its deployed() method, which happens once its transaction has been
        // mined.
        const hardhatVault = await SpaceVault.deploy();
        const hardhatStorage = await SpaceStorage.deploy();
        const hardhatBridge = await SpaceBridge.deploy(5);

        // Fixtures can return anything you consider useful for y
        return {SpaceVault, SpaceStorage, SpaceBridge, hardhatVault, hardhatStorage, hardhatBridge, owner, addr1, addr2}
    }

    //
    // Deploy contracts and setup
    //
    async function deployAndSetupFixture() {
        const SpaceVault = await ethers.getContractFactory("SpaceVault");
        const SpaceStorage = await ethers.getContractFactory("SpaceStorage");
        const SpaceBridge = await ethers.getContractFactory("SpaceBridge");
        const [owner, addr1, addr2] = await ethers.getSigners();

        // To deploy our contract, we just have to call Token.deploy() and await
        // its deployed() method, which happens once its transaction has been
        // mined.
        const hardhatVault = await SpaceVault.deploy();
        const hardhatStorage = await SpaceStorage.deploy();
        const hardhatBridge = await SpaceBridge.deploy(5);

        await hardhatVault.setBridge(hardhatBridge.address);
        await hardhatStorage.setBridge(hardhatBridge.address);
        let networkId = 1;
        let decimals = 5;
        await hardhatStorage.addNetwork(networkId, decimals);

        for (let i = 0; i < 2; i++) {
            let res = privateKeyToAddress(prvs[i]);
            await hardhatStorage.addValidator(res);
        }
        await hardhatStorage.setThreshold(2);

        await hardhatBridge.setVault(hardhatVault.address);
        await hardhatBridge.setStorage(hardhatStorage.address);

        // Fixtures can return anything you consider useful for y
        return {SpaceVault, SpaceStorage, SpaceBridge, hardhatVault, hardhatStorage, hardhatBridge, owner, addr1, addr2}
    }

    //
    // Deploy ERC20
    //
    async function deployTokenFixture() {
        const Token = await ethers.getContractFactory("Token");
        const [ownerTKN] = await ethers.getSigners();

        // To deploy our contract, we just have to call Token.deploy() and await
        // its deployed() method, which happens once its transaction has been
        // mined.

        let name = "Token ERC20 test";
        let symbol = "TST";
        let supply = "100000000000000000";
        let decimals = 6;
        const hardhatToken = await Token.deploy(name, symbol, supply, decimals);
        // Fixtures can return anything you consider useful for y
        return {hardhatToken, ownerTKN}
    }

    it("Test deploy Vault", async function () {
        const [owner] = await ethers.getSigners();

        const SpaceVault = await ethers.getContractFactory("SpaceVault");

        const hardhatSpaceVault = await SpaceVault.deploy();

        //const bridgeAddress = await hardhatSpaceVault.bridge();
        expect(await hardhatSpaceVault.bridge()).to.equal(ZX);
    });

    it("Test deploy all contracts", async function () {
        const {hardhatVault, hardhatStorage, hardhatBridge, owner, addr1, addr2} = await loadFixture(
            deployFixture
        );

        //const bridgeAddress = await hardhatSpaceVault.bridge();
        expect(await hardhatVault.bridge()).to.equal(ZX);
    });

    it("check start state without setup, modifier", async function () {
        const {hardhatVault, hardhatStorage, hardhatBridge, owner, addr1, addr2} = await loadFixture(
            deployFixture
        );

        //set bridge address in vault contract (from owner)
        await expect(
            hardhatVault.setBridge(hardhatBridge.address)
        );

        //set bridge address in vault contract (from addr1)
        await expect(
            hardhatVault.connect(addr1).setBridge(hardhatBridge.address)
        ).to.be.revertedWith("governance");

        //set bridge address in vault contract (from addr1)
        await expect(
            hardhatStorage.connect(addr1).setBridge(hardhatBridge.address)
        ).to.be.revertedWith("governance");
    });


    it("check setup", async function () {
        const {hardhatVault, hardhatStorage, hardhatBridge, owner, addr1, addr2} = await loadFixture(
            deployAndSetupFixture
        );

        expect(await hardhatVault.getBridge()).to.equal(hardhatBridge.address);
        expect(await hardhatStorage.getBridge()).to.equal(hardhatBridge.address);
        expect(await hardhatBridge.vault()).to.equal(hardhatVault.address);
        expect(await hardhatBridge.spaceStorage()).to.equal(hardhatStorage.address);
    });

    //
    //check allowance, if needed set approve
    //lock token in Bridge contacr
    //
    async function lock(from_address, token_address, hardhatBridge, vault_address, dist_network_id, amount) {
        const Token = await ethers.getContractFactory("Token");
        const hardhatToken = await Token.attach(token_address);
        if(await hardhatToken.allowance(from_address, vault_address) < amount) {
            //approve
            await hardhatToken.approve(vault_address, amount);
        }

        await hardhatBridge.lock(from_address, dist_network_id, amount, hardhatToken.address);
    }

    //
    //Test lock erc20 & unlock
    //
    it("lock erc20 and claim", async function () {
        const {hardhatVault, hardhatStorage, hardhatBridge, owner, addr1, addr2} = await loadFixture(
            deployAndSetupFixture
        );
        let {hardhatToken} = await loadFixture(
            deployTokenFixture
        );
        let ownerBalance = await hardhatToken.balanceOf(owner.address);

        let dist_network_id = 1;
        let amount = BigInt(10e6);

        //check error allowance
        await expect(
            hardhatBridge.lock(owner.address, dist_network_id, amount, hardhatToken.address)
        ).to.be.revertedWith("Token allowance to Vault too low");

        await lock(owner.address, hardhatToken.address, hardhatBridge, hardhatVault.address, dist_network_id, amount)

        expect(
            await hardhatToken.balanceOf(owner.address)
        ).to.equal(BigInt(ownerBalance) - amount);

        expect(
            await hardhatToken.balanceOf(hardhatVault.address)
        ).to.equal(amount);

        //Check lock map
        expect(
            await hardhatStorage.lock_map(hardhatToken.address.toString().substring(2).toLowerCase())
        ).to.equal(hardhatToken.address);

        expect(
            await hardhatStorage.validators("0x1F04445E17AA4B64cc9390fd2f76474A5e9B72c1")
        ).to.equal(1);

        let Ticket = {
            dst_address: owner.address,
            dst_network: 5,
            amount: 2e6,
            src_hash: "1111111111111111111111111111111111111111111111111111111111111111",
            src_address: "02025547a8e82f04feee617a27858a9e081bfde3fee3a57260137c5f686d7e6936",
            src_network: 1,
            origin_hash: hardhatToken.address.toString().substring(2).toLowerCase(),
            origin_network: 5,
            nonce: 1,
            name: "",
            symbol: ""
        };
        let signatures = signMsg(Ticket, 2);

        await hardhatBridge.claim(Ticket, signatures);

        expect(
            await hardhatToken.balanceOf(owner.address)
        ).to.equal(BigInt(ownerBalance) - amount + BigInt(Ticket.amount));
    });


    it("mint wrapped erc20 and burn", async function () {
        const {hardhatVault, hardhatStorage, hardhatBridge, owner, addr1, addr2} = await loadFixture(
            deployAndSetupFixture
        );

        let dist_network_id = 1;
        let amount = BigInt(10e18);

        expect(
            await hardhatStorage.validators("0x1F04445E17AA4B64cc9390fd2f76474A5e9B72c1")
        ).to.equal(1);

        let Ticket = {
              dst_address : owner.address,
              dst_network : 5,
              amount : amount,
              src_hash : "0000000000000000000000000000000000000000000000000000000000000001",
              src_address : "03e1b75070a2dee57246cfdf52aa9102a1d924126c17c52d86eef869812c575887",
              src_network : 1,
              origin_hash : "0000000000000000000000000000000000000000000000000000000000000001",
              origin_network : 1,
              nonce : 1,
              name : "Enecuum testnet BIT",
              symbol : "SBBIT"
            };

        let signatures = signMsg(Ticket, 2);

        await hardhatBridge.claim(Ticket, signatures);

        let wr_token_addr = await hardhatStorage.getAddressFromOriginHahs(Ticket.origin_hash);

        const WRToken = await ethers.getContractFactory("WrapedToken");
        const hardhatWRToken = await WRToken.attach(wr_token_addr);

        expect(
            await hardhatWRToken.balanceOf(owner.address)
        ).to.equal(amount);

        expect(
            await hardhatWRToken.totalSupply()
        ).to.equal(amount);

        let burn_amount = amount / 2n;
        await lock(owner.address, wr_token_addr, hardhatBridge, hardhatVault.address, dist_network_id, burn_amount);
        /*await hardhatWRToken.approve(hardhatVault.address, burn_amount);

        await hardhatBridge.lock(owner.address, dist_network_id, burn_amount, hardhatWRToken.address.toLowerCase());
        */
        expect(
            await hardhatWRToken.totalSupply()
        ).to.equal(amount - burn_amount);
    });


});