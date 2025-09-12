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
    this.usdtAddress = process.env.NODE_ENV === 'production'
      ? '0xd077a400968890eacc75cdc901f0356c943e4fdb'
      : '0x5c74070fdea071359b86082bd9f9b3deaafbe32b';
    
    this.monitoringAddresses = new Map();
    this.isMonitoring = false;
    this.checkInterval = 15000;
    this.confirmationsRequired = 3;
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
        SELECT o.order_id, o.wallet_address, o.final_amount, pm.payment_address
        FROM orders o
        LEFT JOIN payment_monitoring pm ON o.order_id = pm.order_id
        WHERE o.status IN ('pending', 'awaiting_payment')
        AND o.expires_at > datetime('now')
      `, (err, rows) => {
        if (err) {
          console.error('Error loading pending orders:', err);
          reject(err);
          return;
        }
        
        rows.forEach(row => {
          if (row.payment_address) {
            this.addAddressToMonitor(
              row.payment_address,
              row.order_id,
              row.final_amount
            );
          }
        });
        
        console.log(`Loaded ${rows.length} pending orders for monitoring`);
        resolve();
      });
    });
  }

  addAddressToMonitor(address, orderId, expectedAmount) {
    this.monitoringAddresses.set(address.toLowerCase(), {
      orderId,
      expectedAmount,
      lastChecked: 0,
      confirmations: 0
    });
    
    this.db.run(`
      INSERT OR REPLACE INTO payment_monitoring 
      (order_id, payment_address, expected_amount, status, created_at)
      VALUES (?, ?, ?, 'waiting', datetime('now'))
    `, [orderId, address, expectedAmount]);
  }

  removeAddressFromMonitor(address) {
    this.monitoringAddresses.delete(address.toLowerCase());
  }

  setupEventListeners() {
    const usdtContract = new ethers.Contract(
      this.usdtAddress,
      ['event Transfer(address indexed from, address indexed to, uint256 value)'],
      this.provider
    );

    usdtContract.on('Transfer', async (from, to, value, event) => {
      const toAddress = to.toLowerCase();
      
      if (this.monitoringAddresses.has(toAddress)) {
        console.log(`USDT Transfer detected to ${to}: ${ethers.formatUnits(value, 6)} USDT`);
        await this.handleIncomingPayment(
          toAddress,
          from,
          ethers.formatUnits(value, 6),
          event.transactionHash
        );
      }
    });
  }

  startPolling() {
    this.pollingTimer = setInterval(async () => {
      await this.checkAllAddresses();
    }, this.checkInterval);
    
    this.checkAllAddresses();
  }

  async checkAllAddresses() {
    const addresses = Array.from(this.monitoringAddresses.entries());
    
    for (const [address, data] of addresses) {
      if (Date.now() - data.lastChecked < 10000) continue;
      
      try {
        await this.checkAddressBalance(address, data);
        data.lastChecked = Date.now();
      } catch (error) {
        console.error(`Error checking address ${address}:`, error.message);
      }
    }
  }

  async checkAddressBalance(address, monitorData) {
    const balance = await this.blockchain.getUSDTBalance(address);
    const balanceFloat = parseFloat(balance);
    
    if (balanceFloat >= monitorData.expectedAmount * 0.99) {
      const latestBlock = await this.provider.getBlockNumber();
      const filter = {
        address: this.usdtAddress,
        topics: [
          ethers.id('Transfer(address,address,uint256)'),
          null,
          ethers.zeroPadValue(address, 32)
        ],
        fromBlock: latestBlock - 100,
        toBlock: 'latest'
      };
      
      const logs = await this.provider.getLogs(filter);
      
      if (logs.length > 0) {
        const latestTransfer = logs[logs.length - 1];
        const txHash = latestTransfer.transactionHash;
        const tx = await this.provider.getTransaction(txHash);
        
        if (tx) {
          const confirmations = await tx.confirmations();
          
          if (confirmations >= this.confirmationsRequired) {
            await this.handleIncomingPayment(
              address,
              tx.from,
              balance,
              txHash
            );
          } else {
            monitorData.confirmations = confirmations;
            console.log(`Payment detected for ${monitorData.orderId}, waiting for confirmations: ${confirmations}/${this.confirmationsRequired}`);
          }
        }
      }
    }
  }

  async handleIncomingPayment(toAddress, fromAddress, amount, txHash) {
    const monitorData = this.monitoringAddresses.get(toAddress);
    if (!monitorData) return;
    
    const amountFloat = parseFloat(amount);
    
    if (amountFloat >= monitorData.expectedAmount * 0.99) {
      console.log(`Payment confirmed for order ${monitorData.orderId}`);
      
      this.db.run(`
        UPDATE payment_monitoring 
        SET status = 'confirmed', 
            received_amount = ?, 
            tx_hash = ?,
            confirmed_at = datetime('now')
        WHERE order_id = ?
      `, [amountFloat, txHash, monitorData.orderId], (err) => {
        if (err) {
          console.error('Error updating payment monitoring:', err);
          return;
        }
        
        this.db.run(`
          UPDATE orders 
          SET status = 'paid',
              tx_hash = ?,
              payment_confirmed_at = datetime('now')
          WHERE order_id = ?
        `, [txHash, monitorData.orderId], (err) => {
          if (err) {
            console.error('Error updating order:', err);
            return;
          }
          
          this.db.run(`
            INSERT INTO transactions 
            (type, order_id, from_address, to_address, amount, token, tx_hash, block_number, status, network)
            VALUES ('payment', ?, ?, ?, ?, 'USDT', ?, ?, 'confirmed', 'kaia')
          `, [
            monitorData.orderId,
            fromAddress,
            toAddress,
            amountFloat,
            txHash,
            0
          ]);
          
          this.emit('payment_confirmed', {
            orderId: monitorData.orderId,
            amount: amountFloat,
            txHash: txHash,
            fromAddress: fromAddress
          });
          
          this.removeAddressFromMonitor(toAddress);
        });
      });
    } else {
      console.log(`Insufficient payment for order ${monitorData.orderId}. Expected: ${monitorData.expectedAmount}, Received: ${amountFloat}`);
      
      this.db.run(`
        UPDATE payment_monitoring 
        SET status = 'insufficient', 
            received_amount = ?
        WHERE order_id = ?
      `, [amountFloat, monitorData.orderId]);
    }
  }

  async verifyPaymentManually(orderId, txHash) {
    try {
      const verification = await this.blockchain.verifyTransaction(txHash);
      
      if (verification.verified) {
        const order = await new Promise((resolve, reject) => {
          this.db.get('SELECT * FROM orders WHERE order_id = ?', [orderId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        if (order && verification.to === order.payment_address) {
          await this.handleIncomingPayment(
            order.payment_address,
            verification.from,
            verification.amount,
            txHash
          );
          return { success: true, message: 'Payment verified and confirmed' };
        } else {
          return { success: false, message: 'Payment address mismatch' };
        }
      } else {
        return { success: false, message: verification.error };
      }
    } catch (error) {
      console.error('Manual payment verification error:', error);
      return { success: false, message: error.message };
    }
  }

  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      addressCount: this.monitoringAddresses.size,
      addresses: Array.from(this.monitoringAddresses.entries()).map(([address, data]) => ({
        address,
        orderId: data.orderId,
        expectedAmount: data.expectedAmount,
        confirmations: data.confirmations,
        lastChecked: new Date(data.lastChecked).toISOString()
      }))
    };
  }
}

module.exports = PaymentMonitor;