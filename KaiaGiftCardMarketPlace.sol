// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract KaiaGiftCardMarketplace is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable paymentToken;
    address public treasuryWallet;
    
    enum PurchaseStatus {
        Pending,
        Confirmed,
        Refunded
    }
    
    struct Shop {
        string name;
        bool isActive;
        uint256 addedAt;
    }
    
    struct Purchase {
        bytes32 purchaseId;
        address buyer;
        string shopId;
        uint256 amount;
        uint256 tokenAmount;
        PurchaseStatus status;
        uint256 createdAt;
    }
    
    mapping(string => Shop) public shops;
    mapping(bytes32 => Purchase) public purchases;
    mapping(address => bytes32[]) public userPurchases;
    mapping(address => uint256) public userTotalSpent;
    
    string[] public shopList;
    bytes32[] public allPurchaseIds;
    
    uint256 public constant VALID_AMOUNTS_LENGTH = 5;
    uint256[VALID_AMOUNTS_LENGTH] public validAmounts = [5, 10, 25, 50, 100];
    
    event ShopAdded(string indexed shopId, string name);
    event ShopUpdated(string indexed shopId, bool isActive);
    event GiftCardPurchased(
        bytes32 indexed purchaseId,
        address indexed buyer,
        string indexed shopId,
        uint256 amount,
        uint256 tokenAmount
    );
    event GiftCardConfirmed(bytes32 indexed purchaseId, address indexed buyer);
    event GiftCardRefunded(bytes32 indexed purchaseId, address indexed buyer, uint256 tokenAmount);
    event TreasuryUpdated(address newTreasury);
    
    modifier validShop(string memory shopId) {
        require(shops[shopId].isActive, "Shop not active or not whitelisted");
        _;
    }
    
    modifier validAmount(uint256 amount) {
        bool isValid = false;
        for (uint256 i = 0; i < VALID_AMOUNTS_LENGTH; i++) {
            if (validAmounts[i] == amount) {
                isValid = true;
                break;
            }
        }
        require(isValid, "Invalid gift card amount");
        _;
    }
    
    constructor(
        address _paymentToken,
        address _treasuryWallet
    ) Ownable(msg.sender) {
        require(_paymentToken != address(0), "Invalid payment token address");
        require(_treasuryWallet != address(0), "Invalid treasury address");
        paymentToken = IERC20(_paymentToken);
        treasuryWallet = _treasuryWallet;
    }
    
    function addShop(
        string memory shopId,
        string memory name
    ) external onlyOwner {
        require(bytes(shopId).length > 0, "Invalid shop ID");
        require(bytes(name).length > 0, "Invalid shop name");
        require(!shops[shopId].isActive && shops[shopId].addedAt == 0, "Shop already exists");
        
        shops[shopId] = Shop({
            name: name,
            isActive: true,
            addedAt: block.timestamp
        });
        
        shopList.push(shopId);
        emit ShopAdded(shopId, name);
    }
    
    function updateShop(
        string memory shopId,
        bool isActive
    ) external onlyOwner {
        require(shops[shopId].addedAt > 0, "Shop not found");
        
        shops[shopId].isActive = isActive;
        emit ShopUpdated(shopId, isActive);
    }
    
    function updateValidAmounts(
        uint256[VALID_AMOUNTS_LENGTH] memory newAmounts
    ) external onlyOwner {
        for (uint256 i = 0; i < VALID_AMOUNTS_LENGTH; i++) {
            require(newAmounts[i] > 0, "Amount must be greater than 0");
            if (i > 0) {
                require(newAmounts[i] > newAmounts[i-1], "Amounts must be in ascending order");
            }
        }
        validAmounts = newAmounts;
    }
    
    function buyGiftCard(
        string memory shopId,
        uint256 amount
    ) external 
        validShop(shopId) 
        validAmount(amount) 
        whenNotPaused 
        nonReentrant 
        returns (bytes32) 
    {
        uint256 tokenAmount = amount * (10 ** 18);
        
        bytes32 purchaseId = keccak256(
            abi.encodePacked(
                msg.sender,
                shopId,
                amount,
                block.timestamp,
                block.number
            )
        );
        
        require(purchases[purchaseId].createdAt == 0, "Purchase already exists");
        
        paymentToken.safeTransferFrom(msg.sender, address(this), tokenAmount);
        
        purchases[purchaseId] = Purchase({
            purchaseId: purchaseId,
            buyer: msg.sender,
            shopId: shopId,
            amount: amount,
            tokenAmount: tokenAmount,
            status: PurchaseStatus.Pending,
            createdAt: block.timestamp
        });
        
        userPurchases[msg.sender].push(purchaseId);
        allPurchaseIds.push(purchaseId);
        userTotalSpent[msg.sender] += tokenAmount;
        
        emit GiftCardPurchased(purchaseId, msg.sender, shopId, amount, tokenAmount);
        return purchaseId;
    }
    
    function confirmGiftCardDelivery(
        bytes32 purchaseId
    ) external nonReentrant {
        Purchase storage purchase = purchases[purchaseId];
        require(purchase.createdAt > 0, "Purchase not found");
        require(purchase.buyer == msg.sender, "Not purchase owner");
        require(purchase.status == PurchaseStatus.Pending, "Purchase already processed");
        
        purchase.status = PurchaseStatus.Confirmed;
        
        paymentToken.safeTransfer(treasuryWallet, purchase.tokenAmount);
        
        emit GiftCardConfirmed(purchaseId, msg.sender);
    }
    
    function refundPurchase(
        bytes32 purchaseId
    ) external onlyOwner nonReentrant {
        Purchase storage purchase = purchases[purchaseId];
        require(purchase.createdAt > 0, "Purchase not found");
        require(purchase.status == PurchaseStatus.Pending, "Purchase already processed");
        
        purchase.status = PurchaseStatus.Refunded;
        
        paymentToken.safeTransfer(purchase.buyer, purchase.tokenAmount);
        userTotalSpent[purchase.buyer] -= purchase.tokenAmount;
        
        emit GiftCardRefunded(purchaseId, purchase.buyer, purchase.tokenAmount);
    }
    
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        treasuryWallet = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function getUserPurchases(address user) external view returns (bytes32[] memory) {
        return userPurchases[user];
    }
    
    function getShopList() external view returns (string[] memory) {
        return shopList;
    }
    
    function getValidAmounts() external view returns (uint256[VALID_AMOUNTS_LENGTH] memory) {
        return validAmounts;
    }
    
    function getPurchaseDetails(bytes32 purchaseId) external view returns (
        address buyer,
        string memory shopId,
        uint256 amount,
        uint256 tokenAmount,
        PurchaseStatus status,
        uint256 createdAt
    ) {
        Purchase memory purchase = purchases[purchaseId];
        return (
            purchase.buyer,
            purchase.shopId,
            purchase.amount,
            purchase.tokenAmount,
            purchase.status,
            purchase.createdAt
        );
    }
    
    function getUserStats(address user) external view returns (
        uint256 totalSpent,
        uint256 purchaseCount,
        bytes32[] memory purchaseIds
    ) {
        return (
            userTotalSpent[user],
            userPurchases[user].length,
            userPurchases[user]
        );
    }
    
    function getShopDetails(string memory shopId) external view returns (
        string memory name,
        bool isActive,
        uint256 addedAt
    ) {
        Shop memory shop = shops[shopId];
        return (
            shop.name,
            shop.isActive,
            shop.addedAt
        );
    }
    
    function emergencyWithdraw(address token) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(address(this).balance);
        } else {
            IERC20(token).safeTransfer(owner(), IERC20(token).balanceOf(address(this)));
        }
    }
}