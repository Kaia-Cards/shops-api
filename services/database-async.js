const Database = require('../database');

class DatabaseAsync extends Database {
  constructor() {
    super();
  }

  promisify(method, ...args) {
    return new Promise((resolve, reject) => {
      method.call(this, ...args, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  async getBrands() {
    return this.promisify(super.getBrands);
  }

  async getBrand(brandId) {
    return this.promisify(super.getBrand, brandId);
  }

  async getGiftCards(brandId) {
    return this.promisify(super.getGiftCards, brandId);
  }

  async getGiftCardsByBrand(brandName) {
    return this.promisify(super.getGiftCardsByBrand, brandName);
  }

  async createOrder(orderData) {
    return this.promisify(super.createOrder, orderData);
  }

  async getOrder(orderId) {
    return this.promisify(super.getOrder, orderId);
  }

  async createLineUser(userData) {
    return this.promisify(super.createLineUser, userData);
  }

  async getLineUser(lineUserId) {
    return this.promisify(super.getLineUser, lineUserId);
  }

  async updateLineUser(lineUserId, updates) {
    return this.promisify(super.updateLineUser, lineUserId, updates);
  }

  async getUserOrdersByLineId(lineUserId) {
    return this.promisify(super.getUserOrdersByLineId, lineUserId);
  }

  async getUserOrders(lineUserId) {
    return this.promisify(super.getUserOrdersByLineId, lineUserId);
  }

  async getHotDeals() {
    return this.promisify(super.getHotDeals);
  }
}

module.exports = DatabaseAsync;