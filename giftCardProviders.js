const axios = require('axios');
const crypto = require('crypto');

class GiftCardProviders {
  constructor() {
    this.providers = {
      rakuten_api: new RakutenProvider(),
      shopee_api: new ShopeeProvider(),
      coupang_api: new CoupangProvider(),
      klook_api: new KlookProvider(),
      agoda_api: new AgodaProvider()
    };
  }

  async getInventory(provider, brandConfig) {
    if (this.providers[provider]) {
      return await this.providers[provider].getInventory(brandConfig);
    }
    throw new Error(`Provider ${provider} not found`);
  }

  async purchaseGiftCard(provider, orderData, brandConfig) {
    if (this.providers[provider]) {
      return await this.providers[provider].purchaseGiftCard(orderData, brandConfig);
    }
    throw new Error(`Provider ${provider} not found`);
  }
}

class RakutenProvider {
  async getInventory(config) {
    try {
      const denominations = [1000, 3000, 5000, 10000, 30000, 50000];
      return denominations.map(value => ({
        value,
        stock: Math.floor(Math.random() * 50) + 10,
        sku: `RAKUTEN_${value}`
      }));
    } catch (error) {
      console.error('Rakuten inventory error:', error);
      return [];
    }
  }

  async purchaseGiftCard(orderData, config) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const cardCode = this.generateCardCode();
        resolve({
          success: true,
          cardCode,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          instructions: 'Use this code on Rakuten.co.jp checkout page'
        });
      }, 2000);
    });
  }

  generateCardCode() {
    return `RAK-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  }
}

class ShopeeProvider {
  async getInventory(config) {
    try {
      const denominations = [500, 1000, 2000, 5000, 10000, 25000];
      return denominations.map(value => ({
        value,
        stock: Math.floor(Math.random() * 30) + 5,
        sku: `SHOPEE_${value}`
      }));
    } catch (error) {
      console.error('Shopee inventory error:', error);
      return [];
    }
  }

  async purchaseGiftCard(orderData, config) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const cardCode = this.generateCardCode();
        resolve({
          success: true,
          cardCode,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          instructions: 'Use this voucher code in Shopee app wallet section'
        });
      }, 1500);
    });
  }

  generateCardCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'SPE';
    for (let i = 0; i < 13; i++) {
      if (i === 3 || i === 7 || i === 11) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

class CoupangProvider {
  async getInventory(config) {
    try {
      const denominations = [1000, 3000, 5000, 10000, 30000, 100000];
      return denominations.map(value => ({
        value,
        stock: Math.floor(Math.random() * 40) + 8,
        sku: `COUPANG_${value}`
      }));
    } catch (error) {
      console.error('Coupang inventory error:', error);
      return [];
    }
  }

  async purchaseGiftCard(orderData, config) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const cardCode = this.generateCardCode();
        resolve({
          success: true,
          cardCode,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          instructions: 'Enter this code in Coupang payment section'
        });
      }, 1800);
    });
  }

  generateCardCode() {
    return `CPG${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }
}

class KlookProvider {
  async getInventory(config) {
    try {
      const denominations = [2000, 5000, 10000, 20000, 50000, 100000];
      return denominations.map(value => ({
        value,
        stock: Math.floor(Math.random() * 25) + 5,
        sku: `KLOOK_${value}`
      }));
    } catch (error) {
      console.error('Klook inventory error:', error);
      return [];
    }
  }

  async purchaseGiftCard(orderData, config) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const cardCode = this.generateCardCode();
        resolve({
          success: true,
          cardCode,
          expiryDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
          instructions: 'Apply this credit to your Klook account in the Credits section'
        });
      }, 2200);
    });
  }

  generateCardCode() {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) code += '-';
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

class AgodaProvider {
  async getInventory(config) {
    try {
      const denominations = [3000, 7500, 15000, 30000, 75000, 150000];
      return denominations.map(value => ({
        value,
        stock: Math.floor(Math.random() * 20) + 3,
        sku: `AGODA_${value}`
      }));
    } catch (error) {
      console.error('Agoda inventory error:', error);
      return [];
    }
  }

  async purchaseGiftCard(orderData, config) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const cardCode = this.generateCardCode();
        resolve({
          success: true,
          cardCode,
          expiryDate: new Date(Date.now() + 1095 * 24 * 60 * 60 * 1000),
          instructions: 'Use this gift card code during Agoda booking checkout'
        });
      }, 2500);
    });
  }

  generateCardCode() {
    return `AGD${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  }
}

module.exports = GiftCardProviders;