// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

error NFTMarketplace__AlreadyListed(address tokenAddress, uint256 tokenId);
error NFTMarketplace__NoProceeds();
error NFTMarketplace__NotApprovedForMarketplace();
error NFTMarketplace__NotListed(address tokenAddress, uint256 tokenId);
error NFTMarketplace__NotOwner();
error NFTMarketplace__PriceMustBeAboveZero();
error NFTMarketplace__PriceNotMet(
    address tokenAddress,
    uint256 tokenId,
    uint256 price
);
error NFTMarketplace__TransferFailed();

contract NFTMarketplace {
    struct Listing {
        uint256 price;
        address seller;
    }

    event ItemBought(
        address indexed buyer,
        address indexed tokenAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemListed(
        address indexed seller,
        address indexed tokenAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemCanceled(
        address indexed seller,
        address indexed tokenAddress,
        uint256 indexed tokenId
    );

    // NFT Address -> NFT Id. -> Listing
    mapping(address => mapping(uint256 => Listing)) s_listings;

    // Seller Address -> Amount Earned
    mapping(address => uint256) s_proceeds;

    modifier notListed(
        address tokenAddress,
        uint256 tokenId,
        address owner
    ) {
        Listing memory listing = s_listings[tokenAddress][tokenId];
        if (listing.price > 0)
            revert NFTMarketplace__AlreadyListed(tokenAddress, tokenId);
        _;
    }

    modifier isOwner(
        address tokenAddress,
        uint256 tokenId,
        address spender
    ) {
        IERC721 token = IERC721(tokenAddress);
        address owner = token.ownerOf(tokenId);
        if (spender != owner) revert NFTMarketplace__NotOwner();
        _;
    }

    modifier isListed(address tokenAddress, uint256 tokenId) {
        Listing memory listing = s_listings[tokenAddress][tokenId];
        if (listing.price <= 0)
            revert NFTMarketplace__NotListed(tokenAddress, tokenId);
        _;
    }

    /// @notice Method fot listing your NFT on the marketplace.
    /// @dev We could have the contract be the escrow for the NFTs,
    /// but this way people can still hold their NFTs when they are listed.
    /// @param tokenAddress: Address of the NFT.
    /// @param tokenId: The id. of the NFT.
    /// @param price: Sale price of the listed NFT.
    function listItem(
        address tokenAddress,
        uint256 tokenId,
        uint256 price
    )
        external
        notListed(tokenAddress, tokenId, msg.sender)
        isOwner(tokenAddress, tokenId, msg.sender)
    {
        if (price <= 0) revert NFTMarketplace__PriceMustBeAboveZero();
        IERC721 token = IERC721(tokenAddress);
        if (token.getApproved(tokenId) != address(this))
            revert NFTMarketplace__NotApprovedForMarketplace();
        s_listings[tokenAddress][tokenId] = Listing(price, msg.sender);
        emit ItemListed(msg.sender, tokenAddress, tokenId, price);
    }

    function buyItem(address tokenAddress, uint256 tokenId)
        external
        payable
        isListed(tokenAddress, tokenId)
    {
        Listing memory listedItem = s_listings[tokenAddress][tokenId];
        if (msg.value < listedItem.price)
            revert NFTMarketplace__PriceNotMet(
                tokenAddress,
                tokenId,
                listedItem.price
            );
        s_proceeds[listedItem.seller] =
            s_proceeds[listedItem.seller] +
            msg.value;
        delete (s_listings[tokenAddress][tokenId]);
        IERC721(tokenAddress).safeTransferFrom(
            listedItem.seller,
            msg.sender,
            tokenId
        );
        emit ItemBought(msg.sender, tokenAddress, tokenId, listedItem.price);
    }

    function cancelListing(address tokenAddress, uint256 tokenId)
        external
        isOwner(tokenAddress, tokenId, msg.sender)
        isListed(tokenAddress, tokenId)
    {
        delete (s_listings[tokenAddress][tokenId]);
        emit ItemCanceled(msg.sender, tokenAddress, tokenId);
    }

    function updateListing(
        address tokenAddress,
        uint256 tokenId,
        uint256 newPrice
    )
        external
        isListed(tokenAddress, tokenId)
        isOwner(tokenAddress, tokenId, msg.sender)
    {
        s_listings[tokenAddress][tokenId].price = newPrice;
        emit ItemListed(msg.sender, tokenAddress, tokenId, newPrice);
    }

    function withdrawProceeds() external {
        uint256 proceeds = s_proceeds[msg.sender];
        if (proceeds <= 0) revert NFTMarketplace__NoProceeds();
        s_proceeds[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: proceeds}("");
        if (!success) revert NFTMarketplace__TransferFailed();
    }
}
