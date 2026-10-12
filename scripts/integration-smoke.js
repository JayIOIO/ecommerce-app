const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const serviceRequire = createRequire(path.join(root, 'services/order-service/server.js'));
const dotenv = serviceRequire('dotenv');
const mysql = serviceRequire('mysql2/promise');

dotenv.config({ path: path.join(root, '.env'), quiet: true });

const api = {
  auth: (process.env.SMOKE_AUTH_URL || 'http://127.0.0.1:4001').replace(/\/+$/, ''),
  catalog: (process.env.SMOKE_CATALOG_URL || 'http://127.0.0.1:4002').replace(/\/+$/, ''),
  orders: (process.env.SMOKE_ORDERS_URL || 'http://127.0.0.1:4003').replace(/\/+$/, '')
};
const runId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const emailDomain = process.env.SMOKE_EMAIL_DOMAIN || 'example.test';
const productName = `Smoke QA ${runId}`;
const testPassword = `Smoke-${randomBytes(18).toString('base64url')}`;
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD ?? 'app_password',
  database: process.env.DB_NAME || 'ecommerce_db'
};

let buyerId;
let sellerId;
let productId;
let connection;

async function request(label, baseUrl, route, { token, method = 'GET', body, expected = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${label}: expected JSON response, received HTTP ${response.status}`);
  }
  if (response.status !== expected) {
    const reason = typeof result.error === 'string' ? `: ${result.error}` : '';
    throw new Error(`${label}: expected HTTP ${expected}, received HTTP ${response.status}${reason}`);
  }
  return result;
}

async function cleanup() {
  if (!connection) return;

  const userIds = [buyerId, sellerId].filter(Number.isInteger);
  if (userIds.length === 0) return;

  await connection.beginTransaction();
  try {
    if (Number.isInteger(buyerId)) {
      await connection.execute('DELETE FROM checkout_orders WHERE user_id = ?', [buyerId]);
    }
    if (Number.isInteger(productId) && Number.isInteger(sellerId)) {
      const [result] = await connection.execute(
        'DELETE FROM products WHERE id = ? AND seller_id = ? AND name = ?',
        [productId, sellerId, productName]
      );
      if (result.affectedRows !== 1) {
        throw new Error('Smoke product cleanup did not match exactly one run-owned product');
      }
    }
    const [result] = await connection.execute(
      `DELETE FROM users WHERE id IN (${userIds.map(() => '?').join(', ')})`,
      userIds
    );
    if (result.affectedRows !== userIds.length) {
      throw new Error('Smoke account cleanup did not match exactly the accounts created by this run');
    }
    await connection.commit();
    console.log('Cleanup: disposable smoke accounts, orders, items, and product removed.');
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function main() {
  connection = await mysql.createConnection(dbConfig);
  console.log('Smoke test: connected to configured MySQL before creating disposable data.');

  try {
    const buyer = await request('Buyer signup', api.auth, '/api/auth/signup', {
      method: 'POST',
      expected: 201,
      body: {
        name: `Smoke Buyer ${runId}`,
        email: `smoke-buyer-${runId}@${emailDomain}`,
        password: testPassword,
        role: 'buyer'
      }
    });
    buyerId = buyer.user?.id;
    if (!Number.isInteger(buyerId) || typeof buyer.token !== 'string') {
      throw new Error('Buyer signup: response did not include a user ID and token');
    }
    console.log('PASS: disposable buyer signup');

    const seller = await request('Seller signup', api.auth, '/api/auth/signup', {
      method: 'POST',
      expected: 201,
      body: {
        name: `Smoke Seller ${runId}`,
        email: `smoke-seller-${runId}@${emailDomain}`,
        password: testPassword,
        role: 'seller'
      }
    });
    sellerId = seller.user?.id;
    if (!Number.isInteger(sellerId) || typeof seller.token !== 'string') {
      throw new Error('Seller signup: response did not include a user ID and token');
    }
    console.log('PASS: disposable seller signup');

    const created = await request('Seller listing create', api.catalog, '/api/products', {
      method: 'POST',
      token: seller.token,
      expected: 201,
      body: {
        name: productName,
        description: 'Disposable integration smoke test product',
        category: 'Smoke QA',
        price: 1.23,
        stock: 2
      }
    });
    productId = created.productId;
    if (!Number.isInteger(productId)) {
      throw new Error('Seller listing create: response did not include a product ID');
    }
    console.log('PASS: seller listing create');

    const products = await request(
      'Public product search',
      api.catalog,
      `/api/products?search=${encodeURIComponent(productName)}&category=${encodeURIComponent('Smoke QA')}`
    );
    if (!Array.isArray(products) || !products.some((product) => product.id === productId)) {
      throw new Error('Public product search: created listing was not returned by keyword/category search');
    }
    console.log('PASS: public keyword/category search');

    const checkout = await request('Buyer checkout', api.orders, '/api/orders', {
      method: 'POST',
      token: buyer.token,
      expected: 201,
      body: {
        address: `Disposable smoke address ${runId}`,
        payment_method: 'Cash on Delivery',
        cartItems: [{ id: productId, quantity: 1 }]
      }
    });
    if (!Number.isInteger(checkout.orderId) || Number(checkout.totalAmount) !== 1.23) {
      throw new Error('Buyer checkout: order ID or expected database-calculated total was not returned');
    }
    console.log('PASS: buyer checkout with database-calculated total');

    const sellerOrders = await request('Seller order view', api.orders, '/api/orders/seller', {
      token: seller.token
    });
    const sellerOrder = sellerOrders.find((order) =>
      order.items?.some((item) => item.product_id === productId && item.status === 'Pending')
    );
    if (!sellerOrder || sellerOrder.id !== checkout.orderId) {
      throw new Error('Seller order view: new order/product was not visible to the owning seller');
    }
    console.log('PASS: seller sees order containing owned product');

    for (const status of ['Processing', 'Shipped', 'Delivered']) {
      await request(`Seller fulfillment ${status}`, api.orders, `/api/orders/${checkout.orderId}/status`, {
        method: 'PUT',
        token: seller.token,
        body: { status }
      });
      console.log(`PASS: seller fulfillment ${status}`);
    }

    const buyerOrders = await request('Buyer order history', api.orders, '/api/orders', {
      token: buyer.token
    });
    const buyerOrder = buyerOrders.find((order) => order.id === checkout.orderId);
    if (
      buyerOrder?.status !== 'Delivered' ||
      !buyerOrder.items?.some((item) => item.id === productId && item.status === 'Delivered')
    ) {
      throw new Error('Buyer order history: delivered order/item was not returned with expected status');
    }
    console.log('PASS: buyer history reflects seller fulfillment');
  } finally {
    try {
      await cleanup();
    } finally {
      await connection.end();
    }
  }
}

main().catch((error) => {
  console.error(`Integration smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
