const web3 = require('web3');
const Utils = require('./Utils');
const privateKeyToAddress = require('ethereum-private-key-to-address');

describe("ecdsa signature", function() {
    let web3js = getWeb3Instance();

    function getWeb3Instance(){
        let web3js = new web3(new web3.providers.WebsocketProvider("wss://ropsten.infura.io/ws/v3/88762928a4164487b3fcdd2dc892598d"));
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
    let messageHash = "433319e1d6f278538edcca783ef87aabcc648daa39d5a93fc99bbfdd84a9a0c5"//Utils.sha256(message);
    //console.log('hash: ' + messageHash)
    let prvkey = 'cad960ece1d27b3389f6f3af90837deefc322454ad8af8e6466395c40ce67f3f'
    let compressedKey = '029dd222eeddd5c3340e8d46ae0a22e2c8e301bfee4903bcf8c899766c8ceb3a7d';
    let decompressedKey = '04d2bb0e1fbd37bebb5cf3235111d05fa866a85bd616702f2dc7a980c2082d69d88b24e2fd3c2bef939987cee0b6dd3ce307ef39a98b36395aba036ed45ad42d6c'


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


    //console.log(sign)
    it('sign with web3', async () => {
        let prv_1 = "4d7c91407e5954e6b80e2c5f3658363452cf932b3a74fa4703472a7978960302";
        let prv_2 = "1c15507d37b3e02c88cecdd01b818e4bbac9d561c98e39e031d586b6a31484fa"
        let token = '0xf6958cf3127e62d3eb26c79f4f45d3f3b2ccded4';
        let address = '0x78B77d5d7A1DFd9a2DA3EE91AFbc205B7eDD1D4d';
        let amount = 1000;
        let repiter = 1;
        let result = [];
        let print_count = prvs.length;
        for(let j = 0; j < repiter; j++)
            for(let i = 0; i<print_count;i++) {
                let res =  Utils.sign_msg(token, address, amount, prvs[i]);
               result.push(res.signature);
            }
        console.log(JSON.stringify(result));
    });
    it('sign with web3 Bridge 2', async () => {
        let dst_address = "0x7219D87299b18d8f4118838E7cB51A7c48fcbcF0";
        let dst_network = 13;
        let amount = 1000;
        let src_hash = "1111111111111111111111111111111111111111111111111111111111111111";
        let src_address = "02025547a8e82f04feee617a27858a9e081bfde3fee3a57260137c5f686d7e6936";
        let src_network = 7;
        let origin_hash = "1111111111111111111111111111111111111111111111111111111111111111";
        let origin_network = 7;
        let nonce = 1;
        let name = "BIT enecuum testnet";
        let symbol = "BITTESTTOKEN";

        let invoice =  web3js.utils.soliditySha3(dst_address, dst_network, amount, src_hash, src_address, src_network, origin_hash, origin_network, nonce, name, symbol);

        let repiter = 1;
        let result = [];
        let print_count = prvs.length;
        for(let j = 0; j < repiter; j++)
            for(let i = 0; i<print_count;i++) {
                let res =  Utils.sign_message(invoice, prvs[i]);
                result.push(res.signature);
            }
        console.log(JSON.stringify(result));
    });
    it('sign (s r v) with web3 Bridge 2', async () => {
        // let dst_address = "0x78B77d5d7A1DFd9a2DA3EE91AFbc205B7eDD1D4d";
        // let dst_network = 5;
        // let amount = 1000;
        // let src_hash = "0x1111111111111111111111111111111111111111111111111111111111111111";
        // let src_address = "0x02025547a8e82f04feee617a27858a9e081bfde3fee3a57260137c5f686d7e6936";
        // let src_network = 7;
        // let origin_hash = "0x1111111111111111111111111111111111111111111111111111111111111111";
        // let origin_network = 7;
        // let nonce = 1;
        // let name = "BIT enecuum testnet";
        // let symbol = "BITtestTOKEN";

        let dst_address = "0x78B77d5d7A1DFd9a2DA3EE91AFbc205B7eDD1D4d";
        let dst_network = 5;
        let amount = 2000000000000000000;
        let src_hash = "0xd050e000eEF099179D224cCD3964cc4B683383F1";
        let src_address = "0x78B77d5d7A1DFd9a2DA3EE91AFbc205B7eDD1D4d";
        let src_network = 777;
        let origin_hash = "0xd050e000eEF099179D224cCD3964cc4B683383F1";
        let origin_network = 5;
        let nonce = 2;
        let name = " Booster Wrapped Ether";
        let symbol = "BWETH";

        let invoice =  web3js.utils.soliditySha3(dst_address, dst_network, amount, src_hash, src_address, src_network, origin_hash, origin_network, nonce, name, symbol);

        console.log({invoice});
        let print_count = 1;//prvs.length;
        let owner = [];
        let s = [];
        let r = [];
        let v = [];
        for(let i = 0; i<prvs.length;i++) {
            let res = privateKeyToAddress(prvs[i]);
            owner.push(res);
        }
        console.log(`owners:`);
        console.log(JSON.stringify(owner));

        for(let j = 0; j < 1; j++)
            for(let i = 0; i<print_count;i++) {
                let res = Utils.sign_message(invoice, prvs[i]);
                v.push(res.v);
                r.push(res.r);
                s.push(res.s);
            }
        console.log(`v:`);
        console.log(JSON.stringify(v));
        console.log(`r:`);
        console.log(JSON.stringify(r));
        console.log(`s:`);
        console.log(JSON.stringify(s));
    });

    it('sign (s r v) with web3', async () => {
        let prv_1 = "4d7c91407e5954e6b80e2c5f3658363452cf932b3a74fa4703472a7978960302";
        let prv_2 = "1c15507d37b3e02c88cecdd01b818e4bbac9d561c98e39e031d586b6a31484fa"
        let token = '0xf6958cf3127e62d3eb26c79f4f45d3f3b2ccded4';
        let address = '0x78B77d5d7A1DFd9a2DA3EE91AFbc205B7eDD1D4d';
        let amount = 1000;
        let repiter = 3000;
        let print_count = prvs.length;
        let owner = [];
        let s = [];
        let r = [];
        let v = [];
        for(let i = 0; i<prvs.length;i++) {
            let res = privateKeyToAddress(prvs[i]);
            owner.push(res);
        }
        console.log(`owners:`);
        console.log(JSON.stringify(owner));

        for(let j = 0; j < repiter; j++)
            for(let i = 0; i<print_count;i++) {
                let res = Utils.sign_msg(token, address, amount, prvs[i]);
                v.push(res.v);
                r.push(res.r);
                s.push(res.s);
            }
        console.log(`v:`);
        console.log(JSON.stringify(v));
        console.log(`r:`);
        console.log(JSON.stringify(r));
        console.log(`s:`);
        console.log(JSON.stringify(s));
    });
    it('get eth address from prv', async () =>{
        let pub = "02ee31ff297c00842c71b35cdd4ac405e2a95a33ebda71de7e712bfd2178ffdfc2";
        let prv = "1c15507d37b3e02c88cecdd01b818e4bbac9d561c98e39e031d586b6a31484fa"


        for(let i = 20; i<prvs.length;i++) {
            let res = privateKeyToAddress(prvs[i]);
            console.log(res);
        }
    });
});