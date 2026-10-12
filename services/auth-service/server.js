const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
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

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    jwtSecret,
    { expiresIn: '1d' }
  );
}

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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role = 'buyer' } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedName = typeof name === 'string' ? name.trim() : '';

    if (
      normalizedName.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      typeof password !== 'string' ||
      password.length < 6 ||
      !['buyer', 'seller'].includes(role)
    ) {
      return res.status(400).json({ error: 'Provide a name, valid email, password of at least 6 characters, and buyer or seller role' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [normalizedName, normalizedEmail, hashedPassword, role]
    );
    const user = { id: result.insertId, name: normalizedName, email: normalizedEmail, role };

    res.status(201).json({ token: createToken(user), user });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Signup failed:', error);
    res.status(500).json({ error: 'Unable to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;
    if (!email || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [users] = await pool.execute(
      'SELECT id, name, email, password, role FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { id, name, role } = users[0];
    const user = { id, name, email, role };
    res.json({ token: createToken(user), user });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Unable to sign in' });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }

    await pool.execute('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
    const user = { id: req.user.id, email: req.user.email, name, role: req.user.role };
    res.json({ message: 'Profile updated successfully', token: createToken(user), user });
  } catch (error) {
    console.error('Profile update failed:', error);
    res.status(500).json({ error: 'Unable to update profile' });
  }
});

const PORT = Number(process.env.PORT || process.env.AUTH_PORT || 4001);
app.listen(PORT, () => {
  console.log(`Auth service running on http://localhost:${PORT}`);
});
