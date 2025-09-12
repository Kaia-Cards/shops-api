const crypto = require('crypto');

class TestnetCardGenerator {
  constructor() {
    this.brands = {
      'Shopee': {
        prefix: 'SHP',
        pattern: 'XXXX-XXXX-XXXX-XXXX',
        pinPattern: 'XXXX',
        instructions: 'Visit shopee.sg, go to ShopeePay, enter this code to add credit to your account.',
        website: 'https://shopee.sg/buyer/account/payment'
      },
      'Grab': {
        prefix: 'GRB',
        pattern: 'XXXXXXXXXX',
        pinPattern: '',
        instructions: 'Open Grab app, go to GrabPay, tap Add Credit, enter this promo code.',
        website: 'https://www.grab.com/sg/'
      },
      'Lazada': {
        prefix: 'LZD',
        pattern: 'XXXX-XXXX-XXXX',
        pinPattern: 'XXXXXX',
        instructions: 'Login to Lazada account, go to My Account > Lazada Wallet, enter code and PIN.',
        website: 'https://www.lazada.sg/'
      },
      'Tokopedia': {
        prefix: 'TKP',
        pattern: 'XXXXXXXXXXXXXXXXX',
        pinPattern: 'XXXX',
        instructions: 'Buka aplikasi Tokopedia, masuk ke OVO, ketuk Isi Saldo, masukkan kode voucher ini.',
        website: 'https://www.tokopedia.com/'
      },
      'Gojek': {
        prefix: 'GJK',
        pattern: 'XXXXXXXXXXXX',
        pinPattern: '',
        instructions: 'Buka aplikasi Gojek, pilih GoPay, ketuk Isi Saldo, masukkan kode promo.',
        website: 'https://www.gojek.com/'
      },
      'FoodPanda': {
        prefix: 'FPD',
        pattern: 'XXXXXXXXXXXXXXXX',
        pinPattern: '',
        instructions: 'Open foodpanda app, go to Profile > Vouchers, enter this code for credit.',
        website: 'https://www.foodpanda.com/'
      },
      'AirAsia': {
        prefix: 'AAX',
        pattern: 'XXXXXX',
        pinPattern: 'XXXX',
        instructions: 'Visit airasia.com, login to account, go to My Bookings, use code for flight credits.',
        website: 'https://www.airasia.com/'
      },
      'Traveloka': {
        prefix: 'TVL',
        pattern: 'XXXX-XXXX-XXXX',
        pinPattern: 'XXXXXXXX',
        instructions: 'Login ke Traveloka, masuk ke TravelokaPay, pilih Top Up, masukkan kode voucher.',
        website: 'https://www.traveloka.com/'
      },
      'Zalora': {
        prefix: 'ZLR',
        pattern: 'XXXXXXXXXXXX',
        pinPattern: 'XXXX',
        instructions: 'Visit zalora.sg, add items to cart, enter promo code at checkout.',
        website: 'https://www.zalora.sg/'
      },
      'Qoo10': {
        prefix: 'Q10',
        pattern: 'XXXXXXXXXXXXXXX',
        pinPattern: '',
        instructions: 'Login to Qoo10 account, go to My Page > Q-money, enter code to add credits.',
        website: 'https://www.qoo10.sg/'
      },
      'LINE Store': {
        prefix: 'LIN',
        pattern: 'XXXX-XXXX-XXXX-XXXX',
        pinPattern: '',
        instructions: 'Open LINE app, go to Wallet > LINE Points, tap Add Points, enter this code.',
        website: 'https://store.line.me/'
      },
      'Steam SEA': {
        prefix: 'STM',
        pattern: 'XXXXX-XXXXX-XXXXX',
        pinPattern: '',
        instructions: 'Open Steam client, go to Games menu > Activate a Product on Steam, enter code.',
        website: 'https://store.steampowered.com/'
      },
      'GCash': {
        prefix: 'GCH',
        pattern: 'XXXXXXXXXXXX',
        pinPattern: 'XXXXXX',
        instructions: 'Open GCash app, tap Cash In > Others > Voucher, enter code and PIN.',
        website: 'https://www.gcash.com/'
      },
      'TrueMoney': {
        prefix: 'TMW',
        pattern: 'XXXXXXXXXXXXXXXX',
        pinPattern: 'XXXX',
        instructions: 'เปิดแอป TrueMoney กด เติมเงิน กด บัตรเติมเงิน ใส่รหัส',
        website: 'https://www.truemoney.com/'
      },
      'ShopeePay': {
        prefix: 'SPY',
        pattern: 'XXXXXXXXXXXX',
        pinPattern: '',
        instructions: 'Open Shopee app, go to ShopeePay, tap Top Up, enter voucher code.',
        website: 'https://shopee.sg/'
      }
    };
  }

  generateCode(pattern) {
    return pattern.replace(/X/g, () => {
      return Math.floor(Math.random() * 16).toString(16).toUpperCase();
    });
  }

  generateNumericCode(length) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += Math.floor(Math.random() * 10);
    }
    return code;
  }

  generateRealisticCard(brandName, value) {
    const brand = this.brands[brandName];
    if (!brand) {
      return this.generateGenericCard(brandName, value);
    }

    const cardCode = `${brand.prefix}${this.generateCode(brand.pattern)}`;
    const pinCode = brand.pinPattern ? this.generateCode(brand.pinPattern) : '';
    const serialNumber = this.generateNumericCode(12);
    const batchNumber = this.generateNumericCode(6);
    const expiryDate = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000));
    
    const activationUrl = `https://kaiacards.com/activate/${cardCode}`;
    
    const cardData = {
      cardCode: cardCode,
      pinCode: pinCode,
      value: value,
      currency: 'USD',
      brand: brandName,
      serialNumber: serialNumber,
      batchNumber: batchNumber,
      issuedAt: new Date().toISOString(),
      expiresAt: expiryDate.toISOString(),
      status: 'active',
      redemptionInstructions: brand.instructions,
      websiteUrl: brand.website,
      activationUrl: activationUrl,
      termsUrl: `https://kaiacards.com/terms/${brandName.toLowerCase()}`,
      supportContact: 'support@kaiacards.com',
      metadata: {
        testnet: true,
        generatedBy: 'KaiaCards Testnet',
        region: this.getBrandRegion(brandName),
        category: this.getBrandCategory(brandName)
      }
    };

    return cardData;
  }

  generateGenericCard(brandName, value) {
    const cardCode = `GEN${this.generateCode('XXXX-XXXX-XXXX')}`;
    const pinCode = this.generateNumericCode(4);
    
    return {
      cardCode: cardCode,
      pinCode: pinCode,
      value: value,
      currency: 'USD',
      brand: brandName,
      serialNumber: this.generateNumericCode(12),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)).toISOString(),
      status: 'active',
      redemptionInstructions: `Use this code to redeem ${value} USD credit for ${brandName}.`,
      websiteUrl: 'https://kaiacards.com',
      activationUrl: `https://kaiacards.com/activate/${cardCode}`,
      metadata: {
        testnet: true,
        generatedBy: 'KaiaCards Testnet'
      }
    };
  }

  getBrandRegion(brandName) {
    const regions = {
      'Shopee': 'Singapore',
      'Lazada': 'Singapore', 
      'Grab': 'Singapore',
      'Tokopedia': 'Indonesia',
      'Gojek': 'Indonesia',
      'TrueMoney': 'Thailand',
      'GCash': 'Philippines',
      'FoodPanda': 'Multi-region',
      'AirAsia': 'Malaysia',
      'Traveloka': 'Indonesia'
    };
    return regions[brandName] || 'Southeast Asia';
  }

  getBrandCategory(brandName) {
    const categories = {
      'Shopee': 'E-commerce',
      'Lazada': 'E-commerce',
      'Tokopedia': 'E-commerce',
      'Qoo10': 'E-commerce',
      'Grab': 'Transport',
      'Gojek': 'Transport',
      'FoodPanda': 'Food Delivery',
      'AirAsia': 'Travel',
      'Traveloka': 'Travel',
      'Steam SEA': 'Gaming',
      'LINE Store': 'Digital Content',
      'GCash': 'Digital Wallet',
      'TrueMoney': 'Digital Wallet',
      'ShopeePay': 'Digital Wallet',
      'Zalora': 'Fashion'
    };
    return categories[brandName] || 'General';
  }

  generateTestnetReceipt(order, cardData) {
    const receiptId = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      receiptId: receiptId,
      orderId: order.order_id,
      purchaseDate: new Date().toISOString(),
      customerEmail: order.delivery_email || 'testnet@kaiacards.com',
      brandName: cardData.brand,
      cardValue: cardData.value,
      paidAmount: order.final_amount,
      currency: 'USDT',
      paymentMethod: 'Kaia Blockchain',
      transactionHash: order.tx_hash,
      cardDetails: {
        code: cardData.cardCode,
        pin: cardData.pinCode,
        expiryDate: cardData.expiresAt,
        redemptionUrl: cardData.websiteUrl
      },
      instructions: cardData.redemptionInstructions,
      support: {
        email: 'support@kaiacards.com',
        website: 'https://kaiacards.com/support'
      },
      disclaimer: 'This is a testnet transaction. Card codes are for demonstration purposes only.',
      testnetNotice: 'TESTNET ONLY - Not redeemable for real value'
    };
  }

  async processTestnetOrder(order) {
    try {
      const cardData = this.generateRealisticCard(order.brand_name, order.card_value);
      const receipt = this.generateTestnetReceipt(order, cardData);
      
      console.log(`Generated testnet ${order.brand_name} card: ${cardData.cardCode.substring(0, 8)}****`);
      
      return {
        success: true,
        cardCode: cardData.cardCode,
        pin: cardData.pinCode,
        redemptionUrl: cardData.websiteUrl,
        instructions: cardData.redemptionInstructions,
        receipt: receipt,
        metadata: cardData.metadata
      };
    } catch (error) {
      console.error('Testnet card generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getSupportedBrands() {
    return Object.keys(this.brands);
  }
}

module.exports = TestnetCardGenerator;