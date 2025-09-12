const axios = require('axios');
const crypto = require('crypto');

class GiftCardProvider {
  constructor(apiKey, apiSecret, providerId) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.providerId = providerId;
    this.baseUrl = process.env[`PROVIDER_${providerId}_API_URL`] || 'https://api.giftcards.com/v2';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      }
    });
  }

  generateSignature(payload) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  async getProducts(countryCode = null, category = null) {
    try {
      const params = {};
      if (countryCode) params.country = countryCode;
      if (category) params.category = category;
      
      const response = await this.client.get('/products', { params });
      return response.data.products.map(product => ({
        id: product.id,
        name: product.name,
        country: product.country,
        category: product.category,
        minValue: product.range?.min || product.packages?.[0]?.value,
        maxValue: product.range?.max || product.packages?.[product.packages.length - 1]?.value,
        currency: product.currency,
        discount: product.discount || 0,
        available: product.available,
        imageUrl: product.image,
        description: product.description
      }));
    } catch (error) {
      console.error('Provider getProducts error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getProductDetails(productId) {
    try {
      const response = await this.client.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      console.error('Provider getProductDetails error:', error.response?.data || error.message);
      throw error;
    }
  }

  async createOrder(productId, amount, email, phoneNumber = null) {
    try {
      const payload = {
        productId,
        amount,
        email,
        webhook_url: process.env.WEBHOOK_URL || `${process.env.API_BASE_URL}/webhooks/provider`,
        delivery: {
          email: email
        }
      };

      if (phoneNumber) {
        payload.delivery.phone = phoneNumber;
      }

      payload.signature = this.generateSignature(payload);

      const response = await this.client.post('/orders', payload);
      
      return {
        orderId: response.data.id,
        status: response.data.status,
        invoiceId: response.data.invoice_id,
        amount: response.data.amount,
        currency: response.data.currency,
        paymentAddress: response.data.payment?.address,
        paymentAmount: response.data.payment?.amount,
        expiresAt: response.data.expires_at
      };
    } catch (error) {
      console.error('Provider createOrder error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getOrder(orderId) {
    try {
      const response = await this.client.get(`/orders/${orderId}`);
      return {
        orderId: response.data.id,
        status: response.data.status,
        cardCode: response.data.value?.code,
        cardPin: response.data.value?.pin,
        redemptionUrl: response.data.value?.instructions,
        deliveredAt: response.data.delivered_at
      };
    } catch (error) {
      console.error('Provider getOrder error:', error.response?.data || error.message);
      throw error;
    }
  }

  async confirmPayment(orderId, txHash) {
    try {
      const payload = {
        tx_hash: txHash,
        confirmed: true
      };

      const response = await this.client.post(`/orders/${orderId}/confirm`, payload);
      return response.data;
    } catch (error) {
      console.error('Provider confirmPayment error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getBalance() {
    try {
      const response = await this.client.get('/account/balance');
      return {
        balance: response.data.balance,
        currency: response.data.currency,
        pendingOrders: response.data.pending_orders
      };
    } catch (error) {
      console.error('Provider getBalance error:', error.response?.data || error.message);
      throw error;
    }
  }

  async validateWebhook(signature, payload) {
    const expectedSignature = this.generateSignature(payload);
    return signature === expectedSignature;
  }

  async handleWebhook(data) {
    const eventType = data.event;
    const order = data.order;

    switch (eventType) {
      case 'order.paid':
        return { 
          type: 'payment_confirmed', 
          orderId: order.id,
          status: 'paid'
        };
      
      case 'order.delivered':
        return {
          type: 'order_delivered',
          orderId: order.id,
          cardCode: order.value?.code,
          cardPin: order.value?.pin,
          status: 'delivered'
        };
      
      case 'order.failed':
        return {
          type: 'order_failed',
          orderId: order.id,
          reason: order.failure_reason,
          status: 'failed'
        };
      
      default:
        return { type: 'unknown', data };
    }
  }
}

class TangoCardProvider extends GiftCardProvider {
  constructor(apiKey, apiSecret) {
    super(apiKey, apiSecret, 'TANGO');
    this.baseUrl = 'https://api.tangocard.com/raas/v2';
    this.client = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: apiKey,
        password: apiSecret
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getCatalog() {
    try {
      const response = await this.client.get('/catalogs');
      return response.data.brands.map(brand => ({
        brandKey: brand.brandKey,
        brandName: brand.brandName,
        items: brand.items.map(item => ({
          utid: item.utid,
          denomination: item.denomination,
          currency: item.currencyCode,
          minValue: item.minValue,
          maxValue: item.maxValue,
          faceValue: item.faceValue
        }))
      }));
    } catch (error) {
      console.error('TangoCard getCatalog error:', error.response?.data || error.message);
      throw error;
    }
  }

  async placeOrder(customerEmail, utid, amount, externalRefId) {
    try {
      const payload = {
        customerIdentifier: customerEmail,
        accountIdentifier: process.env.TANGO_ACCOUNT_ID,
        amount: amount,
        utid: utid,
        sendEmail: true,
        recipient: {
          email: customerEmail,
          firstName: 'Customer',
          lastName: 'User'
        },
        externalRefID: externalRefId
      };

      const response = await this.client.post('/orders', payload);
      
      return {
        referenceOrderID: response.data.referenceOrderID,
        status: response.data.status,
        reward: {
          credentials: response.data.reward?.credentials,
          redemptionInstructions: response.data.reward?.redemptionInstructions
        }
      };
    } catch (error) {
      console.error('TangoCard placeOrder error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getOrderStatus(referenceOrderID) {
    try {
      const response = await this.client.get(`/orders/${referenceOrderID}`);
      return response.data;
    } catch (error) {
      console.error('TangoCard getOrderStatus error:', error.response?.data || error.message);
      throw error;
    }
  }
}

class DingConnectProvider extends GiftCardProvider {
  constructor(apiKey, apiSecret) {
    super(apiKey, apiSecret, 'DING');
    this.baseUrl = 'https://api.dingconnect.com/v1';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getProviders(countryIso = null) {
    try {
      const url = countryIso ? `/providers/${countryIso}` : '/providers';
      const response = await this.client.get(url);
      return response.data.providers;
    } catch (error) {
      console.error('Ding getProviders error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getProducts(providerCode) {
    try {
      const response = await this.client.get(`/providers/${providerCode}/products`);
      return response.data.products.map(product => ({
        skuCode: product.SkuCode,
        productName: product.ProductName,
        minAmount: product.Minimum,
        maxAmount: product.Maximum,
        commission: product.CommissionRate,
        processingFee: product.ProcessingFee
      }));
    } catch (error) {
      console.error('Ding getProducts error:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendTransfer(skuCode, amount, accountNumber, customerEmail) {
    try {
      const payload = {
        SkuCode: skuCode,
        SendValue: amount,
        AccountNumber: accountNumber,
        DistributorRef: crypto.randomBytes(16).toString('hex'),
        Settings: {
          SendEmail: true,
          EmailAddress: customerEmail
        }
      };

      const response = await this.client.post('/topups', payload);
      
      return {
        transactionId: response.data.TransferRecord.TransferId,
        status: response.data.ResultCode === '1' ? 'Success' : 'Failed',
        pins: response.data.TransferRecord.PinDetail,
        receiptText: response.data.TransferRecord.ReceiptText
      };
    } catch (error) {
      console.error('Ding sendTransfer error:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = {
  GiftCardProvider,
  TangoCardProvider,
  DingConnectProvider
};