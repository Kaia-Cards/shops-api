CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    line_user_id TEXT UNIQUE,
    display_name TEXT,
    total_spent REAL DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    loyalty_points INTEGER DEFAULT 0,
    referral_code TEXT UNIQUE,
    referred_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    logo TEXT,
    category TEXT NOT NULL,
    country TEXT NOT NULL,
    description TEXT,
    discount_rate REAL NOT NULL,
    min_value REAL NOT NULL,
    max_value REAL NOT NULL,
    supplier_id INTEGER,
    supplier_api_key TEXT,
    api_endpoint TEXT,
    is_active BOOLEAN DEFAULT 1,
    inventory_count INTEGER DEFAULT 0,
    sales_volume REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gift_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL,
    value REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    sku TEXT UNIQUE,
    stock_quantity INTEGER DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    sold_quantity INTEGER DEFAULT 0,
    cost_price REAL NOT NULL,
    selling_price REAL NOT NULL,
    is_available BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT UNIQUE NOT NULL,
    user_id INTEGER,
    wallet_address TEXT NOT NULL,
    brand_id INTEGER NOT NULL,
    gift_card_id INTEGER NOT NULL,
    card_value REAL NOT NULL,
    quantity INTEGER DEFAULT 1,
    usdt_amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0,
    platform_fee REAL DEFAULT 0,
    final_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_address TEXT,
    tx_hash TEXT,
    block_number INTEGER,
    payment_confirmed_at DATETIME,
    expires_at DATETIME,
    delivery_email TEXT,
    delivery_phone TEXT,
    card_codes TEXT,
    pin_codes TEXT,
    redemption_url TEXT,
    fulfillment_data TEXT,
    fulfillment_hash TEXT,
    error_message TEXT,
    refund_tx_hash TEXT,
    refunded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id)
);

CREATE TABLE IF NOT EXISTS payment_monitoring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    payment_address TEXT NOT NULL,
    expected_amount REAL NOT NULL,
    received_amount REAL DEFAULT 0,
    tx_hash TEXT,
    confirmations INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting',
    checked_at DATETIME,
    confirmed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE TABLE IF NOT EXISTS card_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL,
    gift_card_id INTEGER NOT NULL,
    card_code TEXT UNIQUE NOT NULL,
    pin_code TEXT,
    value REAL NOT NULL,
    expiry_date DATETIME,
    status TEXT DEFAULT 'available',
    reserved_by_order TEXT,
    sold_to_order TEXT,
    acquired_from TEXT,
    acquisition_cost REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    wallet_address TEXT UNIQUE NOT NULL,
    api_provider TEXT,
    api_key TEXT,
    api_secret TEXT,
    webhook_url TEXT,
    commission_rate REAL DEFAULT 0,
    total_sales REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    order_id TEXT,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount REAL NOT NULL,
    token TEXT DEFAULT 'USDT',
    tx_hash TEXT UNIQUE NOT NULL,
    block_number INTEGER NOT NULL,
    gas_used REAL,
    status TEXT NOT NULL,
    network TEXT DEFAULT 'kaia',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE TABLE IF NOT EXISTS api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    request_body TEXT,
    response_body TEXT,
    status_code INTEGER,
    ip_address TEXT,
    user_agent TEXT,
    duration_ms INTEGER,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS price_feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER NOT NULL,
    gift_card_id INTEGER NOT NULL,
    supplier_price REAL NOT NULL,
    market_price REAL NOT NULL,
    our_price REAL NOT NULL,
    discount_percentage REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id)
);

CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id INTEGER NOT NULL,
    referred_id INTEGER NOT NULL,
    referral_code TEXT NOT NULL,
    reward_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES users(id),
    FOREIGN KEY (referred_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_id TEXT,
    points INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_wallet ON orders(wallet_address);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_monitoring_status ON payment_monitoring(status);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_card_inventory_status ON card_inventory(status);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(is_active);