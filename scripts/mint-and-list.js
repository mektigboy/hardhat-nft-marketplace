const { ethers } = require("hardhat");

const PRICE = ethers.utils.parseEther("0.1");

async function mintAndList() {
    const marketplace = await ethers.getContract("NFTMarketplace");
    const basicNFT = await ethers.getContract("BasicNFT");

    console.log("Minting...");

    const mintTransaction = await basicNFT.mintNFT();
    const mintTransactionReceipt = await mintTransaction.wait(1);
    const tokenId = mintTransactionReceipt.events[0].args.tokenId;

    console.log("Approving NFT...");

    const approvalTransaction = await basicNFT.approve(
        marketplace.address,
        tokenId
    );

    await approvalTransaction.wait(1);

    console.log("Listing NFT...");

    const transaction = await marketplace.listItem(
        basicNFT.address,
        tokenId,
        PRICE
    );

    await transaction.wait(1);

    console.log("Listed!");
}

mintAndList()
    .then(() => process.exit(0))
    .catch((error) => {
        console.log(error);
        process.exit(1);
    });
