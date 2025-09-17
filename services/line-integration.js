const axios = require('axios');
const crypto = require('crypto');
const DatabaseAsync = require('./database-async');

class LineIntegration {
  constructor(db, fulfillmentService = null, providers = null) {
    this.db = db instanceof DatabaseAsync ? db : new DatabaseAsync();
    this.fulfillmentService = fulfillmentService;
    this.providers = providers;
    this.channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    this.channelSecret = process.env.LINE_CHANNEL_SECRET;
    this.liffUrl = process.env.LINE_LIFF_URL || 'https://liff.line.me/2008107509-1kq9JJmd';
    this.sessions = new Map();
  }

  verifySignature(body, signature) {
    if (!this.channelSecret) return false;

    const hash = crypto
      .createHmac('sha256', this.channelSecret)
      .update(body, 'utf8')
      .digest('base64');

    return hash === signature;
  }

  getUserSession(userId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        cart: [],
        currentView: 'menu',
        selectedBrand: null,
        selectedCard: null,
        orderHistory: [],
        preferences: {
          language: 'en',
          currency: 'USD'
        }
      });
    }
    return this.sessions.get(userId);
  }

  async saveLineUser(profile) {
    try {
      const existingUser = await this.db.getLineUser(profile.userId);

      if (!existingUser) {
        await this.db.createLineUser({
          line_user_id: profile.userId,
          display_name: profile.displayName,
          picture_url: profile.pictureUrl,
          status_message: profile.statusMessage
        });
      } else {
        await this.db.updateLineUser(profile.userId, {
          display_name: profile.displayName,
          picture_url: profile.pictureUrl,
          status_message: profile.statusMessage,
          last_interaction: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error saving LINE user:', error);
    }
  }

  async sendMessage(userId, messages) {
    if (!this.channelAccessToken) {
      console.log('LINE_CHANNEL_ACCESS_TOKEN not configured');
      return;
    }

    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        {
          to: userId,
          messages: Array.isArray(messages) ? messages : [messages]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.channelAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error.response?.data || error.message);
    }
  }

  async replyMessage(replyToken, messages) {
    if (!this.channelAccessToken) {
      console.log('LINE_CHANNEL_ACCESS_TOKEN not configured');
      return;
    }

    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        {
          replyToken,
          messages: Array.isArray(messages) ? messages : [messages]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.channelAccessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error) {
      console.error('Failed to reply message:', error.response?.data || error.message);
    }
  }

  async createBrandCarousel(brands) {
    const columns = brands.slice(0, 10).map(brand => ({
      thumbnailImageUrl: brand.logo || 'https://via.placeholder.com/300x200',
      imageBackgroundColor: '#FFFFFF',
      title: brand.name.substring(0, 40),
      text: `${brand.category} • ${brand.discount}% OFF`,
      defaultAction: {
        type: 'postback',
        label: 'View',
        data: `action=view_brand&brand_id=${brand.id}`
      },
      actions: [
        {
          type: 'postback',
          label: '🛒 Shop Now',
          data: `action=select_brand&brand_id=${brand.id}`
        },
        {
          type: 'postback',
          label: 'ℹ️ Details',
          data: `action=brand_info&brand_id=${brand.id}`
        }
      ]
    }));

    return {
      type: 'template',
      altText: 'Gift Card Brands',
      template: {
        type: 'carousel',
        columns,
        imageAspectRatio: 'rectangle',
        imageSize: 'cover'
      }
    };
  }

  createCardOptions(brand, cards) {
    const quickReply = {
      items: cards.slice(0, 13).map(card => ({
        type: 'action',
        action: {
          type: 'postback',
          label: `$${card.value}`,
          data: `action=select_card&brand_id=${brand.id}&card_id=${card.id}&value=${card.value}`,
          displayText: `Buy $${card.value} ${brand.name} card`
        }
      }))
    };

    return {
      type: 'text',
      text: `Select ${brand.name} gift card value:\n💰 ${brand.discount}% discount available`,
      quickReply
    };
  }

  createOrderConfirmation(order) {
    return {
      type: 'flex',
      altText: 'Order Confirmation',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '✅ Order Confirmed',
              weight: 'bold',
              size: 'xl',
              color: '#00ff41'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: `Order ID: ${order.orderId}`,
              size: 'sm',
              color: '#999999'
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: 'Brand:',
                  color: '#666666',
                  flex: 2
                },
                {
                  type: 'text',
                  text: order.brand,
                  flex: 3,
                  align: 'end'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: 'Value:',
                  color: '#666666',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `$${order.value}`,
                  flex: 3,
                  align: 'end'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: 'Price:',
                  color: '#666666',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `${order.pricing.finalPrice} USDT`,
                  flex: 3,
                  align: 'end',
                  weight: 'bold',
                  color: '#00ff41'
                }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: 'Savings:',
                  color: '#666666',
                  flex: 2
                },
                {
                  type: 'text',
                  text: `$${order.pricing.savings}`,
                  flex: 3,
                  align: 'end',
                  color: '#ff5722'
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              height: 'sm',
              action: {
                type: 'uri',
                label: '💳 Pay Now',
                uri: `${this.liffUrl}?order=${order.orderId}`
              },
              color: '#00ff41'
            },
            {
              type: 'button',
              style: 'secondary',
              height: 'sm',
              action: {
                type: 'postback',
                label: '📋 View Details',
                data: `action=order_details&order_id=${order.orderId}`
              }
            }
          ]
        }
      }
    };
  }

  createCartSummary(session) {
    if (session.cart.length === 0) {
      return {
        type: 'text',
        text: '🛒 Your cart is empty. Browse our gift cards to start shopping!'
      };
    }

    const total = session.cart.reduce((sum, item) => sum + item.price, 0);
    const items = session.cart.map((item, index) =>
      `${index + 1}. ${item.brand} - $${item.value} (${item.price} USDT)`
    ).join('\n');

    return {
      type: 'text',
      text: `🛒 Shopping Cart:\n\n${items}\n\n💰 Total: ${total} USDT`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '✅ Checkout',
              data: 'action=checkout'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '🗑️ Clear Cart',
              data: 'action=clear_cart'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '➕ Add More',
              data: 'action=browse'
            }
          }
        ]
      }
    };
  }

  async createPaymentQR(order) {
    const qrData = {
      address: order.payment.address,
      amount: order.payment.amount,
      network: 'kaia',
      token: 'USDT'
    };

    const qrString = JSON.stringify(qrData);
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrString)}`;

    return {
      type: 'flex',
      altText: 'Payment QR Code',
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '📱 Scan to Pay',
              weight: 'bold',
              size: 'lg',
              align: 'center'
            }
          ]
        },
        hero: {
          type: 'image',
          url: qrApiUrl,
          size: 'full',
          aspectRatio: '1:1',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'Payment Details',
              weight: 'bold',
              size: 'md',
              margin: 'md'
            },
            {
              type: 'text',
              text: `Amount: ${order.payment.amount} USDT`,
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'text',
              text: 'Network: Kaia',
              size: 'sm',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'text',
              text: `Expires in: ${order.expiresIn} minutes`,
              size: 'sm',
              color: '#ff5722',
              margin: 'sm'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'uri',
                label: 'Open in App',
                uri: `${this.liffUrl}?order=${order.orderId}`
              },
              color: '#00ff41'
            }
          ]
        }
      }
    };
  }

  createQuickReplyMenu() {
    return {
      type: 'text',
      text: 'What would you like to do?',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '🛍️ Browse',
              data: 'action=browse'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '🛒 Cart',
              data: 'action=view_cart'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '📦 Orders',
              data: 'action=my_orders'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '💰 Deals',
              data: 'action=hot_deals'
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '❓ Help',
              data: 'action=help'
            }
          }
        ]
      }
    };
  }

  async handlePostback(userId, data) {
    const session = this.getUserSession(userId);
    const params = new URLSearchParams(data);
    const action = params.get('action');

    switch (action) {
      case 'browse':
        const brands = await this.db.getBrands();
        return await this.createBrandCarousel(brands);

      case 'select_brand':
        const brandId = params.get('brand_id');
        const brand = await this.db.getBrand(brandId);
        const cards = await this.db.getGiftCards(brandId);
        session.selectedBrand = brand;
        return this.createCardOptions(brand, cards);

      case 'select_card':
        const cardId = params.get('card_id');
        const value = params.get('value');
        const selectedBrand = session.selectedBrand;

        if (selectedBrand) {
          session.cart.push({
            brand: selectedBrand.name,
            brandId: selectedBrand.id,
            cardId,
            value,
            price: value * (1 - selectedBrand.discount / 100)
          });

          return {
            type: 'text',
            text: `✅ Added ${selectedBrand.name} $${value} card to cart!`,
            quickReply: {
              items: [
                {
                  type: 'action',
                  action: {
                    type: 'postback',
                    label: '🛒 View Cart',
                    data: 'action=view_cart'
                  }
                },
                {
                  type: 'action',
                  action: {
                    type: 'postback',
                    label: '➕ Add More',
                    data: 'action=browse'
                  }
                }
              ]
            }
          };
        }
        break;

      case 'view_cart':
        return this.createCartSummary(session);

      case 'clear_cart':
        session.cart = [];
        return {
          type: 'text',
          text: '🗑️ Cart cleared successfully!'
        };

      case 'checkout':
        if (session.cart.length === 0) {
          return {
            type: 'text',
            text: '❌ Your cart is empty!'
          };
        }

        if (session.cart.length === 1) {
          const item = session.cart[0];

          const orderData = {
            wallet_address: `line_user_${userId}`,
            brand_id: item.brandId,
            gift_card_id: item.cardId,
            card_value: parseFloat(item.value),
            usdt_amount: parseFloat(item.price),
            delivery_email: `${userId}@line.user`,
            line_user_id: userId
          };

          const order = await this.createKShopOrder(orderData);
          session.cart = [];

          return this.createOrderConfirmation(order);
        } else {
          return {
            type: 'text',
            text: '❌ Multiple items checkout not yet supported. Please checkout one item at a time.'
          };
        }

      case 'my_orders':
        const orders = await this.db.getUserOrders(userId);
        if (orders.length === 0) {
          return {
            type: 'text',
            text: '📦 You have no orders yet. Start shopping to see your orders here!'
          };
        }

        const orderList = orders.slice(0, 5).map((order, index) =>
          `${index + 1}. Order #${order.orderId.slice(-8)}\n   ${order.brand} - $${order.value}\n   Status: ${order.status}`
        ).join('\n\n');

        return {
          type: 'text',
          text: `📦 Your Recent Orders:\n\n${orderList}`
        };

      case 'hot_deals':
        const deals = await this.db.getHotDeals();
        const dealsList = deals.map(deal =>
          `🔥 ${deal.brand} - ${deal.discount}% OFF`
        ).join('\n');

        return {
          type: 'text',
          text: `💰 Hot Deals Today:\n\n${dealsList}\n\nTap "Browse" to shop these deals!`
        };

      default:
        return this.createQuickReplyMenu();
    }
  }

  async createKShopOrder(orderData) {
    return new Promise((resolve, reject) => {
      const orderId = require('uuid').v4();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const paymentAddress = this.generatePaymentAddress();

      this.db.db.run(`
        INSERT INTO orders (
          order_id, wallet_address, brand_id, gift_card_id, card_value,
          usdt_amount, delivery_email, line_user_id, payment_address,
          expires_at, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
      `, [
        orderId,
        orderData.wallet_address,
        orderData.brand_id,
        orderData.gift_card_id,
        orderData.card_value,
        orderData.usdt_amount,
        orderData.delivery_email,
        orderData.line_user_id,
        paymentAddress,
        expiresAt
      ], (err) => {
        if (err) return reject(err);

        this.db.db.get(`
          SELECT o.*, b.name as brand_name, b.logo as brand_logo, b.discount_rate,
                 gc.value as gift_card_value
          FROM orders o
          JOIN brands b ON o.brand_id = b.id
          JOIN gift_cards gc ON o.gift_card_id = gc.id
          WHERE o.order_id = ?
        `, [orderId], (err, order) => {
          if (err) return reject(err);

          const result = {
            orderId: order.order_id,
            brand: order.brand_name,
            brandLogo: order.brand_logo,
            value: order.card_value,
            pricing: {
              originalValue: order.card_value,
              discountedPrice: order.usdt_amount,
              savings: order.card_value - order.usdt_amount,
              cashback: order.usdt_amount * 0.01,
              finalPrice: order.usdt_amount
            },
            payment: {
              method: 'USDT',
              amount: order.usdt_amount,
              address: order.payment_address,
              network: 'kaia'
            },
            status: order.status,
            expiresAt: order.expires_at,
            expiresIn: 15
          };

          resolve(result);
        });
      });
    });
  }

  generatePaymentAddress() {
    return '0x' + require('crypto').randomBytes(20).toString('hex');
  }

  async fulfillOrderIfPaid(orderId) {
    if (this.fulfillmentService) {
      try {
        const result = await this.fulfillmentService.fulfillOrder(orderId);

        if (result.success) {
          const order = await this.db.getOrder(orderId);
          if (order && order.line_user_id) {
            await this.sendOrderNotification(order.line_user_id, {
              ...order,
              status: 'completed',
              card_code: result.cardCode,
              pin_code: result.pinCode
            });
          }
        }
      } catch (error) {
        console.error('Fulfillment error:', error);
      }
    }
  }

  async sendOrderNotification(userId, order) {
    const message = {
      type: 'flex',
      altText: `Order ${order.status}: ${order.brand} $${order.value}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: order.status === 'completed' ? '🎉 Order Complete!' : `📦 Order ${order.status}`,
              weight: 'bold',
              size: 'lg',
              color: order.status === 'completed' ? '#00ff41' : '#666666'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `${order.brand} - $${order.value}`,
              weight: 'bold',
              size: 'md'
            },
            order.card_code && {
              type: 'text',
              text: `Gift Card Code: ${order.card_code}`,
              margin: 'md',
              size: 'sm',
              color: '#00ff41',
              weight: 'bold'
            },
            order.pin_code && {
              type: 'text',
              text: `PIN: ${order.pin_code}`,
              margin: 'sm',
              size: 'sm',
              color: '#666666'
            }
          ].filter(Boolean)
        }
      }
    };

    await this.sendMessage(userId, message);
  }
}

module.exports = LineIntegration;