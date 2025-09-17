const express = require('express');
const axios = require('axios');
const LineIntegration = require('../services/line-integration');

const router = express.Router();

module.exports = (db, fulfillmentService = null, providers = null) => {
  const lineIntegration = new LineIntegration(db, fulfillmentService, providers);

  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.get('X-Line-Signature');
    const body = req.body.toString();

    if (!lineIntegration.verifySignature(body, signature)) {
      console.log('Invalid signature');
      return res.status(401).send('Unauthorized');
    }

    const data = JSON.parse(body);

    for (const event of data.events) {
      try {
        if (event.type === 'message' && event.message.type === 'text') {
          const userMessage = event.message.text.toLowerCase();
          let replyMessage;

          switch (userMessage) {
            case 'hello':
            case 'hi':
            case 'start':
            case 'menu':
              replyMessage = lineIntegration.createQuickReplyMenu();
              break;

            case 'browse':
            case 'shop':
              const brands = await db.getBrands();
              replyMessage = await lineIntegration.createBrandCarousel(brands);
              break;

            case 'cart':
              const session = lineIntegration.getUserSession(event.source.userId);
              replyMessage = lineIntegration.createCartSummary(session);
              break;

            case 'help':
              replyMessage = {
                type: 'text',
                text: `🆘 K-Shop Help\n\n📱 Commands:\n• "browse" - View gift cards\n• "cart" - View shopping cart\n• "orders" - Your orders\n• "help" - This message\n\n💳 We accept USDT on Kaia blockchain\n\n📞 Support: support@kshop.com`
              };
              break;

            default:
              if (userMessage.includes('order')) {
                const orders = await db.getUserOrdersByLineId(event.source.userId);
                if (orders.length > 0) {
                  const latestOrder = orders[0];
                  replyMessage = {
                    type: 'text',
                    text: `📦 Latest Order:\nID: ${latestOrder.orderId}\nStatus: ${latestOrder.status}\n\nType "orders" to see all orders.`
                  };
                } else {
                  replyMessage = {
                    type: 'text',
                    text: '📦 No orders found. Start shopping to create your first order!'
                  };
                }
              } else {
                replyMessage = lineIntegration.createQuickReplyMenu();
              }
          }

          await lineIntegration.replyMessage(event.replyToken, [replyMessage]);

        } else if (event.type === 'postback') {
          const replyMessage = await lineIntegration.handlePostback(
            event.source.userId,
            event.postback.data
          );
          await lineIntegration.replyMessage(event.replyToken, [replyMessage]);

        } else if (event.type === 'follow') {
          const profile = await getProfile(event.source.userId);
          await lineIntegration.saveLineUser(profile);

          const welcomeMessage = {
            type: 'flex',
            altText: 'Welcome to K-Shop!',
            contents: {
              type: 'bubble',
              hero: {
                type: 'image',
                url: 'https://kshop.com/logo.png',
                size: 'full',
                aspectRatio: '20:13',
                aspectMode: 'cover'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: 'Welcome to K-Shop! 🎉',
                    weight: 'bold',
                    size: 'xl',
                    color: '#00ff41'
                  },
                  {
                    type: 'text',
                    text: 'Your #1 Gift Card Marketplace',
                    size: 'md',
                    color: '#666666',
                    margin: 'md'
                  },
                  {
                    type: 'text',
                    text: 'Buy gift cards with USDT on Kaia blockchain and save up to 12%!',
                    size: 'sm',
                    color: '#999999',
                    margin: 'md',
                    wrap: true
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
                      type: 'postback',
                      label: '🛍️ Start Shopping',
                      data: 'action=browse'
                    },
                    color: '#00ff41'
                  }
                ]
              }
            }
          };

          await lineIntegration.replyMessage(event.replyToken, [welcomeMessage]);

        } else if (event.type === 'unfollow') {
          console.log(`User unfollowed: ${event.source.userId}`);
        }
      } catch (error) {
        console.error('Error handling event:', error);
      }
    }

    res.status(200).send('OK');
  });

  async function getProfile(userId) {
    try {
      const response = await axios.get(
        `https://api.line.me/v2/bot/profile/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting profile:', error);
      return null;
    }
  }

  router.post('/notify-order/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    try {
      const order = await db.getOrder(orderId);
      if (!order || !order.line_user_id) {
        return res.status(404).json({ error: 'Order not found or no LINE user' });
      }

      await lineIntegration.sendOrderNotification(order.line_user_id, {
        ...order,
        status
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending notification:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  router.post('/send-payment-qr/:orderId', async (req, res) => {
    const { orderId } = req.params;

    try {
      const order = await db.getOrder(orderId);
      if (!order || !order.line_user_id) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const qrMessage = await lineIntegration.createPaymentQR(order);
      await lineIntegration.sendMessage(order.line_user_id, qrMessage);

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending QR:', error);
      res.status(500).json({ error: 'Failed to send QR' });
    }
  });

  return router;
};

module.exports.LineIntegration = LineIntegration;