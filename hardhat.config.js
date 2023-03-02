require("@nomicfoundation/hardhat-toolbox");
require("@nomiclabs/hardhat-etherscan");

const PRIVATE_KEY = <>;
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.7",
  networks: {
    goerli: {
      url: `https://goerli.infura.io/v3/88762928a4164487b3fcdd2dc892598d`,
      accounts: [PRIVATE_KEY],
      id: 5
    },
    polygonMumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: [PRIVATE_KEY],
      id: 80001
    },
    bscTestnet: {
      url: `https://data-seed-prebsc-1-s1.binance.org:8545`,
      accounts: [PRIVATE_KEY],
      id: 97
    }
  },
  etherscan: {
    apiKey: {
      goerli: "IVD4ZVQ8Z2VU613SHF9FNS4ABKKF7WPDYK",
      bscTestnet : 'G6FS6SET5P7V7B6KGFHTTGAFY8Q62FI72H',
      polygonMumbai : 'NRSIR1KMP51HM6S2XXAAI2V867G6SUS2DV'
    },
    customChains: [
      {
        network: "goerli",
        chainId: 5,
        urls: {
          apiURL: "https://api-goerli.etherscan.io/api",
          browserURL: "https://goerli.etherscan.io"
        }
      },
      {
        network: "polygonMumbai",
        chainId: 80001,
        urls: {
          apiURL: "https://api-testnet.polygonscan.com",
          browserURL: "https://mumbai.polygonscan.com"
        }
      }
    ]
  }
};
