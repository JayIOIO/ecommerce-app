const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'app_user',
  password: process.env.DB_PASSWORD ?? 'app_password',
  database: process.env.DB_NAME || 'ecommerce_db',
  waitForConnections: true,
  connectionLimit: 10
});

const jwtSecret = process.env.JWT_SECRET || 'super_secret_jwt_key';

const authenticateToken = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'A Bearer access token is required' });
  }

  jwt.verify(token, jwtSecret, (error, user) => {
    if (error) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: `A ${role} account is required` });
  }
  next();
};

function summarizeStatus(rows) {
  if (rows.every((row) => row.status === 'Delivered')) return 'Delivered';
  if (rows.every((row) => row.status === 'Cancelled')) return 'Cancelled';
  if (rows.every((row) => ['Shipped', 'Delivered'].includes(row.status))) return 'Shipped';
  if (rows.every((row) => row.status === 'Pending')) return 'Pending';
  return 'Processing';
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/orders', authenticateToken, requireRole('buyer'), async (req, res) => {
  const address = typeof req.body.address === 'string' ? req.body.address.trim() : '';
  const paymentMethod = typeof req.body.payment_method === 'string' ? req.body.payment_method.trim() : '';
  const cartItems = req.body.cartItems;

  if (!address || !paymentMethod || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Shipping address, payment method, and at least one cart item are required' });
  }

  const combinedItems = new Map();
  for (const item of cartItems) {
    const productId = Number(item.id);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ error: 'Each cart item must have a valid product ID and positive whole-number quantity' });
    }
    combinedItems.set(productId, (combinedItems.get(productId) || 0) + quantity);
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const orderItems = [];
    let totalAmount = 0;

    for (const [productId, quantity] of combinedItems) {
      const [products] = await connection.execute(
        'SELECT id, seller_id, name, price, stock FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );
      if (products.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: `Product ${productId} no longer exists` });
      }

      const product = products[0];
      if (product.stock < quantity) {
        await connection.rollback();
        return res.status(409).json({ error: `Not enough stock for ${product.name}` });
      }

      const price = Number(product.price);
      totalAmount += price * quantity;
      orderItems.push({ productId, sellerId: product.seller_id, quantity, price });
    }

    const orderNumber = `ORD-${randomUUID().replaceAll('-', '').toUpperCase()}`;
    const [orderResult] = await connection.execute(
      `INSERT INTO checkout_orders
       (order_number, user_id, customer_name, email, address, payment_method, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orderNumber, req.user.id, req.user.name, req.user.email, address, paymentMethod, totalAmount.toFixed(2)]
    );

    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO order_items (order_id, product_id, seller_id, quantity, price)
         VALUES (?, ?, ?, ?, ?)`,
        [orderResult.insertId, item.productId, item.sellerId, item.quantity, item.price.toFixed(2)]
      );
      await connection.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.productId]
      );
    }

    await connection.commit();
    res.status(201).json({
      message: 'Order placed successfully',
      orderId: orderResult.insertId,
      orderNumber,
      totalAmount: Number(totalAmount.toFixed(2))
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Order creation failed:', error);
    res.status(500).json({ error: 'Unable to place order' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/orders', authenticateToken, requireRole('buyer'), async (req, res) => {
  try {
    const [orders] = await pool.execute(
      `SELECT id, order_number, address, payment_method, total_amount, status, created_at
       FROM checkout_orders WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );

    for (const order of orders) {
      const [items] = await pool.execute(
        `SELECT oi.product_id, oi.product_id AS id, p.name, oi.quantity, oi.price, oi.status
         FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }

    res.json(orders);
  } catch (error) {
    console.error('Buyer order lookup failed:', error);
    res.status(500).json({ error: 'Unable to load order history' });
  }
});

app.get('/api/orders/seller', authenticateToken, requireRole('seller'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT o.id, o.order_number, o.address, o.total_amount, o.created_at,
              o.customer_name, oi.id AS order_item_id, oi.product_id,
              oi.quantity, oi.price, oi.status AS item_status, p.name AS product_name
       FROM checkout_orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.seller_id = ?
       ORDER BY o.created_at DESC, oi.id`,
      [req.user.id]
    );

    const ordersById = new Map();
    for (const row of rows) {
      if (!ordersById.has(row.id)) {
        ordersById.set(row.id, {
          id: row.id,
          order_number: row.order_number,
          address: row.address,
          total_amount: row.total_amount,
          created_at: row.created_at,
          customer_name: row.customer_name,
          items: []
        });
      }
      ordersById.get(row.id).items.push({
        id: row.order_item_id,
        product_id: row.product_id,
        product_name: row.product_name,
        quantity: row.quantity,
        price: row.price,
        status: row.item_status
      });
    }
    res.json([...ordersById.values()]);
  } catch (error) {
    console.error('Seller order lookup failed:', error);
    res.status(500).json({ error: 'Unable to load seller orders' });
  }
});

app.put('/api/orders/:id/status', authenticateToken, requireRole('seller'), async (req, res) => {
  const allowedStatuses = ['Processing', 'Shipped', 'Delivered'];
  const status = req.body.status;
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${allowedStatuses.join(', ')}` });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [ownedItems] = await connection.execute(
      `SELECT id, status FROM order_items
       WHERE order_id = ? AND seller_id = ? FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    if (ownedItems.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'No items from your store were found in this order' });
    }
    if (ownedItems.some((item) => item.status === 'Delivered' && status !== 'Delivered')) {
      await connection.rollback();
      return res.status(409).json({ error: 'Delivered items cannot move to an earlier status' });
    }

    await connection.execute(
      `UPDATE order_items
       SET status = ?
       WHERE order_id = ? AND seller_id = ?`,
      [status, req.params.id, req.user.id]
    );

    const [items] = await connection.execute(
      'SELECT status FROM order_items WHERE order_id = ?',
      [req.params.id]
    );
    if (items.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    await connection.execute(
      'UPDATE checkout_orders SET status = ? WHERE id = ?',
      [summarizeStatus(items), req.params.id]
    );
    await connection.commit();
    res.json({ message: 'Your order items were updated', status });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Seller order status update failed:', error);
    res.status(500).json({ error: 'Unable to update order status' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/api/orders/:id', authenticateToken, requireRole('buyer'), async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      'SELECT id FROM checkout_orders WHERE id = ? AND user_id = ? AND status = ? FOR UPDATE',
      [req.params.id, req.user.id, 'Pending']
    );
    if (orders.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'A pending order belonging to you was not found' });
    }

    const [items] = await connection.execute(
      'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
      [req.params.id]
    );
    for (const item of items) {
      await connection.execute(
        'UPDATE products SET stock = stock + ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }
    await connection.execute('DELETE FROM checkout_orders WHERE id = ?', [req.params.id]);
    await connection.commit();
    res.json({ message: 'Pending order cancelled and stock restored' });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Order cancellation failed:', error);
    res.status(500).json({ error: 'Unable to cancel order' });
  } finally {
    if (connection) connection.release();
  }
});

const PORT = Number(process.env.PORT || process.env.ORDER_PORT || 4003);
app.listen(PORT, () => {
  console.log(`Order service running on http://localhost:${PORT}`);
});
