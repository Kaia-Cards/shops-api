const express = require('express');
const AuthMiddleware = require('../middleware/auth');
const router = express.Router();

module.exports = (db, providers) => {
  router.post('/login', async (req, res) => {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const token = await AuthMiddleware.loginAdmin(password);
    if (!token) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ token, role: 'admin' });
  });

  router.get('/dashboard', AuthMiddleware.adminAuth, (req, res) => {
    const queries = [
      'SELECT COUNT(*) as totalOrders FROM orders',
      'SELECT COUNT(*) as pendingOrders FROM orders WHERE status = "pending"',
      'SELECT COUNT(*) as deliveredOrders FROM orders WHERE status = "delivered"',
      'SELECT SUM(price) as totalRevenue FROM orders WHERE status IN ("paid", "delivered")',
      'SELECT COUNT(DISTINCT customer_email) as totalCustomers FROM orders',
      'SELECT SUM(stock_quantity) as totalStock FROM gift_cards WHERE active = 1'
    ];

    let results = {};
    let completed = 0;

    queries.forEach((query, index) => {
      db.db.get(query, (err, row) => {
        if (err) {
          console.error('Dashboard query error:', err);
          return;
        }

        switch (index) {
          case 0: results.totalOrders = row.totalOrders || 0; break;
          case 1: results.pendingOrders = row.pendingOrders || 0; break;
          case 2: results.deliveredOrders = row.deliveredOrders || 0; break;
          case 3: results.totalRevenue = Math.round((row.totalRevenue || 0) * 100) / 100; break;
          case 4: results.totalCustomers = row.totalCustomers || 0; break;
          case 5: results.totalStock = row.totalStock || 0; break;
        }

        completed++;
        if (completed === queries.length) {
          res.json(results);
        }
      });
    });
  });

  router.get('/orders', AuthMiddleware.adminAuth, (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT o.*, b.name as brand_name, b.logo as brand_logo 
      FROM orders o 
      JOIN brands b ON o.brand_id = b.id
    `;
    let params = [];

    if (status) {
      query += ' WHERE o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    db.db.all(query, params, (err, orders) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch orders' });
      }
      res.json(orders);
    });
  });

  router.put('/orders/:orderId/status', AuthMiddleware.adminAuth, (req, res) => {
    const { orderId } = req.params;
    const { status, cardCode } = req.body;

    if (!['pending', 'paid', 'delivered', 'cancelled', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let query = 'UPDATE orders SET status = ?';
    let params = [status, orderId];

    if (status === 'delivered' && cardCode) {
      query += ', card_code = ?, delivered_at = CURRENT_TIMESTAMP';
      params = [status, cardCode, orderId];
    }

    query += ' WHERE id = ?';

    db.db.run(query, params, function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update order' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json({ success: true, orderId, status });
    });
  });

  router.get('/inventory', AuthMiddleware.adminAuth, (req, res) => {
    const query = `
      SELECT gc.*, b.name as brand_name, b.logo as brand_logo
      FROM gift_cards gc
      JOIN brands b ON gc.brand_id = b.id
      WHERE gc.active = 1
      ORDER BY b.name, gc.value
    `;

    db.db.all(query, (err, inventory) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch inventory' });
      }
      res.json(inventory);
    });
  });

  router.put('/inventory/:cardId/stock', AuthMiddleware.adminAuth, (req, res) => {
    const { cardId } = req.params;
    const { quantity, action = 'set' } = req.body;

    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    let query;
    if (action === 'add') {
      query = 'UPDATE gift_cards SET stock_quantity = stock_quantity + ? WHERE id = ?';
    } else if (action === 'subtract') {
      query = 'UPDATE gift_cards SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id = ?';
    } else {
      query = 'UPDATE gift_cards SET stock_quantity = ? WHERE id = ?';
    }

    db.db.run(query, [quantity, cardId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Failed to update stock' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Gift card not found' });
      }

      const logQuery = `
        INSERT INTO inventory_log (id, gift_card_id, action, quantity, reason)
        VALUES (?, ?, ?, ?, ?)
      `;
      const { v4: uuidv4 } = require('uuid');
      
      db.db.run(logQuery, [
        uuidv4(),
        cardId,
        action,
        quantity,
        `Manual ${action} by admin`
      ]);

      res.json({ success: true, cardId, action, quantity });
    });
  });

  router.post('/brands', AuthMiddleware.adminAuth, (req, res) => {
    const { name, logo, category, country, description, minValue, maxValue, discountRate } = req.body;

    if (!name || !category || !country) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { v4: uuidv4 } = require('uuid');
    const brandId = uuidv4();

    const query = `
      INSERT INTO brands (id, name, logo, category, country, description, min_value, max_value, discount_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.db.run(query, [
      brandId, name, logo || '🎁', category, country, description || '',
      minValue || 10, maxValue || 1000, discountRate || 5
    ], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Brand already exists' });
        }
        return res.status(500).json({ error: 'Failed to create brand' });
      }

      res.json({ success: true, brandId, name });
    });
  });

  router.get('/customers', AuthMiddleware.adminAuth, (req, res) => {
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT c.*, COUNT(o.id) as recent_orders
      FROM customers c
      LEFT JOIN orders o ON c.email = o.customer_email AND o.created_at > date('now', '-30 days')
      GROUP BY c.email
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    db.db.all(query, [parseInt(limit), parseInt(offset)], (err, customers) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch customers' });
      }
      res.json(customers);
    });
  });

  router.get('/analytics/sales', AuthMiddleware.adminAuth, (req, res) => {
    const { days = 30 } = req.query;

    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        SUM(price) as revenue,
        AVG(price) as avg_order_value
      FROM orders 
      WHERE status IN ('paid', 'delivered') 
        AND created_at >= date('now', '-${parseInt(days)} days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    db.db.all(query, (err, analytics) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch analytics' });
      }
      res.json(analytics);
    });
  });

  router.get('/analytics/brands', AuthMiddleware.adminAuth, (req, res) => {
    const query = `
      SELECT 
        b.name,
        b.logo,
        COUNT(o.id) as total_orders,
        SUM(o.price) as total_revenue,
        AVG(o.price) as avg_order_value
      FROM brands b
      LEFT JOIN orders o ON b.id = o.brand_id AND o.status IN ('paid', 'delivered')
      GROUP BY b.id, b.name, b.logo
      ORDER BY total_revenue DESC
    `;

    db.db.all(query, (err, brandStats) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch brand analytics' });
      }
      res.json(brandStats);
    });
  });

  return router;
};