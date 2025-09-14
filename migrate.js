const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('kaiacards.db');

async function migrate() {
  return new Promise((resolve, reject) => {
    const schemaPath = path.join(__dirname, 'database-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    db.exec(schema, (err) => {
      if (err) {
        console.error('Migration failed:', err);
        reject(err);
      } else {
        console.log('Database migration completed successfully');
        seedInitialData();
        resolve();
      }
    });
  });
}

function seedInitialData() {
  const seaBrands = [
    { name: 'Shopee', category: 'E-commerce', country: 'Singapore', discount: 8, min: 10, max: 1000, logo: 'https://cf.shopee.sg/file/e4a02dfe2ef64e088b0e8b3c5c5c97e0' },
    { name: 'Lazada', category: 'E-commerce', country: 'Singapore', discount: 7, min: 10, max: 1000, logo: 'https://lzd-img-global.slatic.net/g/tps/imgextra/i3/O1CN01Tnm1Bu1tTk6Qh0Yy7_!!6000000005904-2-tps-400-400.png' },
    { name: 'Grab', category: 'Transport', country: 'Singapore', discount: 5, min: 5, max: 500, logo: 'https://assets.grab.com/wp-content/uploads/sites/4/2020/09/17175645/Grab_Logo_2021.jpg' },
    { name: 'Gojek', category: 'Transport', country: 'Indonesia', discount: 6, min: 5, max: 500, logo: 'https://lelogama.go-jek.com/prime/upload/image/General_Logo_-_Green.png' },
    { name: 'Tokopedia', category: 'E-commerce', country: 'Indonesia', discount: 9, min: 10, max: 1000, logo: 'https://ecs7.tokopedia.net/img/cache/215-square/shops-1/2020/3/23/6981183/6981183_87e8f046-5e6f-4e06-b0f5-45061a9b47e8.png' },
    { name: 'Bukalapak', category: 'E-commerce', country: 'Indonesia', discount: 8, min: 10, max: 1000, logo: 'https://s4.bukalapak.com/img/4971805445/large/logo_bukalapak.png' },
    { name: 'FoodPanda', category: 'Food', country: 'Thailand', discount: 10, min: 5, max: 200, logo: 'https://www.foodpanda.com/wp-content/uploads/2023/02/fp-logo.svg' },
    { name: 'AirAsia', category: 'Travel', country: 'Malaysia', discount: 4, min: 50, max: 2000, logo: 'https://www.airasia.com/aa/images/logo-airasia.png' },
    { name: 'Traveloka', category: 'Travel', country: 'Indonesia', discount: 6, min: 25, max: 2000, logo: 'https://tvlk.imgix.net/imageResource/2023/09/18/1695005853962-726c0a7a07dc1beb16d86db87a11faf4.png' },
    { name: 'Zalora', category: 'Fashion', country: 'Singapore', discount: 12, min: 20, max: 500, logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2e/ZALORA_Group_Logo.jpg' },
    { name: 'Carousell', category: 'Marketplace', country: 'Singapore', discount: 5, min: 10, max: 500, logo: 'https://mma.prnewswire.com/media/1832274/Carousell_Group_Logo.jpg' },
    { name: 'BeautyMNL', category: 'Beauty', country: 'Philippines', discount: 15, min: 10, max: 300, logo: 'https://cdn.beautymnl.com/images/logo-beautymnl.svg' },
    { name: 'Althea', category: 'Beauty', country: 'Korea', discount: 18, min: 15, max: 300, logo: 'https://ph.althea.kr/wp-content/uploads/sites/10/2019/02/althea_logo.png' },
    { name: 'Qoo10', category: 'E-commerce', country: 'Singapore', discount: 10, min: 10, max: 500, logo: 'https://www.qoo10.sg/gmkt.inc/Special/Qoo10_7th/img/logo.png' },
    { name: 'LINE Store', category: 'E-commerce', country: 'Thailand', discount: 5, min: 5, max: 100, logo: 'https://vos.line-scdn.net/line-shopping-tw/rich-menu/logo.png' },
    { name: 'TrueMoney', category: 'Payment', country: 'Thailand', discount: 3, min: 10, max: 1000, logo: 'https://www.truemoney.com/wp-content/uploads/2021/01/truemoney-logo.png' },
    { name: 'GCash', category: 'Payment', country: 'Philippines', discount: 4, min: 10, max: 1000, logo: 'https://www.gcash.com/wp-content/uploads/2019/12/gcash-logo.png' },
    { name: 'ShopeePay', category: 'Payment', country: 'Singapore', discount: 6, min: 10, max: 500, logo: 'https://cf.shopee.sg/file/b184d9cc60d612dc8234116df37acf50' },
    { name: 'Steam SEA', category: 'Gaming', country: 'Regional', discount: 8, min: 10, max: 500, logo: 'https://store.steampowered.com/favicon.ico' },
    { name: 'Garena', category: 'Gaming', country: 'Singapore', discount: 10, min: 5, max: 200, logo: 'https://www.garena.sg/gpc/img/logo.png' }
  ];

  const supplierStmt = db.prepare(`
    INSERT OR IGNORE INTO suppliers (name, company, wallet_address, api_provider, commission_rate, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const suppliers = [
    ['BitRefill API', 'BitRefill', '0x1234567890123456789012345678901234567890', 'bitrefill', 2.5, 1],
    ['Tango Card', 'Tango Card Inc', '0x2345678901234567890123456789012345678901', 'tango', 3.0, 1],
    ['Ding Connect', 'Ding', '0x3456789012345678901234567890123456789012', 'ding', 2.8, 1],
    ['Local Supplier', 'SEA Cards Ltd', '0x4567890123456789012345678901234567890123', 'manual', 1.5, 1]
  ];

  suppliers.forEach(supplier => {
    supplierStmt.run(supplier);
  });
  supplierStmt.finalize();

  const brandStmt = db.prepare(`
    INSERT OR IGNORE INTO brands (
      name, logo, category, country, description, 
      discount_rate, min_value, max_value, supplier_id, 
      api_endpoint, is_active, inventory_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  seaBrands.forEach((brand, index) => {
    const supplierId = (index % 4) + 1;
    brandStmt.run([
      brand.name,
      brand.logo,
      brand.category,
      brand.country,
      `${brand.name} gift cards for ${brand.country} market`,
      brand.discount,
      brand.min,
      brand.max,
      supplierId,
      `https://api.provider.com/v1/cards/${brand.name.toLowerCase()}`,
      1,
      100
    ]);
  });
  brandStmt.finalize();

  const cardValues = [10, 20, 25, 50, 100, 200, 500, 1000];
  
  db.all("SELECT id, name, min_value, max_value, discount_rate FROM brands", (err, brands) => {
    if (err) {
      console.error('Error fetching brands:', err);
      return;
    }

    const cardStmt = db.prepare(`
      INSERT OR IGNORE INTO gift_cards (
        brand_id, value, currency, sku, stock_quantity, 
        cost_price, selling_price, is_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    brands.forEach(brand => {
      cardValues.forEach(value => {
        if (value >= brand.min_value && value <= brand.max_value) {
          const costPrice = value * 0.98;
          const sellingPrice = value * (1 - brand.discount_rate / 100);
          const sku = `${brand.name.toUpperCase().replace(/\s+/g, '_')}_${value}_USD`;
          
          cardStmt.run([
            brand.id,
            value,
            'USD',
            sku,
            50,
            costPrice,
            sellingPrice,
            1
          ]);
        }
      });
    });
    
    cardStmt.finalize();
    console.log('Initial data seeded successfully');
  });
}

migrate().catch(console.error).finally(() => {
  db.close();
});