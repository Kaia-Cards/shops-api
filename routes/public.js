const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

module.exports = (db, providers, fulfillmentService) => {
  const CASHBACK_RATE = 0.01;

  function generatePaymentAddress() {
    return '0x' + crypto.randomBytes(20).toString('hex');
  }

  function calculatePricing(value, discountRate) {
    const originalValue = value;
    const discountedPrice = value * (1 - discountRate / 100);
    const savings = originalValue - discountedPrice;
    const cashback = discountedPrice * CASHBACK_RATE;
    
    return {
      originalValue: Math.round(originalValue * 100) / 100,
      discountedPrice: Math.round(discountedPrice * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      cashback: Math.round(cashback * 100) / 100,
      finalPrice: Math.round(discountedPrice * 100) / 100
    };
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  router.get('/health', (req, res) => {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'KaiaCards API',
      services: {
        database: db ? 'connected' : 'disconnected',
        fulfillment: fulfillmentService ? 'connected' : 'disconnected',
        providers: providers ? 'connected' : 'disconnected'
      },
      environment: process.env.NODE_ENV || 'development',
      network: process.env.NODE_ENV === 'production' ? 'mainnet' : 'testnet'
    });
  });

  router.get('/brands', (req, res) => {
    db.getBrands((err, brands) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch brands' });
      }
      
      const formattedBrands = brands.map(brand => ({
        id: brand.id,
        name: brand.name,
        logo: brand.logo,
        category: brand.category,
        country: brand.country,
        description: brand.description,
        discount: brand.discount_rate,
        minValue: brand.min_value,
        maxValue: brand.max_value,
        available: brand.is_active === 1,
        cardCount: brand.card_count || 0
      }));
      
      res.json(formattedBrands);
    });
  });

  router.get('/brands/:brandName', (req, res) => {
    const { brandName } = req.params;
    
    db.db.get(`
      SELECT * FROM brands WHERE name = ? AND is_active = 1
    `, [brandName], (err, brand) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!brand) {
        return res.status(404).json({ error: 'Brand not found' });
      }

      db.getGiftCardsByBrand(brandName, (err, cards) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch gift cards' });
        }

        const denominations = [...new Set(cards.map(card => card.value))].sort((a, b) => a - b);
        
        res.json({
          id: brand.id,
          name: brand.name,
          logo: brand.logo,
          category: brand.category,
          country: brand.country,
          description: brand.description,
          discount: brand.discount_rate,
          minValue: brand.min_value,
          maxValue: brand.max_value,
          denominations,
          totalStock: cards.reduce((sum, card) => sum + card.stock_quantity, 0)
        });
      });
    });
  });

  router.get('/brands/:brandName/cards', (req, res) => {
    const { brandName } = req.params;
    
    db.getGiftCardsByBrand(brandName, (err, cards) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch gift cards' });
      }
      
      const formattedCards = cards.map(card => {
        const pricing = calculatePricing(card.value, card.discount_rate);
        return {
          id: card.id,
          value: card.value,
          price: card.price,
          stock: card.stock_quantity,
          sku: card.provider_sku,
          pricing,
          available: card.stock_quantity > 0
        };
      });
      
      res.json(formattedCards);
    });
  });

  router.post('/order', async (req, res) => {
    const { brand, value, email, region = 'Asia', testMode = false, walletAddress } = req.body;
    
    if (!brand || !value || !email) {
      return res.status(400).json({ error: 'Missing required fields: brand, value, email' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    if (typeof value !== 'number' || value <= 0) {
      return res.status(400).json({ error: 'Invalid value amount' });
    }
    
    try {
      db.getBrands((err, brands) => {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }
        
        const selectedBrand = brands.find(b => b.name === brand && b.is_active === 1);
        if (!selectedBrand) {
          return res.status(404).json({ error: 'Brand not found or inactive' });
        }
        
        if (value < selectedBrand.min_value || value > selectedBrand.max_value) {
          return res.status(400).json({ 
            error: `Value must be between $${selectedBrand.min_value} and $${selectedBrand.max_value}` 
          });
        }
        
        db.getGiftCardsByBrand(brand, (err, giftCards) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to fetch gift cards' });
          }
          
          const availableCard = giftCards.find(gc => gc.value === value && gc.stock_quantity > 0);
          if (!availableCard) {
            return res.status(400).json({ error: 'Gift card value not available or out of stock' });
          }
          
          const pricing = calculatePricing(value, selectedBrand.discount_rate);
          const paymentAddress = generatePaymentAddress();
          
          const orderData = {
            brand_id: selectedBrand.id,
            gift_card_id: availableCard.id,
            customer_email: email.toLowerCase().trim(),
            value: value,
            price: pricing.finalPrice,
            cashback: pricing.cashback,
            payment_address: paymentAddress,
            test_mode: testMode ? 1 : 0,
            wallet_address: walletAddress || null
          };
          
          db.createOrder(orderData, (err, result) => {
            if (err) {
              console.error('Order creation error:', err);
              return res.status(500).json({ error: 'Failed to create order' });
            }
            
            db.db.run(`
              UPDATE gift_cards 
              SET stock_quantity = stock_quantity - 1 
              WHERE id = ? AND stock_quantity > 0
            `, [availableCard.id]);

            const logQuery = `
              INSERT INTO inventory_log (id, gift_card_id, action, quantity, reason)
              VALUES (?, ?, ?, ?, ?)
            `;
            
            db.db.run(logQuery, [
              uuidv4(),
              availableCard.id,
              'subtract',
              1,
              `Reserved for order ${result.orderId}`
            ]);
            
            res.json({
              orderId: result.orderId,
              status: 'pending',
              brand: selectedBrand.name,
              brandLogo: selectedBrand.logo,
              value: value,
              pricing: pricing,
              payment: {
                method: 'USDT',
                amount: pricing.finalPrice,
                address: paymentAddress,
                network: 'Kaia'
              },
              expiresAt: result.expiresAt,
              estimatedDelivery: '2-5 minutes after payment'
            });
          });
        });
      });
    } catch (error) {
      console.error('Order creation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/order/:orderId/pay', async (req, res) => {
    const { orderId } = req.params;
    const { txHash, walletAddress } = req.body;
    
    if (!txHash) {
      return res.status(400).json({ error: 'Transaction hash required' });
    }

    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({ error: 'Invalid transaction hash format' });
    }
    
    try {
      db.getOrder(orderId, async (err, order) => {
        if (err || !order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        
        if (order.status !== 'pending') {
          return res.status(400).json({ error: `Order status is ${order.status}, cannot process payment` });
        }
        
        if (new Date() > new Date(order.expires_at)) {
          db.db.run('UPDATE orders SET status = "expired" WHERE id = ?', [orderId]);
          return res.status(400).json({ error: 'Order has expired' });
        }

        db.db.get('SELECT id FROM orders WHERE tx_hash = ? AND id != ?', [txHash, orderId], (err, duplicate) => {
          if (duplicate) {
            return res.status(400).json({ error: 'Transaction hash already used' });
          }

          db.updateOrderPayment(orderId, txHash, (err) => {
            if (err) {
              console.error('Payment update error:', err);
              return res.status(500).json({ error: 'Failed to update payment status' });
            }
            
            setTimeout(async () => {
              try {
                if (fulfillmentService) {
                  const result = await fulfillmentService.fulfillOrder(orderId);
                  console.log(`Order ${orderId} fulfillment result:`, result.success ? 'SUCCESS' : 'FAILED');
                  
                  if (result.success) {
                    db.updateCustomerStats(order.customer_email, order.price, order.cashback, (err) => {
                      if (err) {
                        console.error('Customer stats update error:', err);
                      }
                    });
                  }
                } else {
                  console.log('Fulfillment service not available, using fallback');
                  const mockCardCode = `DEMO-${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
                  db.deliverOrder(orderId, mockCardCode, (err) => {
                    if (!err) {
                      db.updateCustomerStats(order.customer_email, order.price, order.cashback, () => {});
                    }
                  });
                }
              } catch (error) {
                console.error('Fulfillment error:', error);
                db.db.run(`
                  UPDATE orders 
                  SET status = 'failed' 
                  WHERE id = ?
                `, [orderId]);
              }
            }, Math.random() * 3000 + 2000);
            
            res.json({
              orderId,
              status: 'paid',
              message: 'Payment confirmed. Your gift card is being processed and will be delivered shortly.',
              txHash,
              estimatedDelivery: '2-5 minutes'
            });
          });
        });
      });
    } catch (error) {
      console.error('Payment processing error:', error);
      res.status(500).json({ error: 'Payment processing failed' });
    }
  });

  router.get('/order/:orderId', (req, res) => {
    const { orderId } = req.params;
    
    if (!orderId || orderId.length < 10) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }
    
    db.getOrder(orderId, (err, order) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      const response = {
        id: order.id,
        brand: order.brand_name,
        brandLogo: order.brand_logo,
        value: order.value,
        status: order.status,
        pricing: {
          originalValue: order.value,
          finalPrice: order.price,
          cashback: order.cashback
        },
        createdAt: order.created_at,
        expiresAt: order.expires_at
      };
      
      if (order.status === 'delivered') {
        response.cardCode = order.card_code;
        response.deliveredAt = order.delivered_at;
        response.instructions = `Use this ${order.brand_name} gift card code during checkout`;
      }
      
      if (order.status === 'paid') {
        response.paidAt = order.paid_at;
        response.txHash = order.tx_hash;
        response.message = 'Payment confirmed. Gift card is being processed...';
      }

      if (order.status === 'failed') {
        response.message = 'Gift card processing failed. Please contact support.';
      }

      if (order.status === 'expired') {
        response.message = 'Order expired. Please create a new order.';
      }
      
      res.json(response);
    });
  });

  router.get('/user/:email/orders', (req, res) => {
    const { email } = req.params;
    const { limit = 20, offset = 0 } = req.query;
    
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    db.getUserOrders(email.toLowerCase().trim(), (err, orders) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch user orders' });
      }
      
      db.getCustomerStats(email.toLowerCase().trim(), (err, customer) => {
        const userOrders = orders
          .slice(parseInt(offset), parseInt(offset) + parseInt(limit))
          .map(order => ({
            id: order.id,
            brand: order.brand_name,
            brandLogo: order.brand_logo,
            value: order.value,
            status: order.status,
            pricing: {
              finalPrice: order.price,
              cashback: order.cashback
            },
            createdAt: order.created_at,
            cardCode: order.status === 'delivered' ? order.card_code : null,
            canReorder: order.status === 'delivered' || order.status === 'expired'
          }));
        
        res.json({
          orders: userOrders,
          totalCashback: customer ? customer.total_cashback : 0,
          totalSpent: customer ? customer.total_spent : 0,
          orderCount: customer ? customer.order_count : 0,
          pagination: {
            total: orders.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: orders.length > parseInt(offset) + parseInt(limit)
          }
        });
      });
    });
  });

  router.get('/stats', (req, res) => {
    const queries = [
      'SELECT COUNT(*) as totalOrders FROM orders',
      'SELECT SUM(price) as totalVolume FROM orders WHERE status IN ("paid", "delivered")',
      'SELECT COUNT(DISTINCT customer_email) as totalUsers FROM orders',
      'SELECT COUNT(*) as availableBrands FROM brands WHERE active = 1'
    ];
    
    let results = {};
    let completed = 0;
    
    queries.forEach((query, index) => {
      db.db.get(query, (err, row) => {
        if (err) {
          console.error('Stats query error:', err);
          return;
        }
        
        switch (index) {
          case 0:
            results.totalOrders = row.totalOrders || 0;
            break;
          case 1:
            results.totalVolume = Math.round((row.totalVolume || 0) * 100) / 100;
            break;
          case 2:
            results.totalUsers = row.totalUsers || 0;
            break;
          case 3:
            results.availableBrands = row.availableBrands || 0;
            break;
        }
        
        completed++;
        if (completed === queries.length) {
          res.json({
            ...results,
            lastUpdated: new Date().toISOString()
          });
        }
      });
    });
  });

  router.get('/categories', (req, res) => {
    const query = `
      SELECT category, COUNT(*) as brand_count, logo as sample_logo
      FROM brands 
      WHERE active = 1 
      GROUP BY category 
      ORDER BY brand_count DESC
    `;
    
    db.db.all(query, (err, categories) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch categories' });
      }
      res.json(categories);
    });
  });

  return router;
};