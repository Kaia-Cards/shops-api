const axios = require('axios');

class TangoCardService {
  constructor() {
    this.baseURL = 'https://integration-api.tangocard.com/raas/v2';
    this.platformName = process.env.TANGO_PLATFORM_NAME || 'KaiaCards';
    this.platformKey = process.env.TANGO_PLATFORM_KEY || '';
    this.customerIdentifier = process.env.TANGO_CUSTOMER_IDENTIFIER || 'kaia-cards-customer';
    this.accountIdentifier = process.env.TANGO_ACCOUNT_IDENTIFIER || 'kaia-cards-account';
    
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      auth: {
        username: this.platformName,
        password: this.platformKey
      },
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async getCatalog() {
    try {
      const response = await this.axiosInstance.get('/catalogs');
      
      const asianBrands = response.data.brands.filter(brand => {
        const brandName = brand.brandName.toLowerCase();
        const asianKeywords = ['japan', 'korea', 'china', 'singapore', 'malaysia', 'thailand', 'vietnam', 'philippines', 'indonesia'];
        return asianKeywords.some(keyword => 
          brandName.includes(keyword) || 
          brand.description?.toLowerCase().includes(keyword) ||
          brand.countries?.some(country => asianKeywords.includes(country.toLowerCase()))
        );
      });

      return {
        totalBrands: response.data.brands.length,
        asianBrands: asianBrands.length,
        brands: asianBrands.map(brand => ({
          id: brand.brandKey,
          name: brand.brandName,
          description: brand.description,
          imageUrl: brand.imageUrls?.80 || brand.imageUrls?.130 || brand.imageUrls?.200,
          status: brand.status,
          countries: brand.countries || [],
          denominations: brand.items?.map(item => ({
            utid: item.utid,
            rewardName: item.rewardName,
            currencyCode: item.currencyCode,
            countries: item.countries,
            faceValue: item.faceValue,
            status: item.status
          })) || []
        }))
      };
    } catch (error) {
      console.error('Error fetching Tango catalog:', error.response?.data || error.message);
      throw new Error('Failed to fetch gift card catalog from Tango');
    }
  }

  async createCustomer() {
    try {
      const customerData = {
        customerIdentifier: this.customerIdentifier,
        displayName: 'KaiaCards Customer'
      };

      const response = await this.axiosInstance.post('/customers', customerData);
      return response.data;
    } catch (error) {
      if (error.response?.status === 409) {
        return { customerIdentifier: this.customerIdentifier };
      }
      console.error('Error creating Tango customer:', error.response?.data || error.message);
      throw error;
    }
  }

  async createAccount() {
    try {
      const accountData = {
        accountIdentifier: this.accountIdentifier,
        displayName: 'KaiaCards Account',
        currencyCode: 'USD',
        contactEmail: process.env.ADMIN_EMAIL || 'admin@kaiacards.com'
      };

      const response = await this.axiosInstance.post(
        `/customers/${this.customerIdentifier}/accounts`,
        accountData
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 409) {
        return { accountIdentifier: this.accountIdentifier };
      }
      console.error('Error creating Tango account:', error.response?.data || error.message);
      throw error;
    }
  }

  async getAccountBalance() {
    try {
      const response = await this.axiosInstance.get(
        `/customers/${this.customerIdentifier}/accounts/${this.accountIdentifier}`
      );
      return {
        currentBalance: response.data.currentBalance,
        currencyCode: response.data.currencyCode,
        status: response.data.status
      };
    } catch (error) {
      console.error('Error getting account balance:', error.response?.data || error.message);
      return { currentBalance: 0, currencyCode: 'USD', status: 'UNKNOWN' };
    }
  }

  async depositFunds(amount) {
    try {
      const depositData = {
        amount: amount,
        currencyCode: 'USD',
        description: `Deposit for KaiaCards order`
      };

      const response = await this.axiosInstance.post(
        `/customers/${this.customerIdentifier}/accounts/${this.accountIdentifier}/deposits`,
        depositData
      );
      
      return response.data;
    } catch (error) {
      console.error('Error depositing funds:', error.response?.data || error.message);
      throw new Error('Failed to deposit funds to Tango account');
    }
  }

  async placeOrder(orderData) {
    try {
      const tangoOrder = {
        accountIdentifier: this.accountIdentifier,
        amount: orderData.amount,
        currencyCode: 'USD',
        utid: orderData.utid,
        recipient: {
          name: orderData.recipientName || 'Gift Card Recipient',
          email: orderData.recipientEmail
        },
        sendEmail: false,
        externalRefID: orderData.externalOrderId
      };

      const response = await this.axiosInstance.post('/orders', tangoOrder);
      
      return {
        success: true,
        orderId: response.data.referenceOrderID,
        rewardLink: response.data.reward?.redemptionInstructions,
        cardNumber: response.data.reward?.cardNumber,
        securityCode: response.data.reward?.securityCode,
        expirationDate: response.data.reward?.expirationDate,
        status: response.data.status,
        deliveredAt: response.data.createdDate
      };
    } catch (error) {
      console.error('Error placing Tango order:', error.response?.data || error.message);
      
      if (error.response?.status === 402) {
        throw new Error('Insufficient funds in Tango account');
      }
      
      throw new Error(`Failed to place gift card order: ${error.response?.data?.message || error.message}`);
    }
  }

  async getOrderStatus(referenceOrderID) {
    try {
      const response = await this.axiosInstance.get(`/orders/${referenceOrderID}`);
      
      return {
        orderId: response.data.referenceOrderID,
        status: response.data.status,
        amount: response.data.amountCharged?.value || 0,
        currencyCode: response.data.amountCharged?.currencyCode || 'USD',
        createdDate: response.data.createdDate,
        reward: response.data.reward ? {
          cardNumber: response.data.reward.cardNumber,
          securityCode: response.data.reward.securityCode,
          expirationDate: response.data.reward.expirationDate,
          redemptionInstructions: response.data.reward.redemptionInstructions
        } : null
      };
    } catch (error) {
      console.error('Error getting order status:', error.response?.data || error.message);
      throw new Error('Failed to get order status from Tango');
    }
  }

  async initializeAccount() {
    try {
      await this.createCustomer();
      await this.createAccount();
      
      const balance = await this.getAccountBalance();
      console.log(`Tango account initialized. Balance: ${balance.currentBalance} ${balance.currencyCode}`);
      
      return balance;
    } catch (error) {
      console.error('Error initializing Tango account:', error);
      throw error;
    }
  }

  mapBrandToGiftCard(tangoBrand, denomination) {
    return {
      id: `${tangoBrand.id}_${denomination.utid}`,
      brand: tangoBrand.name,
      value: denomination.faceValue,
      currency: denomination.currencyCode,
      utid: denomination.utid,
      available: denomination.status === 'active' && tangoBrand.status === 'active',
      imageUrl: tangoBrand.imageUrl,
      description: tangoBrand.description,
      countries: denomination.countries
    };
  }

  getAsianBrandMapping() {
    return {
      'Amazon Japan': { emoji: '🛍️', category: 'Shopping', country: 'Japan' },
      'Rakuten': { emoji: '🛍️', category: 'Shopping', country: 'Japan' },
      'Steam': { emoji: '🎮', category: 'Gaming', country: 'Global' },
      'iTunes Japan': { emoji: '🎵', category: 'Entertainment', country: 'Japan' },
      'Google Play Japan': { emoji: '📱', category: 'Entertainment', country: 'Japan' },
      'Spotify': { emoji: '🎵', category: 'Entertainment', country: 'Global' },
      'Netflix': { emoji: '📺', category: 'Entertainment', country: 'Global' },
      'PlayStation': { emoji: '🎮', category: 'Gaming', country: 'Global' },
      'Nintendo': { emoji: '🎮', category: 'Gaming', country: 'Japan' },
      'Uber': { emoji: '🚗', category: 'Transportation', country: 'Global' },
      'Airbnb': { emoji: '🏠', category: 'Travel', country: 'Global' }
    };
  }
}

module.exports = TangoCardService;