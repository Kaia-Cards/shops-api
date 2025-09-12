const { GiftCardProvider, TangoCardProvider, DingConnectProvider } = require('./providers/giftcard-provider');
const TestnetCardGenerator = require('./testnet-card-generator');
const crypto = require('crypto');

class FulfillmentService {
  constructor(db) {
    this.db = db;
    this.providers = new Map();
    this.testnetGenerator = new TestnetCardGenerator();
    this.isTestnet = process.env.NODE_ENV !== 'production';
    this.initializeProviders();
  }

  initializeProviders() {
    if (process.env.PROVIDER_API_KEY && process.env.PROVIDER_API_SECRET) {
      this.providers.set('primary', new GiftCardProvider(
        process.env.PROVIDER_API_KEY,
        process.env.PROVIDER_API_SECRET,
        'PRIMARY'
      ));
    }

    if (process.env.TANGO_API_KEY && process.env.TANGO_API_SECRET) {
      this.providers.set('tango', new TangoCardProvider(
        process.env.TANGO_API_KEY,
        process.env.TANGO_API_SECRET
      ));
    }

    if (process.env.DING_API_KEY) {
      this.providers.set('ding', new DingConnectProvider(
        process.env.DING_API_KEY,
        process.env.DING_API_SECRET || ''
      ));
    }

    this.providers.set('manual', {
      name: 'Manual Provider',
      processOrder: this.processManualOrder.bind(this)
    });
  }

  async fulfillOrder(orderId) {
    return new Promise(async (resolve, reject) => {
      this.db.get(`
        SELECT o.*, b.api_provider, b.supplier_id, gc.sku, s.api_provider as supplier_provider
        FROM orders o
        JOIN brands b ON o.brand_id = b.id
        JOIN gift_cards gc ON o.gift_card_id = gc.id
        LEFT JOIN suppliers s ON b.supplier_id = s.id
        WHERE o.order_id = ? AND o.status = 'paid'
      `, [orderId], async (err, order) => {
        if (err) {
          console.error('Error fetching order for fulfillment:', err);
          reject(err);
          return;
        }

        if (!order) {
          reject(new Error('Order not found or not in paid status'));
          return;
        }

        try {
          await this.updateOrderStatus(orderId, 'processing');

          let result;
          
          if (this.isTestnet) {
            result = await this.testnetGenerator.processTestnetOrder(order);
          } else {
            const providerName = order.supplier_provider || order.api_provider || 'manual';
            const provider = this.providers.get(providerName) || this.providers.get('manual');
            
            if (providerName === 'manual') {
              result = await this.processManualOrder(order);
            } else if (providerName === 'tango' && provider) {
              result = await this.processTangoOrder(provider, order);
            } else if (providerName === 'ding' && provider) {
              result = await this.processDingOrder(provider, order);
            } else if (provider) {
              result = await this.processProviderOrder(provider, order);
            } else {
              result = await this.processInventoryOrder(order);
            }
          }

          if (result.success) {
            await this.deliverOrder(orderId, result.cardCode, result.pin, result.redemptionUrl);
            await this.sendDeliveryNotification(order, result);
            resolve(result);
          } else {
            await this.handleFulfillmentError(orderId, result.error);
            reject(new Error(result.error));
          }
        } catch (error) {
          console.error('Fulfillment error:', error);
          await this.handleFulfillmentError(orderId, error.message);
          reject(error);
        }
      });
    });
  }

  async processProviderOrder(provider, order) {
    try {
      const providerOrder = await provider.createOrder(
        order.sku,
        order.card_value,
        order.delivery_email || order.wallet_address,
        order.delivery_phone
      );

      await this.saveProviderOrder(order.order_id, providerOrder);

      const maxAttempts = 30;
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const orderStatus = await provider.getOrder(providerOrder.orderId);
        
        if (orderStatus.status === 'delivered' && orderStatus.cardCode) {
          return {
            success: true,
            cardCode: orderStatus.cardCode,
            pin: orderStatus.cardPin || '',
            redemptionUrl: orderStatus.redemptionUrl || '',
            providerOrderId: providerOrder.orderId
          };
        } else if (orderStatus.status === 'failed') {
          return {
            success: false,
            error: 'Provider order failed'
          };
        }
        
        attempts++;
      }

      return {
        success: false,
        error: 'Timeout waiting for card delivery'
      };
    } catch (error) {
      console.error('Provider order processing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processTangoOrder(provider, order) {
    try {
      const tangoOrder = await provider.placeOrder(
        order.delivery_email || `${order.wallet_address}@kaiacards.com`,
        order.sku,
        order.card_value,
        order.order_id
      );

      if (tangoOrder.status === 'COMPLETE' && tangoOrder.reward?.credentials) {
        const credentials = tangoOrder.reward.credentials;
        return {
          success: true,
          cardCode: credentials.number || credentials.code || credentials.pin,
          pin: credentials.pin || '',
          redemptionUrl: tangoOrder.reward.redemptionInstructions || '',
          providerOrderId: tangoOrder.referenceOrderID
        };
      }

      return {
        success: false,
        error: 'Tango order not completed'
      };
    } catch (error) {
      console.error('Tango order processing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processDingOrder(provider, order) {
    try {
      const transfer = await provider.sendTransfer(
        order.sku,
        order.card_value,
        order.wallet_address,
        order.delivery_email || `${order.wallet_address}@kaiacards.com`
      );

      if (transfer.status === 'Success' && transfer.pins) {
        return {
          success: true,
          cardCode: transfer.pins.code || transfer.transactionId,
          pin: transfer.pins.pin || '',
          redemptionUrl: transfer.receiptText || '',
          providerOrderId: transfer.transactionId
        };
      }

      return {
        success: false,
        error: 'Ding transfer failed'
      };
    } catch (error) {
      console.error('Ding order processing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processInventoryOrder(order) {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM card_inventory 
        WHERE gift_card_id = ? 
        AND status = 'available'
        AND value = ?
        ORDER BY created_at ASC
        LIMIT 1
      `, [order.gift_card_id, order.card_value], (err, card) => {
        if (err) {
          resolve({ success: false, error: 'Database error' });
          return;
        }

        if (!card) {
          resolve({ success: false, error: 'No cards available in inventory' });
          return;
        }

        this.db.run(`
          UPDATE card_inventory 
          SET status = 'sold', 
              sold_to_order = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `, [order.order_id, card.id], (err) => {
          if (err) {
            resolve({ success: false, error: 'Failed to reserve card' });
            return;
          }

          resolve({
            success: true,
            cardCode: card.card_code,
            pin: card.pin_code || '',
            redemptionUrl: '',
            inventoryId: card.id
          });
        });
      });
    });
  }

  async processManualOrder(order) {
    const cardCode = this.generateCardCode();
    const pin = this.generatePin();
    
    return {
      success: true,
      cardCode: cardCode,
      pin: pin,
      redemptionUrl: `https://kaiacards.com/redeem/${cardCode}`,
      manual: true
    };
  }

  generateCardCode() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  generatePin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  async updateOrderStatus(orderId, status) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE orders 
        SET status = ?, updated_at = datetime('now')
        WHERE order_id = ?
      `, [status, orderId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deliverOrder(orderId, cardCode, pin, redemptionUrl) {
    return new Promise((resolve, reject) => {
      const fulfillmentHash = crypto
        .createHash('sha256')
        .update(`${orderId}${cardCode}${Date.now()}`)
        .digest('hex');

      this.db.run(`
        UPDATE orders 
        SET status = 'delivered',
            card_codes = ?,
            pin_codes = ?,
            redemption_url = ?,
            fulfillment_hash = ?,
            updated_at = datetime('now')
        WHERE order_id = ?
      `, [cardCode, pin, redemptionUrl, fulfillmentHash, orderId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async handleFulfillmentError(orderId, errorMessage) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE orders 
        SET status = 'fulfillment_failed',
            error_message = ?,
            updated_at = datetime('now')
        WHERE order_id = ?
      `, [errorMessage, orderId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async saveProviderOrder(orderId, providerOrder) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO api_logs (
          endpoint, method, request_body, response_body, status_code, created_at
        ) VALUES (
          'provider_order', 'POST', ?, ?, 200, datetime('now')
        )
      `, [JSON.stringify({ orderId }), JSON.stringify(providerOrder)], (err) => {
        if (err) console.error('Error saving provider order:', err);
        resolve();
      });
    });
  }

  async sendDeliveryNotification(order, result) {
    console.log(`Order ${order.order_id} delivered successfully`);
    console.log(`Card Code: ${result.cardCode.substring(0, 4)}****`);
    
    if (order.delivery_email) {
      console.log(`Delivery notification would be sent to: ${order.delivery_email}`);
    }
  }

  async processPendingOrders() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT order_id FROM orders 
        WHERE status = 'paid' 
        AND created_at > datetime('now', '-1 hour')
        ORDER BY created_at ASC
      `, async (err, orders) => {
        if (err) {
          console.error('Error fetching pending orders:', err);
          reject(err);
          return;
        }

        const results = [];
        for (const order of orders) {
          try {
            const result = await this.fulfillOrder(order.order_id);
            results.push({ orderId: order.order_id, success: true, result });
          } catch (error) {
            results.push({ orderId: order.order_id, success: false, error: error.message });
          }
        }

        resolve(results);
      });
    });
  }
}

module.exports = FulfillmentService;