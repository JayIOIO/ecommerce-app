CREATE DATABASE IF NOT EXISTS ecommerce_db;
USE ecommerce_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('buyer', 'seller') NOT NULL DEFAULT 'buyer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seller_id INT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL DEFAULT 'General',
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(255),
  stock INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_products_seller (seller_id),
  INDEX idx_products_category (category),
  INDEX idx_products_name (name)
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(40) NOT NULL,
  user_id INT NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status ENUM('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_checkout_orders_order_number UNIQUE (order_number),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  seller_id INT NULL,
  quantity INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  status ENUM('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled') DEFAULT 'Pending',
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES checkout_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_items_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_order_items_seller (seller_id)
);

INSERT INTO products (name, description, category, price, image_url, stock)
VALUES
  ('Wireless Headphones', 'Noise-canceling over-ear headphones', 'Electronics', 99.99, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500', 15),
  ('Smart Watch', 'Fitness tracker with heart rate monitor', 'Electronics', 149.99, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500', 8),
  ('Mechanical Keyboard', 'RGB mechanical gaming keyboard', 'Electronics', 79.99, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500', 20)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  category = VALUES(category),
  price = VALUES(price),
  image_url = VALUES(image_url),
  stock = VALUES(stock);