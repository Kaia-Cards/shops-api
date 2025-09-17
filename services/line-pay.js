const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class LinePayService {
  constructor() {
    this.channelId = process.env.LINE_PAY_CHANNEL_ID;
    this.channelSecret = process.env.LINE_PAY_CHANNEL_SECRET;
    this.apiUrl = process.env.LINE_PAY_API_URL || 'https://api-pay.line.me';
    this.confirmUrl = process.env.LINE_PAY_CONFIRM_URL || 'https://kshop.com/api/linepay/confirm';
    this.cancelUrl = process.env.LINE_PAY_CANCEL_URL || 'https://kshop.com/api/linepay/cancel';
  }

  generateSignature(uri, body, nonce) {
    const authMacText = `${this.channelSecret}${uri}${body}${nonce}`;
    return crypto.createHmac('sha256', this.channelSecret)
      .update(authMacText)
      .digest('base64');
  }

  async request(method, path, data = null) {
    const nonce = uuidv4();
    const uri = `${this.apiUrl}${path}`;
    const body = data ? JSON.stringify(data) : '';

    const headers = {
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': this.channelId,
      'X-LINE-Authorization-Nonce': nonce,
      'X-LINE-Authorization': this.generateSignature(path, body, nonce)
    };

    try {
      const response = await axios({
        method,
        url: uri,
        headers,
        data: body
      });

      return response.data;
    } catch (error) {
      console.error('LINE Pay API Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async createPayment(order) {
    const requestData = {
      amount: Math.ceil(order.price),
      currency: 'THB',
      orderId: order.orderId,
      packages: [
        {
          id: order.orderId,
          amount: Math.ceil(order.price),
          name: 'K-Shop Gift Cards',
          products: [
            {
              id: order.gift_card_id,
              name: `${order.brand} Gift Card`,
              quantity: 1,
              price: Math.ceil(order.price),
              imageUrl: order.brand_logo || 'https://kshop.com/logo.png'
            }
          ]
        }
      ],
      redirectUrls: {
        confirmUrl: `${this.confirmUrl}?orderId=${order.orderId}`,
        cancelUrl: `${this.cancelUrl}?orderId=${order.orderId}`
      },
      options: {
        payment: {
          capture: true,
          payType: 'NORMAL'
        },
        display: {
          locale: 'th',
          checkConfirmUrlBrowser: false
        }
      }
    };

    const response = await this.request('POST', '/v3/payments/request', requestData);

    if (response.returnCode === '0000') {
      return {
        transactionId: response.info.transactionId,
        paymentUrl: response.info.paymentUrl.web,
        paymentUrlApp: response.info.paymentUrl.app,
        paymentAccessToken: response.info.paymentAccessToken
      };
    } else {
      throw new Error(`LINE Pay Error: ${response.returnMessage}`);
    }
  }

  async confirmPayment(transactionId, orderId, amount) {
    const requestData = {
      amount: Math.ceil(amount),
      currency: 'THB'
    };

    const response = await this.request(
      'POST',
      `/v3/payments/${transactionId}/confirm`,
      requestData
    );

    if (response.returnCode === '0000') {
      return {
        orderId: response.info.orderId,
        transactionId: response.info.transactionId,
        authorizationExpireDate: response.info.authorizationExpireDate,
        regKey: response.info.regKey,
        payInfo: response.info.payInfo
      };
    } else {
      throw new Error(`LINE Pay Confirm Error: ${response.returnMessage}`);
    }
  }

  async refundPayment(transactionId, amount = null) {
    const requestData = amount ? { refundAmount: Math.ceil(amount) } : {};

    const response = await this.request(
      'POST',
      `/v3/payments/${transactionId}/refund`,
      requestData
    );

    if (response.returnCode === '0000') {
      return {
        refundTransactionId: response.info.refundTransactionId,
        refundTransactionDate: response.info.refundTransactionDate
      };
    } else {
      throw new Error(`LINE Pay Refund Error: ${response.returnMessage}`);
    }
  }

  async checkPaymentStatus(transactionId) {
    const response = await this.request('GET', `/v3/payments/requests/${transactionId}/check`);

    if (response.returnCode === '0000') {
      return response.info;
    } else {
      throw new Error(`LINE Pay Status Check Error: ${response.returnMessage}`);
    }
  }

  async getPaymentDetails(transactionId, orderId = null) {
    const params = orderId ? `?orderId=${orderId}` : '';
    const response = await this.request('GET', `/v3/payments/${transactionId}${params}`);

    if (response.returnCode === '0000') {
      return response.info;
    } else {
      throw new Error(`LINE Pay Details Error: ${response.returnMessage}`);
    }
  }

  async capturePreauth(transactionId, amount) {
    const requestData = {
      amount: Math.ceil(amount),
      currency: 'THB'
    };

    const response = await this.request(
      'POST',
      `/v3/payments/authorizations/${transactionId}/capture`,
      requestData
    );

    if (response.returnCode === '0000') {
      return {
        transactionId: response.info.transactionId,
        orderId: response.info.orderId,
        payInfo: response.info.payInfo
      };
    } else {
      throw new Error(`LINE Pay Capture Error: ${response.returnMessage}`);
    }
  }

  async voidAuthorization(transactionId) {
    const response = await this.request(
      'POST',
      `/v3/payments/authorizations/${transactionId}/void`
    );

    if (response.returnCode === '0000') {
      return true;
    } else {
      throw new Error(`LINE Pay Void Error: ${response.returnMessage}`);
    }
  }

  createPaymentButton(transactionId, paymentUrl) {
    return {
      type: 'flex',
      altText: 'LINE Pay Payment',
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: 'https://pay.line.me/static/images/linepay-logo.png',
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
              text: 'LINE Pay',
              weight: 'bold',
              size: 'xl',
              color: '#00B900'
            },
            {
              type: 'text',
              text: 'Click below to complete payment',
              size: 'sm',
              color: '#666666',
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
                label: '💳 Pay with LINE Pay',
                uri: paymentUrl
              },
              color: '#00B900'
            }
          ]
        }
      }
    };
  }
}

module.exports = LinePayService;