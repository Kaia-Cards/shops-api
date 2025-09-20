# KaiaCards Shops API 

## TL, dr 

The KaiaCards Shops API is a Node.js backend for the digital gift card marketplace. What it has: REST API endpoints, kaia integration, payment and workflows for gift card transactions with Asian brands.

## Repository Structure

```
shops-api/
├── config/
│   ├── blockchain.js              # Kaia network configuration and utilities
│   └── environment.js             # Environment-specific configurations
├── middleware/
│   ├── auth.js                    # JWT authentication middleware
│   ├── validation.js              # Request validation middleware
│   └── error-handler.js           # Global error handling
├── routes/
│   ├── public.js                  # Public API endpoints (brands, orders)
│   ├── admin.js                   # Administrative operations
│   ├── blockchain.js              # Blockchain transaction handling
│   ├── line.js                    # LINE LIFF integration endpoints
│   ├── line-bot.js                # LINE Bot webhook handlers
│   ├── line-pay.js                # LINE Pay payment processing
│   └── payment-webhook.js         # Payment gateway webhooks
├── services/
│   ├── fulfillment.js             # Automated gift card fulfillment
│   ├── payment-monitor.js         # Blockchain payment monitoring
│   ├── line-integration.js        # LINE messaging and rich menu setup
│   ├── line-pay.js                # LINE Pay integration service
│   ├── tangoCard.js               # Tango Card API integration
│   ├── testnet-card-generator.js  # Development card generation
│   └── providers/
│       ├── rakuten.js             # Rakuten gift card provider
│       ├── shopee.js              # Shopee integration
│       └── klook.js               # Klook travel cards
├── database.js                    # SQLite database operations
├── database-schema.sql            # Database schema definition
├── giftCardProviders.js           # Provider management system
├── migrate.js                     # Database migration utility
├── server.js                      # Express server entry point
├── KaiaGiftCardMarketPlace.sol    # Smart contract source
├── kaiacards.db                   # SQLite database file
├── package.json                   # Dependencies and scripts
├── Dockerfile                     # Container deployment config
└── vercel.json                    # Serverless deployment config
```

## Core API Endpoints

### Public Endpoints

**Brand Management**
```
GET    /api/brands                 # Fetch all available brands
GET    /api/brands/:id             # Get specific brand details
GET    /api/brands/category/:cat   # Filter brands by category
POST   /api/brands/search          # Advanced brand search
```

**Order Processing**
```
POST   /api/order                  # Create new gift card order
GET    /api/order/:id              # Get order details and status
POST   /api/order/:id/pay          # Confirm payment with transaction hash
GET    /api/user/:email/orders     # Fetch user order history
POST   /api/order/:id/confirm      # Confirm gift card receipt
```

**Gift Card Operations**
```
GET    /api/cards/:brandId         # Available cards for specific brand
GET    /api/cards/check/:sku       # Check card availability
POST   /api/cards/reserve          # Reserve cards for purchase
```

### Blockchain Integration Endpoints

**Transaction Monitoring**
```
POST   /api/blockchain/monitor     # Start payment monitoring
GET    /api/blockchain/tx/:hash    # Get transaction status
POST   /api/blockchain/confirm     # Manual transaction confirmation
GET    /api/blockchain/orders      # Orders pending blockchain confirmation
```

**Smart Contract Interaction**
```
POST   /api/blockchain/purchase    # Direct contract purchase call
GET    /api/blockchain/events      # Contract event monitoring
POST   /api/blockchain/refund      # Process refund transactions
```

### LINE Integration Endpoints

**Authentication and User Management**
```
POST   /api/line/auth              # LINE user authentication
GET    /api/line/profile/:userId   # Get LINE user profile
POST   /api/line/link              # Link LINE account to wallet
POST   /api/line/unlink            # Unlink LINE account
```

**Messaging and Notifications**
```
POST   /api/line/message           # Send custom LINE message
POST   /api/line/broadcast         # Broadcast to all users
POST   /api/line/rich-menu         # Setup rich menu
GET    /api/line/analytics         # LINE usage analytics
```

**LINE Pay Integration**
```
POST   /api/line-pay/request       # Initiate LINE Pay transaction
GET    /api/line-pay/confirm/:id   # Confirm LINE Pay payment
POST   /api/line-pay/refund        # Process LINE Pay refund
GET    /api/line-pay/status/:id    # Check payment status
```

### Administrative Endpoints

**Brand and Inventory Management**
```
POST   /api/admin/brands           # Add new brand partner
PUT    /api/admin/brands/:id       # Update brand information
DELETE /api/admin/brands/:id       # Deactivate brand
POST   /api/admin/inventory        # Update card inventory
GET    /api/admin/analytics        # Business analytics dashboard
```

**Order Management**
```
GET    /api/admin/orders           # All orders with filters
PUT    /api/admin/orders/:id       # Update order status
POST   /api/admin/fulfill          # Manual order fulfillment
GET    /api/admin/pending          # Orders requiring attention
```

## Database Architecture

### Core Tables

**Users Table**
```sql
users (
    id, wallet_address, email, line_user_id,
    display_name, total_spent, total_orders,
    loyalty_points, referral_code, referred_by
)
```

**Brands Table**
```sql
brands (
    id, name, logo, category, country, description,
    discount_rate, min_value, max_value, supplier_id,
    api_endpoint, inventory_count, sales_volume
)
```

**Orders Table**
```sql
orders (
    id, order_id, user_id, wallet_address, brand_id,
    card_value, usdt_amount, status, payment_address,
    tx_hash, card_codes, fulfillment_data
)
```

**Gift Cards Table**
```sql
gift_cards (
    id, brand_id, value, currency, sku,
    stock_quantity, cost_price, selling_price
)
```

### Relationship Architecture

**Data Flow Relationships**
- Users → Orders (one-to-many)
- Brands → Gift Cards (one-to-many)
- Gift Cards → Orders (many-to-many through order items)
- Orders → Payment Monitoring (one-to-one)
- Users → LINE Integration (one-to-one optional)

## Service Layer Architecture

### Payment Monitoring Service

**Blockchain Transaction Monitoring**
```javascript
class PaymentMonitor {
  async monitorPayment(orderId, paymentAddress, expectedAmount) {
    // Real-time blockchain monitoring
    // Transaction confirmation tracking
    // Automatic order status updates
    // Error handling and retry logic
  }

  async confirmPayment(txHash, orderId) {
    // Transaction validation
    // Amount verification
    // Order fulfillment trigger
    // User notification dispatch
  }
}
```

### Fulfillment Service

**Automated Card Delivery**
```javascript
class FulfillmentService {
  async processOrder(orderId) {
    // Provider API integration
    // Card code generation/retrieval
    // Delivery coordination
    // Quality assurance checks
  }

  async deliverCards(orderId, cardCodes) {
    // Email delivery system
    // LINE message integration
    // SMS fallback options
    // Delivery confirmation tracking
  }
}
```

**Provider Integration**
- Tango Card API for global brands
- Direct brand API integrations
- Testnet card generation for development

### LINE Integration Service

**Comprehensive LINE Ecosystem Integration**
```javascript
class LineIntegrationService {
  async sendPurchaseConfirmation(userId, orderData) {
    // Rich flex message generation
    // Purchase details formatting
    // Action button integration
    // Delivery status tracking
  }

  async setupRichMenu(userId) {
    // Dynamic menu generation
    // User-specific customization
    // Navigation optimization
    // Analytics integration
  }
}
```

## Gift Card Provider Management

### Provider Architecture

**Multi-Provider Support System**
```javascript
const providers = {
  tango: {
    name: 'Tango Card',
    regions: ['global'],
    brands: ['Amazon', 'Starbucks', 'Nike'],
    apiEndpoint: 'https://api.tangocard.com',
    authentication: 'api-key'
  },
  rakuten: {
    name: 'Rakuten',
    regions: ['JP', 'SG', 'MY'],
    brands: ['Rakuten'],
    apiEndpoint: 'https://api.rakuten.co.jp',
    authentication: 'oauth2'
  }
};
```

**Brand Configuration**
```javascript
const brandConfig = {
  rakuten: {
    category: 'E-commerce',
    country: 'JP',
    discountRate: 0.05,
    minValue: 500,
    maxValue: 50000,
    currency: 'JPY',
    fulfillmentMethod: 'api',
    deliveryTime: 'instant'
  }
};
```

## Blockchain Integration

### Kaia Network Integration

**Smart Contract Architecture**
```solidity
contract KaiaGiftCardMarketPlace {
    function purchaseGiftCard(
        uint256 shopId,
        uint256 amount,
        string memory email
    ) external payable;

    function confirmDelivery(string memory orderId) external;
    function refundOrder(string memory orderId) external;
}
```


### Payment Processing

**USDT Transaction Handling**
```javascript
class BlockchainService {
  async generatePaymentAddress(orderId) {
    // Deterministic address generation
    // Order-specific payment tracking
    // Security validation
  }

  async monitorTransaction(address, expectedAmount) {
    // Real-time balance monitoring
    // Transaction confirmation tracking
    // Amount verification
  }
}
```


## Development and Deployment

### Environment Configuration

**Development Setup**
```bash
# Install dependencies
npm install

# Environment setup
cp .env.example .env

# Database initialization
npm run migrate

# Development server
npm run dev
```

**Environment Variables**
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=./kaiacards.db
KAIA_RPC_URL=https://api.baobab.klaytn.net:8651
USDT_CONTRACT_ADDRESS=0x...
GIFT_CARD_CONTRACT_ADDRESS=0x...
TANGO_API_KEY=your_tango_api_key
LINE_CHANNEL_ACCESS_TOKEN=your_line_token
LINE_CHANNEL_SECRET=your_line_secret
JWT_SECRET=your_jwt_secret
```

### Deployment Options

**Containerized Deployment**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

**Serverless Deployment (Vercel)**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server.js"
    }
  ]
}
```

### Database Migration

**Migration System**
```javascript
// migrate.js
const migrations = [
  {
    version: 1,
    description: 'Initial schema creation',
    sql: fs.readFileSync('./database-schema.sql', 'utf8')
  },
  {
    version: 2,
    description: 'Add LINE integration tables',
    sql: 'ALTER TABLE users ADD COLUMN line_user_id TEXT;'
  }
];
```

### Caching Strategy

**Memory Caching**
- Brand data cached for 5 minutes
- Exchange rates cached for 1 minute
- User sessions cached for duration
- API response caching with TTL

**Database Optimization**
- Indexed columns for frequent queries
- Connection pooling for concurrent requests
- Query optimization for order lookups
- Automated cleanup for expired orders

### Error Handling and Logging

**Comprehensive Error Management**
```javascript
class ErrorHandler {
  static handleBlockchainError(error, orderId) {
    logger.error('Blockchain error', { error, orderId });
    // Automatic retry mechanisms
    // User notification
    // Admin alert system
  }

  static handleProviderError(provider, error, orderId) {
    // Provider fallback logic
    // Error categorization
    // Escalation procedures
  }
}
```

### Rate Limiting and Security

**API Protection**
- General rate limit: 100 requests per 15 minutes
- Strict rate limit: 5 requests per minute for sensitive endpoints
- IP throttling
- JWT token validation
- CORS configuration for origins

**Security Headers**
- Helmet.js for security headers
- HTTPS enforcement
- SQL injection prevention
- XSS protection
- CSRF token validation
