const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const Database = require('./database');
const GiftCardProviders = require('./giftCardProviders');
const FulfillmentService = require('./services/fulfillment');
const PaymentMonitor = require('./services/payment-monitor');
const BlockchainService = require('./config/blockchain');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const blockchainRoutes = require('./routes/blockchain');
const lineRoutes = require('./routes/line');

const app = express();
const PORT = process.env.PORT || 3001;

const getAllowedOrigins = () => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',');
  }
  
  return process.env.NODE_ENV === 'production' 
    ? ['https://kaiacards.com', 'https://www.kaiacards.com']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
};

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  optionsSuccessStatus: 200
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many requests, please wait a minute before trying again.',
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(limiter);

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const db = new Database();
const providers = new GiftCardProviders();
const blockchainService = new BlockchainService();
const fulfillmentService = new FulfillmentService(db);
const paymentMonitor = new PaymentMonitor(db, blockchainService);

app.use('/api', publicRoutes(db, providers, fulfillmentService));
app.use('/api/admin', adminRoutes(db, providers));
app.use('/api/blockchain', blockchainRoutes(db, blockchainService));
app.use('/api/line', lineRoutes);

app.post('/api/order', strictLimiter);
app.post('/api/order/:orderId/pay', strictLimiter);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    timestamp: new Date().toISOString() 
  });
});

app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/brands',
      'GET /api/brands/:brandName',
      'POST /api/order',
      'GET /api/order/:orderId',
      'POST /api/order/:orderId/pay',
      'GET /api/user/:email/orders',
      'GET /api/stats',
      'GET /api/blockchain/config',
      'GET /api/blockchain/usdt/balance/:address',
      'POST /api/blockchain/verify-payment',
      'GET /api/blockchain/transaction/:txHash',
      'POST /api/blockchain/generate-address',
      'GET /api/blockchain/gas-price',
      'GET /api/blockchain/block/latest'
    ]
  });
});

paymentMonitor.on('payment_confirmed', async (paymentData) => {
  console.log(`Payment confirmed for order: ${paymentData.orderId}`);
  try {
    await fulfillmentService.fulfillOrder(paymentData.orderId);
    console.log(`Order ${paymentData.orderId} fulfilled successfully`);
  } catch (error) {
    console.error(`Order fulfillment failed for ${paymentData.orderId}:`, error);
  }
});

if (process.env.NODE_ENV !== 'test') {
  paymentMonitor.startMonitoring();
}

cron.schedule('*/5 * * * *', () => {
  console.log(`[${new Date().toISOString()}] Running maintenance tasks...`);
  
  db.db.run(`
    UPDATE orders 
    SET status = 'expired' 
    WHERE status = 'pending' AND expires_at < datetime('now')
  `, function(err) {
    if (err) {
      console.error('Maintenance error:', err);
    } else if (this.changes > 0) {
      console.log(`Expired ${this.changes} orders`);
      
      db.db.run(`
        UPDATE gift_cards 
        SET stock_quantity = stock_quantity + 1 
        WHERE id IN (
          SELECT gift_card_id FROM orders 
          WHERE status = 'expired' AND updated_at > datetime('now', '-10 minutes')
        )
      `);
    }
  });

  db.db.run(`
    DELETE FROM inventory_log 
    WHERE created_at < datetime('now', '-90 days')
  `, (err) => {
    if (err) {
      console.error('Log cleanup error:', err);
    }
  });
});

cron.schedule('0 2 * * *', () => {
  console.log(`[${new Date().toISOString()}] Running daily analytics update...`);
  
  const queries = [
    `UPDATE customers SET updated_at = CURRENT_TIMESTAMP WHERE updated_at < date('now', '-1 day')`,
    `DELETE FROM orders WHERE status = 'expired' AND created_at < datetime('now', '-30 days')`
  ];
  
  queries.forEach(query => {
    db.db.run(query, (err) => {
      if (err) {
        console.error('Daily maintenance error:', err);
      }
    });
  });
});

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Gracefully shutting down server...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Server terminated');
  db.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  db.close();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`KaiaCards API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Marketplace: http://localhost:${PORT}/api/brands`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Started at: ${new Date().toISOString()}`);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

module.exports = app;