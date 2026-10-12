const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
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

const requireSeller = (req, res, next) => {
  if (req.user.role !== 'seller') {
    return res.status(403).json({ error: 'A seller account is required' });
  }
  next();
};

function validateProduct(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const price = Number(body.price);
  const stock = Number(body.stock);
  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';

  if (
    name.length < 2 ||
    category.length < 2 ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isInteger(stock) ||
    stock < 0 ||
    (imageUrl && !/^https?:\/\//i.test(imageUrl))
  ) {
    return { error: 'Provide a product name, category, positive price, non-negative whole-number stock, and a valid http(s) image URL' };
  }

  return { name, description, category, price, stock, imageUrl };
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/products', async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const conditions = [];
    const values = [];

    if (search) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      values.push(`%${search}%`, `%${search}%`);
    }
    if (category) {
      conditions.push('p.category = ?');
      values.push(category);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [products] = await pool.execute(
      `SELECT p.id, p.seller_id, p.name, p.description, p.category, p.price, p.image_url, p.stock,
              u.name AS seller_name
       FROM products p
       LEFT JOIN users u ON u.id = p.seller_id
       ${where}
       ORDER BY p.id DESC`,
      values
    );
    res.json(products);
  } catch (error) {
    console.error('Product search failed:', error);
    res.status(500).json({ error: 'Unable to search products' });
  }
});

app.get('/api/products/mine', authenticateToken, requireSeller, async (req, res) => {
  try {
    const [products] = await pool.execute(
      'SELECT id, seller_id, name, description, category, price, image_url, stock FROM products WHERE seller_id = ? ORDER BY id DESC',
      [req.user.id]
    );
    res.json(products);
  } catch (error) {
    console.error('Seller inventory lookup failed:', error);
    res.status(500).json({ error: 'Unable to load seller inventory' });
  }
});

app.post('/api/products', authenticateToken, requireSeller, async (req, res) => {
  const product = validateProduct(req.body);
  if (product.error) return res.status(400).json({ error: product.error });

  try {
    const [result] = await pool.execute(
      `INSERT INTO products (seller_id, name, description, category, price, image_url, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, product.name, product.description, product.category, product.price, product.imageUrl, product.stock]
    );
    res.status(201).json({ message: 'Product created', productId: result.insertId });
  } catch (error) {
    console.error('Product creation failed:', error);
    res.status(500).json({ error: 'Unable to create product' });
  }
});

app.put('/api/products/:id', authenticateToken, requireSeller, async (req, res) => {
  const product = validateProduct(req.body);
  if (product.error) return res.status(400).json({ error: product.error });

  try {
    const [result] = await pool.execute(
      `UPDATE products
       SET name = ?, description = ?, category = ?, price = ?, image_url = ?, stock = ?
       WHERE id = ? AND seller_id = ?`,
      [product.name, product.description, product.category, product.price, product.imageUrl, product.stock, req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found in your inventory' });
    res.json({ message: 'Product updated' });
  } catch (error) {
    console.error('Product update failed:', error);
    res.status(500).json({ error: 'Unable to update product' });
  }
});

app.delete('/api/products/:id', authenticateToken, requireSeller, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM products WHERE id = ? AND seller_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Product not found in your inventory' });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({ error: 'Products with order history cannot be deleted; set the stock to zero instead' });
    }
    console.error('Product deletion failed:', error);
    res.status(500).json({ error: 'Unable to delete product' });
  }
});

const PORT = Number(process.env.PORT || process.env.CATALOG_PORT || 4002);
app.listen(PORT, () => {
  console.log(`Catalog service running on http://localhost:${PORT}`);
});
