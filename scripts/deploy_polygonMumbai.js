async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const SpaceVault = await ethers.getContractFactory("SpaceVault");
    const SpaceStorage = await ethers.getContractFactory("SpaceStorage");
    const SpaceBridge = await ethers.getContractFactory("SpaceBridge");
    // To deploy our contract, we just have to call Token.deploy() and await
    // its deployed() method, which happens once its transaction has been
    // mined.
    const hardhatVault = await SpaceVault.deploy();
    const hardhatStorage = await SpaceStorage.deploy();
    const hardhatBridge = await SpaceBridge.deploy(80001);

    await hardhatVault.setBridge(hardhatBridge.address);
    await hardhatStorage.setBridge(hardhatBridge.address);
    //BIT network
    let networkId = 1;
    let decimals = 10;
    await hardhatStorage.addNetwork(networkId, decimals);
    await hardhatStorage.addNetwork(5, 18); //goerli
    await hardhatStorage.addNetwork(97, 18); //bsc
    await hardhatStorage.addNetwork(23, 3); //test
    await hardhatStorage.addNetwork(29, 4); //test 2

    await hardhatStorage.addValidator("0x1F04445E17AA4B64cc9390fd2f76474A5e9B72c1");
    await hardhatStorage.addValidator("0xf784C9bca8BbDD93A195aeCdBa23472f89B1E7d6");

    await hardhatStorage.setThreshold(1);

    await hardhatBridge.setVault(hardhatVault.address);
    await hardhatBridge.setStorage(hardhatStorage.address);

    console.log("Vault address:", hardhatVault.address);
    console.log("Storage address:", hardhatStorage.address);
    console.log("Bridge address:", hardhatBridge.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
