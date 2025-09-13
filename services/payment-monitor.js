const { ethers } = require('ethers');
const EventEmitter = require('events');

class PaymentMonitor extends EventEmitter {
  constructor(db, blockchainService) {
    super();
    this.db = db.db;
    this.blockchain = blockchainService;
    this.provider = new ethers.JsonRpcProvider(
      process.env.NODE_ENV === 'production' 
        ? 'https://public-en.node.kaia.io'
        : 'https://public-en-kairos.node.kaia.io'
    );
    this.marketplaceAddress = process.env.KAIA_MARKETPLACE_CONTRACT;
    
    this.pendingOrders = new Map(); // orderId -> order data
    this.isMonitoring = false;
    this.checkInterval = 15000;
    this.confirmationsRequired = 3;
    this.marketplaceContract = null;
    
    // Initialize marketplace contract if address is provided
    if (this.marketplaceAddress) {
      const MARKETPLACE_ABI = [
        'event GiftCardPurchased(bytes32 indexed purchaseId, address indexed buyer, string indexed shopId, uint256 amount, uint256 tokenAmount)',
        'event GiftCardConfirmed(bytes32 indexed purchaseId, address indexed buyer)',
        'event GiftCardRefunded(bytes32 indexed purchaseId, address indexed buyer, uint256 tokenAmount)'
      ];
      this.marketplaceContract = new ethers.Contract(
        this.marketplaceAddress,
        MARKETPLACE_ABI,
        this.provider
      );
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('Payment monitoring started');
    
    await this.loadPendingOrders();
    this.setupEventListeners();
    this.startPolling();
  }

  stopMonitoring() {
    this.isMonitoring = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    console.log('Payment monitoring stopped');
  }

  async loadPendingOrders() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT o.*, b.name as brand_name, b.api_provider
        FROM orders o
        LEFT JOIN brands b ON o.brand_id = b.id
        WHERE o.status IN ('pending', 'awaiting_payment')
        AND o.expires_at > datetime('now')
      `, (err, rows) => {
        if (err) {
          console.error('Error loading pending orders:', err);
          reject(err);
          return;
        }
        
        rows.forEach(row => {
          this.pendingOrders.set(row.id, {
            orderId: row.id,
            customerEmail: row.customer_email,
            brandId: row.brand_id,
            brandName: row.brand_name,
            value: row.value,
            price: row.price,
            status: row.status,
            createdAt: row.created_at,
            expiresAt: row.expires_at
          });
        });
        
        console.log(`Loaded ${rows.length} pending orders for monitoring`);
        resolve();
      });
    });
  }

  addOrderToMonitor(orderId, orderData) {
    this.pendingOrders.set(orderId, {
      ...orderData,
      lastChecked: 0,
      confirmations: 0
    });
    
    this.db.run(`
      INSERT OR REPLACE INTO payment_monitoring 
      (order_id, expected_amount, status, created_at)
      VALUES (?, ?, 'waiting', datetime('now'))
    `, [orderId, orderData.price]);
  }

  removeOrderFromMonitor(orderId) {
    this.pendingOrders.delete(orderId);
  }

  setupEventListeners() {
    if (!this.marketplaceContract) {
      console.warn('Marketplace contract not initialized. Set KAIA_MARKETPLACE_CONTRACT in environment.');
      return;
    }

    // Listen for gift card purchases
    this.marketplaceContract.on('GiftCardPurchased', async (purchaseId, buyer, shopId, amount, tokenAmount, event) => {
      console.log(`GiftCardPurchased event detected:`);
      console.log(`- Purchase ID: ${purchaseId}`);
      console.log(`- Buyer: ${buyer}`);
      console.log(`- Shop ID: ${shopId}`);
      console.log(`- Amount: ${amount.toString()}`);
      console.log(`- Token Amount: ${ethers.formatUnits(tokenAmount, 18)}`);
      
      await this.handleGiftCardPurchase(
        purchaseId,
        buyer,
        shopId,
        amount.toString(),
        tokenAmount.toString(),
        event.transactionHash
      );
    });

    // Listen for gift card confirmations
    this.marketplaceContract.on('GiftCardConfirmed', async (purchaseId, buyer, event) => {
      console.log(`GiftCardConfirmed event detected: ${purchaseId} by ${buyer}`);
      await this.handleGiftCardConfirmation(purchaseId, buyer, event.transactionHash);
    });

    // Listen for refunds
    this.marketplaceContract.on('GiftCardRefunded', async (purchaseId, buyer, tokenAmount, event) => {
      console.log(`GiftCardRefunded event detected: ${purchaseId} to ${buyer}`);
      await this.handleGiftCardRefund(purchaseId, buyer, tokenAmount.toString(), event.transactionHash);
    });
    
    console.log('Marketplace event listeners established');
  }

  startPolling() {
    this.pollingTimer = setInterval(async () => {
      await this.checkPendingOrders();
    }, this.checkInterval);
    
    this.checkPendingOrders();
  }

  async checkPendingOrders() {
    const orders = Array.from(this.pendingOrders.entries());
    
    for (const [orderId, orderData] of orders) {
      if (Date.now() - orderData.lastChecked < 10000) continue;
      
      try {
        // Check if order has expired
        const expiresAt = new Date(orderData.expiresAt);
        if (expiresAt < new Date()) {
          await this.expireOrder(orderId);
          continue;
        }
        
        orderData.lastChecked = Date.now();
      } catch (error) {
        console.error(`Error checking order ${orderId}:`, error.message);
      }
    }
  }

  async expireOrder(orderId) {
    console.log(`Expiring order ${orderId}`);
    
    this.db.run(`
      UPDATE orders 
      SET status = 'expired', updated_at = datetime('now')
      WHERE id = ? AND status IN ('pending', 'awaiting_payment')
    `, [orderId], (err) => {
      if (err) {
        console.error(`Error expiring order ${orderId}:`, err);
        return;
      }
      
      // Restore stock if needed
      this.db.run(`
        UPDATE gift_cards 
        SET stock_quantity = stock_quantity + 1
        WHERE id = (SELECT gift_card_id FROM orders WHERE id = ?)
      `, [orderId]);
      
      this.removeOrderFromMonitor(orderId);
    });
  }

  async handleGiftCardPurchase(purchaseId, buyer, shopId, amount, tokenAmount, txHash) {
    console.log(`Processing gift card purchase: ${purchaseId}`);
    
    // Convert token amount from wei to USDT (assuming 18 decimals in contract but USDT is 6 decimals)
    const tokenAmountFormatted = ethers.formatUnits(tokenAmount, 18);
    
    // Find matching order by shop ID and amount
    const orderData = Array.from(this.pendingOrders.values()).find(order => 
      order.brandId === shopId && parseFloat(order.price) === parseFloat(tokenAmountFormatted)
    );
    
    if (!orderData) {
      console.warn(`No matching pending order found for purchase ${purchaseId}`);
      return;
    }
    
    // Verify transaction has enough confirmations
    const tx = await this.provider.getTransaction(txHash);
    if (tx) {
      const confirmations = await tx.confirmations();
      
      if (confirmations < this.confirmationsRequired) {
        console.log(`Purchase ${purchaseId} waiting for confirmations: ${confirmations}/${this.confirmationsRequired}`);
        // Set up polling to check confirmations later
        setTimeout(() => this.handleGiftCardPurchase(purchaseId, buyer, shopId, amount, tokenAmount, txHash), 30000);
        return;
      }
    }
    
    // Update order status
    this.db.run(`
      UPDATE orders 
      SET status = 'paid',
          tx_hash = ?,
          payment_address = ?,
          paid_at = datetime('now'),
          purchase_id = ?
      WHERE id = ?
    `, [txHash, buyer, purchaseId, orderData.orderId], (err) => {
      if (err) {
        console.error('Error updating order with purchase:', err);
        return;
      }
      
      // Log the transaction
      this.db.run(`
        INSERT INTO blockchain_transactions 
        (tx_hash, from_address, to_address, amount, status, verified_at)
        VALUES (?, ?, ?, ?, 'confirmed', datetime('now'))
      `, [txHash, buyer, this.marketplaceAddress, tokenAmountFormatted]);
      
      // Update payment monitoring
      this.db.run(`
        UPDATE payment_monitoring 
        SET status = 'confirmed',
            received_amount = ?,
            tx_hash = ?,
            confirmed_at = datetime('now')
        WHERE order_id = ?
      `, [tokenAmountFormatted, txHash, orderData.orderId]);
      
      this.emit('payment_confirmed', {
        orderId: orderData.orderId,
        purchaseId: purchaseId,
        amount: parseFloat(tokenAmountFormatted),
        txHash: txHash,
        buyer: buyer
      });
      
      this.removeOrderFromMonitor(orderData.orderId);
    });
  }
  
  async handleGiftCardConfirmation(purchaseId, buyer, txHash) {
    console.log(`Gift card delivery confirmed: ${purchaseId}`);
    
    this.db.run(`
      UPDATE orders 
      SET status = 'confirmed',
          confirmation_tx_hash = ?,
          confirmed_at = datetime('now')
      WHERE purchase_id = ?
    `, [txHash, purchaseId]);
  }
  
  async handleGiftCardRefund(purchaseId, buyer, tokenAmount, txHash) {
    console.log(`Gift card refunded: ${purchaseId}`);
    
    this.db.run(`
      UPDATE orders 
      SET status = 'refunded',
          refund_tx_hash = ?,
          refunded_at = datetime('now')
      WHERE purchase_id = ?
    `, [txHash, purchaseId]);
  }

  async verifyPaymentManually(orderId, txHash) {
    try {
      // First try to verify as marketplace transaction
      const marketplaceVerification = await this.blockchain.verifyMarketplacePurchase(txHash);
      
      if (marketplaceVerification.verified) {
        const order = await new Promise((resolve, reject) => {
          this.db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        if (order && parseFloat(order.price) === parseFloat(marketplaceVerification.tokenAmount)) {
          await this.handleGiftCardPurchase(
            marketplaceVerification.purchaseId,
            marketplaceVerification.buyer,
            marketplaceVerification.shopId,
            marketplaceVerification.amount,
            ethers.parseUnits(marketplaceVerification.tokenAmount, 18).toString(),
            txHash
          );
          return { success: true, message: 'Marketplace purchase verified and confirmed' };
        } else {
          return { success: false, message: 'Order amount mismatch' };
        }
      } else {
        return { success: false, message: marketplaceVerification.error };
      }
    } catch (error) {
      console.error('Manual payment verification error:', error);
      return { success: false, message: error.message };
    }
  }

  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      orderCount: this.pendingOrders.size,
      marketplaceContract: this.marketplaceAddress,
      orders: Array.from(this.pendingOrders.entries()).map(([orderId, data]) => ({
        orderId,
        customerEmail: data.customerEmail,
        brandName: data.brandName,
        value: data.value,
        price: data.price,
        status: data.status,
        expiresAt: data.expiresAt,
        lastChecked: new Date(data.lastChecked).toISOString()
      }))
    };
  }
}

module.exports = PaymentMonitor;