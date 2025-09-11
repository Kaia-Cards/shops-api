const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

class Database {
  constructor() {
    this.db = new sqlite3.Database('kaiacards.db');
    this.initTables();
  }

  initTables() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS brands (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          logo TEXT,
          category TEXT,
          country TEXT,
          description TEXT,
          min_value REAL,
          max_value REAL,
          discount_rate REAL,
          api_provider TEXT,
          api_config TEXT,
          active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS gift_cards (
          id TEXT PRIMARY KEY,
          brand_id TEXT,
          value REAL,
          price REAL,
          stock_quantity INTEGER DEFAULT 0,
          provider_sku TEXT,
          tango_utid TEXT,
          active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (brand_id) REFERENCES brands (id)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          brand_id TEXT,
          gift_card_id TEXT,
          customer_email TEXT,
          value REAL,
          price REAL,
          cashback REAL,
          status TEXT DEFAULT 'pending',
          payment_method TEXT DEFAULT 'USDT',
          payment_address TEXT,
          tx_hash TEXT,
          card_code TEXT,
          tango_order_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          paid_at DATETIME,
          delivered_at DATETIME,
          expires_at DATETIME,
          FOREIGN KEY (brand_id) REFERENCES brands (id),
          FOREIGN KEY (gift_card_id) REFERENCES gift_cards (id)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS customers (
          email TEXT PRIMARY KEY,
          total_cashback REAL DEFAULT 0,
          total_spent REAL DEFAULT 0,
          order_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS inventory_log (
          id TEXT PRIMARY KEY,
          gift_card_id TEXT,
          action TEXT,
          quantity INTEGER,
          reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (gift_card_id) REFERENCES gift_cards (id)
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS blockchain_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tx_hash TEXT UNIQUE NOT NULL,
          from_address TEXT,
          to_address TEXT,
          amount REAL,
          block_number INTEGER,
          verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'pending'
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tango_orders (
          id TEXT PRIMARY KEY,
          order_id TEXT,
          tango_reference_id TEXT,
          status TEXT,
          amount REAL,
          currency_code TEXT,
          utid TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (order_id) REFERENCES orders (id)
        )
      `);

      this.seedData();
    });
  }

  seedData() {
    const brands = [
      {
        id: uuidv4(),
        name: 'Amazon Japan',
        logo: '🛍️',
        category: 'Shopping',
        country: 'Japan',
        description: 'Japan\'s premier online marketplace for everything',
        min_value: 10,
        max_value: 1000,
        discount_rate: 3,
        api_provider: 'tango_card'
      },
      {
        id: uuidv4(),
        name: 'Steam',
        logo: '🎮',
        category: 'Gaming',
        country: 'Global',
        description: 'Digital distribution platform for PC gaming',
        min_value: 5,
        max_value: 500,
        discount_rate: 5,
        api_provider: 'tango_card'
      },
      {
        id: uuidv4(),
        name: 'Netflix',
        logo: '📺',
        category: 'Entertainment',
        country: 'Global',
        description: 'Streaming entertainment service',
        min_value: 15,
        max_value: 200,
        discount_rate: 2,
        api_provider: 'tango_card'
      },
      {
        id: uuidv4(),
        name: 'PlayStation Store',
        logo: '🎮',
        category: 'Gaming',
        country: 'Japan',
        description: 'Digital entertainment for PlayStation consoles',
        min_value: 10,
        max_value: 500,
        discount_rate: 4,
        api_provider: 'tango_card'
      },
      {
        id: uuidv4(),
        name: 'iTunes Japan',
        logo: '🎵',
        category: 'Entertainment',
        country: 'Japan',
        description: 'Digital media and entertainment platform',
        min_value: 5,
        max_value: 300,
        discount_rate: 3,
        api_provider: 'tango_card'
      },
      {
        id: uuidv4(),
        name: 'Google Play Japan',
        logo: '📱',
        category: 'Entertainment',
        country: 'Japan',
        description: 'Apps, games, and digital content',
        min_value: 5,
        max_value: 500,
        discount_rate: 4,
        api_provider: 'tango_card'
      },
      {
        id: uuidv4(),
        name: 'Uber',
        logo: '🚗',
        category: 'Transportation',
        country: 'Global',
        description: 'Ride-sharing and food delivery service',
        min_value: 10,
        max_value: 200,
        discount_rate: 6,
        api_provider: 'tango_card'
      },
      {
        id: uuidv4(),
        name: 'Airbnb',
        logo: '🏠',
        category: 'Travel',
        country: 'Global',
        description: 'Travel accommodations and experiences',
        min_value: 25,
        max_value: 1000,
        discount_rate: 5,
        api_provider: 'tango_card'
      }
    ];

    this.db.get("SELECT COUNT(*) as count FROM brands", (err, row) => {
      if (err) {
        console.error('Error checking brands:', err);
        return;
      }
      
      if (row.count === 0) {
        const stmt = this.db.prepare(`
          INSERT INTO brands (id, name, logo, category, country, description, min_value, max_value, discount_rate, api_provider)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        brands.forEach(brand => {
          stmt.run([
            brand.id, brand.name, brand.logo, brand.category,
            brand.country, brand.description, brand.min_value,
            brand.max_value, brand.discount_rate, brand.api_provider
          ]);
        });

        stmt.finalize();
        console.log('Seeded brands data with Tango Card integration');
        this.seedGiftCards(brands);
      }
    });
  }

  seedGiftCards(brands) {
    const denominations = [10, 25, 50, 100, 250, 500];
    
    brands.forEach(brand => {
      denominations.forEach(value => {
        if (value >= brand.min_value && value <= brand.max_value) {
          const price = value * (1 - brand.discount_rate / 100);
          const giftCardId = uuidv4();
          
          this.db.run(`
            INSERT INTO gift_cards (id, brand_id, value, price, stock_quantity, provider_sku, tango_utid)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            giftCardId, 
            brand.id, 
            value, 
            price, 
            50,
            `${brand.name.toUpperCase().replace(/\s+/g, '_')}_${value}`,
            `TANGO_${brand.name.replace(/\s+/g, '_').toUpperCase()}_${value}`
          ]);
        }
      });
    });
    console.log('Seeded gift cards data with Tango UTID mapping');
  }

  getBrands(callback) {
    this.db.all(`
      SELECT b.*, COUNT(gc.id) as card_count
      FROM brands b
      LEFT JOIN gift_cards gc ON b.id = gc.brand_id AND gc.active = 1
      WHERE b.active = 1
      GROUP BY b.id
      ORDER BY b.name
    `, callback);
  }

  getGiftCardsByBrand(brandName, callback) {
    this.db.all(`
      SELECT gc.*, b.name as brand_name, b.discount_rate
      FROM gift_cards gc
      JOIN brands b ON gc.brand_id = b.id
      WHERE b.name = ? AND gc.active = 1 AND gc.stock_quantity > 0
      ORDER BY gc.value ASC
    `, [brandName], callback);
  }

  createOrder(orderData, callback) {
    const orderId = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    this.db.run(`
      INSERT INTO orders (id, brand_id, gift_card_id, customer_email, value, price, cashback, payment_address, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orderId,
      orderData.brand_id,
      orderData.gift_card_id,
      orderData.customer_email,
      orderData.value,
      orderData.price,
      orderData.cashback,
      orderData.payment_address,
      expiresAt
    ], function(err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, { orderId, expiresAt });
      }
    });
  }

  getOrder(orderId, callback) {
    this.db.get(`
      SELECT o.*, b.name as brand_name, b.logo as brand_logo, b.api_provider, gc.tango_utid
      FROM orders o
      JOIN brands b ON o.brand_id = b.id
      LEFT JOIN gift_cards gc ON o.gift_card_id = gc.id
      WHERE o.id = ?
    `, [orderId], callback);
  }

  updateOrderPayment(orderId, txHash, callback) {
    this.db.run(`
      UPDATE orders 
      SET status = 'paid', tx_hash = ?, paid_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `, [txHash, orderId], callback);
  }

  deliverOrder(orderId, cardCode, tangoOrderId = null, callback) {
    let query = `
      UPDATE orders 
      SET status = 'delivered', card_code = ?, delivered_at = CURRENT_TIMESTAMP
    `;
    let params = [cardCode];

    if (tangoOrderId) {
      query += `, tango_order_id = ?`;
      params.push(tangoOrderId);
    }

    query += ` WHERE id = ? AND status = 'paid'`;
    params.push(orderId);

    this.db.run(query, params, function(err) {
      if (err) {
        callback(err);
        return;
      }
      callback(null);
    });
  }

  getUserOrders(email, callback) {
    this.db.all(`
      SELECT o.*, b.name as brand_name, b.logo as brand_logo
      FROM orders o
      JOIN brands b ON o.brand_id = b.id
      WHERE o.customer_email = ?
      ORDER BY o.created_at DESC
    `, [email], callback);
  }

  updateCustomerStats(email, spent, cashback, callback) {
    this.db.run(`
      INSERT INTO customers (email, total_spent, total_cashback, order_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(email) DO UPDATE SET
        total_spent = total_spent + ?,
        total_cashback = total_cashback + ?,
        order_count = order_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `, [email, spent, cashback, spent, cashback], callback);
  }

  getCustomerStats(email, callback) {
    this.db.get(`
      SELECT * FROM customers WHERE email = ?
    `, [email], callback);
  }

  saveTangoOrder(orderData, callback) {
    const { orderId, tangoReferenceId, status, amount, currencyCode, utid } = orderData;
    
    this.db.run(`
      INSERT INTO tango_orders (id, order_id, tango_reference_id, status, amount, currency_code, utid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      uuidv4(),
      orderId,
      tangoReferenceId,
      status,
      amount,
      currencyCode,
      utid
    ], callback);
  }

  updateTangoOrderStatus(tangoReferenceId, status, callback) {
    this.db.run(`
      UPDATE tango_orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tango_reference_id = ?
    `, [status, tangoReferenceId], callback);
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;