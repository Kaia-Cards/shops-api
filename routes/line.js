const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const router = express.Router();

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LIFF_URL = 'https://liff.line.me/2008107509-1kq9JJmd';

function verifySignature(body, signature) {
  if (!LINE_CHANNEL_SECRET) return false;

  const hash = crypto
    .createHmac('sha256', LINE_CHANNEL_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  return hash === signature;
}

async function replyMessage(replyToken, messages) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.log('LINE_CHANNEL_ACCESS_TOKEN not configured');
    return;
  }

  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages
      },
      {
        headers: {
          'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Failed to reply message:', error.response?.data || error.message);
  }
}

function createWelcomeMessage() {
  return {
    type: 'flex',
    altText: 'Welcome to K SHOP - Gift Card Marketplace',
    contents: {
      type: 'bubble',
      hero: {
        type: 'image',
        url: 'https://kshoplive.vercel.app/favicon.svg',
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
            text: 'K SHOP',
            weight: 'bold',
            size: 'xl',
            color: '#00ff41'
          },
          {
            type: 'text',
            text: 'Gift Card Marketplace',
            size: 'md',
            color: '#666666',
            margin: 'sm'
          },
          {
            type: 'text',
            text: 'Buy gift cards with USDT on Kaia blockchain',
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
              type: 'uri',
              label: '🛒 Shop Now',
              uri: LIFF_URL
            },
            color: '#00ff41'
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            action: {
              type: 'message',
              label: '📋 View Categories',
              text: 'categories'
            }
          }
        ]
      }
    }
  };
}

function createCategoriesMessage() {
  return {
    type: 'flex',
    altText: 'Gift Card Categories',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🎁 Categories',
            weight: 'bold',
            size: 'lg',
            color: '#00ff41'
          },
          {
            type: 'separator',
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '🎮',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1
                  },
                  {
                    type: 'text',
                    text: 'Gaming',
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 5
                  }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '🛒',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1
                  },
                  {
                    type: 'text',
                    text: 'E-commerce',
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 5
                  }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '🍔',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1
                  },
                  {
                    type: 'text',
                    text: 'Food & Dining',
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 5
                  }
                ]
              },
              {
                type: 'box',
                layout: 'baseline',
                spacing: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: '🎬',
                    color: '#aaaaaa',
                    size: 'sm',
                    flex: 1
                  },
                  {
                    type: 'text',
                    text: 'Entertainment',
                    wrap: true,
                    color: '#666666',
                    size: 'sm',
                    flex: 5
                  }
                ]
              }
            ]
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
            height: 'sm',
            action: {
              type: 'uri',
              label: '🛒 Browse All',
              uri: LIFF_URL
            },
            color: '#00ff41'
          }
        ]
      }
    }
  };
}

router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Line-Signature');
  const body = req.body.toString();

  if (!verifySignature(body, signature)) {
    console.log('Invalid signature');
    return res.status(401).send('Unauthorized');
  }

  const data = JSON.parse(body);

  data.events.forEach(async (event) => {
    if (event.type === 'message' && event.message.type === 'text') {
      const userMessage = event.message.text.toLowerCase();
      let replyMessage;

      switch (userMessage) {
        case 'hello':
        case 'hi':
        case 'start':
          replyMessage = createWelcomeMessage();
          break;
        case 'categories':
        case 'category':
        case 'browse':
          replyMessage = createCategoriesMessage();
          break;
        case 'shop':
        case 'buy':
        case 'purchase':
          replyMessage = {
            type: 'text',
            text: `🛒 Ready to shop? Visit our marketplace:\n${LIFF_URL}`
          };
          break;
        case 'help':
          replyMessage = {
            type: 'text',
            text: `🆘 K SHOP Help\n\n📱 Commands:\n• "shop" - Open marketplace\n• "categories" - View categories\n• "help" - This message\n\n💳 We accept USDT payments on Kaia blockchain`
          };
          break;
        default:
          replyMessage = {
            type: 'text',
            text: `👋 Welcome to K SHOP!\n\nType "shop" to browse gift cards or "help" for commands.`
          };
      }

      await replyMessage(event.replyToken, [replyMessage]);
    } else if (event.type === 'follow') {
      const welcomeMsg = createWelcomeMessage();
      await replyMessage(event.replyToken, [welcomeMsg]);
    }
  });

  res.status(200).send('OK');
});

router.get('/rich-menu', (req, res) => {
  const richMenu = {
    size: {
      width: 2500,
      height: 1686
    },
    selected: false,
    name: "K SHOP Main Menu",
    chatBarText: "Menu",
    areas: [
      {
        bounds: {
          x: 0,
          y: 0,
          width: 1250,
          height: 843
        },
        action: {
          type: "uri",
          uri: LIFF_URL
        }
      },
      {
        bounds: {
          x: 1250,
          y: 0,
          width: 1250,
          height: 843
        },
        action: {
          type: "message",
          text: "categories"
        }
      },
      {
        bounds: {
          x: 0,
          y: 843,
          width: 1250,
          height: 843
        },
        action: {
          type: "message",
          text: "help"
        }
      },
      {
        bounds: {
          x: 1250,
          y: 843,
          width: 1250,
          height: 843
        },
        action: {
          type: "uri",
          uri: "https://kshoplive.vercel.app"
        }
      }
    ]
  };

  res.json(richMenu);
});

module.exports = router;