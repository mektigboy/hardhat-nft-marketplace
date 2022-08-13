const { assert, expect } = require("chai");
const { developmentChains } = require("../../helper-hardhat-config");
const { deployments, ethers, network } = require("hardhat");

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("NFT Marketplace Unit Tests", function () {
          let marketplace, marketplaceContract, basicNFT, basicNFTContract;
          const PRICE = ethers.utils.parseEther("0.1");
          const TOKEN_ID = 0;

          beforeEach(async function () {
              accounts = await ethers.getSigners(); // could also do with getNamedAccounts
              deployer = accounts[0];
              user = accounts[1];
              await deployments.fixture(["all"]);
              marketplaceContract = await ethers.getContract("NFTMarketplace");
              marketplace = marketplaceContract.connect(deployer);
              basicNFTContract = await ethers.getContract("BasicNFT");
              basicNFT = await basicNFTContract.connect(deployer);
              await basicNFT.mintNFT();
              await basicNFT.approve(marketplaceContract.address, TOKEN_ID);
          });

          describe("listItem()", function () {
              it("Emits an event after listing an item.", async function () {
                  expect(
                      await marketplace.listItem(
                          basicNFT.address,
                          TOKEN_ID,
                          PRICE
                      )
                  ).to.emit("ItemListed");
              });
              it("Exclusively items that have not been listed.", async function () {
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  const error = `AlreadyListed("${basicNFT.address}", ${TOKEN_ID})`;
                  await expect(
                      marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error);
              });
              it("Exclusively allows owners to list.", async function () {
                  marketplace = marketplaceContract.connect(user);
                  await basicNFT.approve(user.address, TOKEN_ID);
                  await expect(
                      marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotOwner");
              });
              it("Needs approvals to list item.", async function () {
                  await basicNFT.approve(
                      ethers.constants.AddressZero,
                      TOKEN_ID
                  );
                  await expect(
                      marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotApprovedForMarketplace");
              });
              it("Updates listing with seller and price.", async function () {
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  const listing = await marketplace.getListing(
                      basicNFT.address,
                      TOKEN_ID
                  );
                  assert(listing.price.toString() == PRICE.toString());
                  assert(listing.seller.toString() == deployer.address);
              });
          });
          describe("cancelListing()", function () {
              it("Reverts if there is no listing.", async function () {
                  const error = `NotListed("${basicNFT.address}", ${TOKEN_ID})`;
                  await expect(
                      marketplace.cancelListing(basicNFT.address, TOKEN_ID)
                  ).to.be.revertedWith(error);
              });
              it("Reverts if anyone, but the owner, tries to call.", async function () {
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  marketplace = marketplaceContract.connect(user);
                  await basicNFT.approve(user.address, TOKEN_ID);
                  await expect(
                      marketplace.cancelListing(basicNFT.address, TOKEN_ID)
                  ).to.be.revertedWith("NotOwner");
              });
              it("Emits event and removes listing.", async function () {
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  expect(
                      await marketplace.cancelListing(
                          basicNFT.address,
                          TOKEN_ID
                      )
                  ).to.emit("ItemCanceled");
                  const listing = await marketplace.getListing(
                      basicNFT.address,
                      TOKEN_ID
                  );
                  assert(listing.price.toString() == "0");
              });
          });
          describe("buyItem()", function () {
              it("Reverts if the item is not listed.", async function () {
                  await expect(
                      marketplace.buyItem(basicNFT.address, TOKEN_ID)
                  ).to.be.revertedWith("NotListed");
              });
              it("Reverts if the price is not met.", async function () {
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  await expect(
                      marketplace.buyItem(basicNFT.address, TOKEN_ID)
                  ).to.be.revertedWith("PriceNotMet");
              });
              it("Transfers the NFT to the buyer, and updates internal proceeds record.", async function () {
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  marketplace = marketplaceContract.connect(user);
                  expect(
                      await marketplace.buyItem(basicNFT.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  ).to.emit("ItemBought");
                  const newOwner = await basicNFT.ownerOf(TOKEN_ID);
                  const deployerProceeds = await marketplace.getProceeds(
                      deployer.address
                  );
                  assert(newOwner.toString() == user.address);
                  assert(deployerProceeds.toString() == PRICE.toString());
              });
          });
          describe("updateListing()", function () {
              it("Must be owner and listed.", async function () {
                  await expect(
                      marketplace.updateListing(
                          basicNFT.address,
                          TOKEN_ID,
                          PRICE
                      )
                  ).to.be.revertedWith("NotListed");
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  marketplace = marketplaceContract.connect(user);
                  await expect(
                      marketplace.updateListing(
                          basicNFT.address,
                          TOKEN_ID,
                          PRICE
                      )
                  ).to.be.revertedWith("NotOwner");
              });
              it("Updates the price of the item.", async function () {
                  const updatedPrice = ethers.utils.parseEther("0.2");
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  expect(
                      await marketplace.updateListing(
                          basicNFT.address,
                          TOKEN_ID,
                          updatedPrice
                      )
                  ).to.emit("ItemListed");
                  const listing = await marketplace.getListing(
                      basicNFT.address,
                      TOKEN_ID
                  );
                  assert(listing.price.toString() == updatedPrice.toString());
              });
          });
          describe("withdrawProceeds()", function () {
              it("Does not allow 0 proceed withdrawals.", async function () {
                  await expect(
                      marketplace.withdrawProceeds()
                  ).to.be.revertedWith("NoProceeds");
              });
              it("Withdraws proceeds.", async function () {
                  await marketplace.listItem(basicNFT.address, TOKEN_ID, PRICE);
                  marketplace = marketplaceContract.connect(user);
                  await marketplace.buyItem(basicNFT.address, TOKEN_ID, {
                      value: PRICE,
                  });
                  marketplace = marketplaceContract.connect(deployer);

                  const deployerProceedsBefore = await marketplace.getProceeds(
                      deployer.address
                  );
                  const deployerBalanceBefore = await deployer.getBalance();
                  const txResponse = await marketplace.withdrawProceeds();
                  const transactionReceipt = await txResponse.wait(1);
                  const { gasUsed, effectiveGasPrice } = transactionReceipt;
                  const gasCost = gasUsed.mul(effectiveGasPrice);
                  const deployerBalanceAfter = await deployer.getBalance();

                  assert(
                      deployerBalanceAfter.add(gasCost).toString() ==
                          deployerProceedsBefore
                              .add(deployerBalanceBefore)
                              .toString()
                  );
              });
          });
      });
