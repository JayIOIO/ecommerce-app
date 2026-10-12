import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return null;
    try {
      return JSON.parse(storedUser);
    } catch {
      return null;
    }
  });
  const [isSignup, setIsSignup] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('shop');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  const [products, setProducts] = useState([]);
  const [sellerProducts, setSellerProducts] = useState([]);
  const [sellerOrders, setSellerOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);

  const [authData, setAuthData] = useState({ name: '', email: '', password: '', role: 'buyer' });
  const [productFilters, setProductFilters] = useState({ search: '', category: '' });
  const [productForm, setProductForm] = useState({
    name: '', description: '', category: '', price: '', image_url: '', stock: 10
  });
  const [editingProductId, setEditingProductId] = useState(null);
  const [checkoutData, setCheckoutData] = useState({ address: '', payment_method: 'Credit Card' });
  const [profileData, setProfileData] = useState(() => ({ name: user?.name || '', password: '' }));

  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const fetchProducts = useCallback(async (filters = {}) => {
    try {
      const res = await axios.get(`${API_URL}/products`, { params: filters });
      setProducts(res.data);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(res.data);
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  }, [token]);

  const fetchSellerData = useCallback(async () => {
    try {
      const [inventory, sellerOrderResponse] = await Promise.all([
        axios.get(`${API_URL}/products/mine`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/orders/seller`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setSellerProducts(inventory.data);
      setSellerOrders(sellerOrderResponse.data);
    } catch (err) {
      console.error('Error fetching seller data:', err);
    }
  }, [token]);

  useEffect(() => {
    let active = true;

    axios.get(`${API_URL}/products`)
      .then((res) => {
        if (active) setProducts(res.data);
      })
      .catch((err) => console.error('Error fetching products:', err));

    if (token && user?.role === 'buyer') {
      axios.get(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => {
          if (active) setOrders(res.data);
        })
        .catch((err) => console.error('Error fetching orders:', err));
    }

    if (token && user?.role === 'seller') {
      Promise.all([
        axios.get(`${API_URL}/products/mine`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/orders/seller`, { headers: { Authorization: `Bearer ${token}` } })
      ])
        .then(([inventory, sellerOrderResponse]) => {
          if (active) {
            setSellerProducts(inventory.data);
            setSellerOrders(sellerOrderResponse.data);
          }
        })
        .catch((err) => console.error('Error fetching seller data:', err));
    }

    return () => {
      active = false;
    };
  }, [token, user?.role]);

  const handleProductSearch = async (event) => {
    event.preventDefault();
    await fetchProducts(productFilters);
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        stock: Number(productForm.stock)
      };
      if (editingProductId) {
        await axios.put(`${API_URL}/products/${editingProductId}`, payload, authConfig);
      } else {
        await axios.post(`${API_URL}/products`, payload, authConfig);
      }
      setProductForm({ name: '', description: '', category: '', price: '', image_url: '', stock: 10 });
      setEditingProductId(null);
      await fetchProducts(productFilters);
      await fetchSellerData();
    } catch (err) {
      alert(err.response?.data?.error || 'Unable to save product listing');
    }
  };

  const handleEditProduct = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      description: product.description || '',
      category: product.category,
      price: product.price,
      image_url: product.image_url || '',
      stock: product.stock
    });
  };

  const handleDeleteProduct = async (productId) => {
    if (!confirm('Delete this product listing? Products with order history cannot be deleted.')) return;
    try {
      await axios.delete(`${API_URL}/products/${productId}`, authConfig);
      await fetchProducts(productFilters);
      await fetchSellerData();
    } catch (err) {
      alert(err.response?.data?.error || 'Unable to delete product listing');
    }
  };

  const handleSellerOrderStatus = async (orderId, status) => {
    try {
      await axios.put(`${API_URL}/orders/${orderId}/status`, { status }, authConfig);
      await fetchSellerData();
    } catch (err) {
      alert(err.response?.data?.error || 'Unable to update seller order status');
    }
  };

  const addToCart = (product) => {
    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
      setCart(cart.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId, delta) => {
    setCart(cart.map((item) => {
      if (item.id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleDeleteOrder = async (orderId) => {
    if (!confirm('Are you sure you want to cancel and delete this order?')) return;
    try {
      await axios.delete(`${API_URL}/orders/${orderId}`, authConfig);
      fetchOrders();
    } catch {
      alert('Failed to delete order');
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!profileData.name.trim()) return alert('Name cannot be empty');

    try {
      const res = await axios.put(`${API_URL}/auth/profile`, { name: profileData.name }, authConfig);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setUser(res.data.user);
      alert('Name successfully updated in database!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update profile name');
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const endpoint = isSignup ? `${API_URL}/auth/signup` : `${API_URL}/auth/login`;

    try {
      const res = await axios.post(endpoint, authData);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setUser(res.data.user);
      setProfileData({ name: res.data.user.name, password: '' });
      setAuthData({ name: '', email: '', password: '', role: 'buyer' });
    } catch (err) {
      alert(err.response?.data?.error || 'Authentication failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setUser(null);
    setCart([]);
    setOrders([]);
    setActiveTab('shop');
  };

  const handleThemeToggle = () => {
    setIsDarkMode((currentMode) => {
      const nextMode = !currentMode;
      localStorage.setItem('theme', nextMode ? 'dark' : 'light');
      return nextMode;
    });
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!checkoutData.address.trim()) return alert('Please enter shipping address');

    try {
      await axios.post(
        `${API_URL}/orders`,
        {
          address: checkoutData.address,
          payment_method: checkoutData.payment_method,
          total_amount: cartTotal.toFixed(2),
          cartItems: cart
        },
        authConfig
      );
      alert('🎉 Order Placed Successfully!');
      setCart([]);
      setCheckoutData({ address: '', payment_method: 'Credit Card' });
      fetchOrders();
      fetchProducts();
      setActiveTab('orders');
    } catch (err) {
      alert('Checkout failed: ' + (err.response?.data?.error || 'Error processing request'));
    }
  };

  if (!token) {
    return (
      <div className="app-root" data-theme={isDarkMode ? 'dark' : 'light'}>
      
        <button
          type="button"
          className="theme-toggle auth-theme-toggle"
          onClick={handleThemeToggle}
          aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}
          aria-pressed={isDarkMode}
        >
          {isDarkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      
        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-header">
              <h1>🛍 Shopee Clone</h1>
              <p>{isSignup ? 'Create your new account' : 'Log in to start shopping'}</p>
            </div>

            <form onSubmit={handleAuthSubmit} className="auth-form">
              {isSignup && (
                <>
                  <input
                    className="auth-input"
                    placeholder="Full Name"
                    value={authData.name}
                    onChange={(e) => setAuthData({ ...authData, name: e.target.value })}
                    required
                  />
                  <select
                    className="auth-input"
                    value={authData.role}
                    onChange={(e) => setAuthData({ ...authData, role: e.target.value })}
                    aria-label="Account type"
                  >
                    <option value="buyer">Buyer account</option>
                    <option value="seller">Seller account</option>
                  </select>
                </>
              )}

              <input
                type="email"
                className="auth-input"
                placeholder="Email Address"
                value={authData.email}
                onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
                required
              />

              <div className="auth-password-field">
                <input
                  type={showAuthPassword ? 'text' : 'password'}
                  className="auth-input auth-password-input"
                  placeholder="Password"
                  value={authData.password}
                  onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowAuthPassword((isVisible) => !isVisible)}
                  aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showAuthPassword}
                >
                  {showAuthPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <button type="submit" className="auth-button">
                {isSignup ? 'Sign Up' : 'Log In'}
              </button>
            </form>

            <div className="auth-toggle-container">
              <button onClick={() => setIsSignup(!isSignup)} className="auth-toggle-btn">
                {isSignup ? 'Existing user? Log In' : 'New to Shopee? Sign Up'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root" data-theme={isDarkMode ? 'dark' : 'light'}>
      <header className="shopee-header">
        <div className="header-container">
          <h2 className="brand-title" onClick={() => setActiveTab('shop')}>
            🛍️ <span>Shopee</span>
          </h2>
          <div className="header-actions">
            <button
              type="button"
              className="theme-toggle"
              onClick={handleThemeToggle}
              aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} theme`}
              aria-pressed={isDarkMode}
            >
              {isDarkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <div className="user-info">
              <span>Welcome, <strong>{user?.name}</strong> ({user?.role})</span>
              <button onClick={handleLogout} className="btn-logout">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <div className="shopee-nav">
        <div className="nav-container">
          {[
            { id: 'shop', label: 'Search Products' },
            ...(user?.role === 'buyer'
              ? [
                  { id: 'cart', label: `My Cart (${cart.reduce((sum, item) => sum + item.quantity, 0)})` },
                  { id: 'orders', label: `My Orders (${orders.length})` }
                ]
              : [
                  { id: 'inventory', label: `My Listings (${sellerProducts.length})` },
                  { id: 'seller-orders', label: `Seller Orders (${sellerOrders.length})` }
                ]),
            { id: 'profile', label: 'My Account Settings' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="main-container">
        {activeTab === 'shop' && (
          <>
            <form className="product-search" onSubmit={handleProductSearch}>
              <input
                className="form-input"
                value={productFilters.search}
                onChange={(e) => setProductFilters({ ...productFilters, search: e.target.value })}
                placeholder="Search by product name or keyword"
                aria-label="Search products"
              />
              <input
                className="form-input"
                value={productFilters.category}
                onChange={(e) => setProductFilters({ ...productFilters, category: e.target.value })}
                placeholder="Category (optional)"
                aria-label="Filter by category"
              />
              <button className="btn-submit" type="submit">Search</button>
            </form>
            <div className="product-grid">
              {products.map((prod) => (
                <div key={prod.id} className="product-card">
                  {prod.image_url && <img src={prod.image_url} alt={prod.name} className="product-image" />}
                  <div className="product-details">
                    <div>
                      <h4 className="product-title">{prod.name}</h4>
                      <p className="product-desc">{prod.description}</p>
                      <small>{prod.category}{prod.seller_name ? ` · ${prod.seller_name}` : ''}</small>
                    </div>
                    <div className="product-footer">
                      <span className="product-price">${parseFloat(prod.price).toFixed(2)}</span>
                      {user?.role === 'buyer' && (
                        <button onClick={() => addToCart(prod)} className="btn-add-cart" disabled={prod.stock < 1}>
                          {prod.stock < 1 ? 'Out of stock' : '+ Add'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {products.length === 0 && <p>No matching products found.</p>}
            </div>
          </>
        )}

        {activeTab === 'inventory' && user?.role === 'seller' && (
          <section className="seller-layout">
            <div className="profile-card seller-form-card">
              <h3 className="card-title">{editingProductId ? 'Edit Listing' : 'Create Product Listing'}</h3>
              <form onSubmit={handleProductSubmit} className="profile-form">
                <label className="form-label">PRODUCT NAME</label>
                <input className="form-input" required minLength="2" value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                <label className="form-label">DESCRIPTION</label>
                <textarea className="form-textarea" value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
                <label className="form-label">CATEGORY</label>
                <input className="form-input" required minLength="2" value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} />
                <label className="form-label">PRICE</label>
                <input className="form-input" required type="number" min="0.01" step="0.01" value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
                <label className="form-label">STOCK</label>
                <input className="form-input" required type="number" min="0" step="1" value={productForm.stock}
                  onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} />
                <label className="form-label">IMAGE URL (OPTIONAL)</label>
                <input className="form-input" type="url" value={productForm.image_url}
                  onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })} />
                <button className="btn-submit" type="submit">{editingProductId ? 'Save Listing' : 'Create Listing'}</button>
                {editingProductId && (
                  <button className="btn-danger" type="button" onClick={() => {
                    setEditingProductId(null);
                    setProductForm({ name: '', description: '', category: '', price: '', image_url: '', stock: 10 });
                  }}>Cancel Edit</button>
                )}
              </form>
            </div>
            <div className="orders-card">
              <h3 className="card-title">Your Inventory</h3>
              {sellerProducts.length === 0 ? <p>No listings yet. Create your first product.</p> : (
                <div className="seller-listings">
                  {sellerProducts.map((product) => (
                    <article className="seller-listing" key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <p>{product.category} · ${Number(product.price).toFixed(2)} · Stock: {product.stock}</p>
                      </div>
                      <div className="seller-actions">
                        <button className="btn-submit" onClick={() => handleEditProduct(product)}>Edit</button>
                        <button className="btn-danger" onClick={() => handleDeleteProduct(product.id)}>Delete</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'seller-orders' && user?.role === 'seller' && (
          <section className="orders-card">
            <h3 className="card-title">Orders Containing Your Products</h3>
            {sellerOrders.length === 0 ? <p>No orders for your listings yet.</p> : (
              <div className="orders-list">
                {sellerOrders.map((order) => (
                  <article className="order-item-card" key={order.id}>
                    <div>
                      <h4>{order.order_number}</h4>
                      <p>Buyer: {order.customer_name}</p>
                      <p>Ship to: {order.address}</p>
                      {order.items.map((item) => (
                        <p key={item.id}>
                          {item.product_name} × {item.quantity} · {item.status} · ${Number(item.price).toFixed(2)}
                        </p>
                      ))}
                    </div>
                    <label>
                      Update your items
                      <select
                        className="order-select"
                        value={order.items[0]?.status || 'Pending'}
                        onChange={(e) => handleSellerOrderStatus(order.id, e.target.value)}
                      >
                        <option value="Pending" disabled>Pending</option>
                        <option value="Processing">Processing</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </label>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'cart' && user?.role === 'buyer' && (
          <div>
            {cart.length === 0 ? (
              <div className="empty-cart">
                <p>Your shopping cart is currently empty.</p>
                <button onClick={() => setActiveTab('shop')} className="btn-submit" style={{ marginTop: '15px' }}>
                  Go Shopping Now
                </button>
              </div>
            ) : (
              <div className="cart-layout">
                <div className="cart-card">
                  <h3 className="card-title">Cart Items</h3>
                  {cart.map((item) => (
                    <div key={item.id} className="cart-item">
                      <div style={{ flex: 2 }}>
                        <h4 style={{ fontSize: '14px' }}>{item.name}</h4>
                        <small style={{ color: '#888' }}>${parseFloat(item.price).toFixed(2)}</small>
                      </div>

                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button onClick={() => updateQuantity(item.id, -1)} className="qty-btn">-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="qty-btn">+</button>
                      </div>

                      <div style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', color: '#ee4d2d' }}>
                        ${(item.price * item.quantity).toFixed(2)}
                      </div>

                      <button onClick={() => removeFromCart(item.id)} className="btn-remove">✕</button>
                    </div>
                  ))}
                </div>

                <div className="checkout-card">
                  <h3 className="card-title">Checkout</h3>
                  <div className="checkout-total">
                    <span>Total Pay:</span>
                    <span style={{ color: '#ee4d2d' }}>${cartTotal.toFixed(2)}</span>
                  </div>

                  <form onSubmit={handleCheckoutSubmit} className="checkout-form">
                    <label className="form-label">SHIPPING ADDRESS</label>
                    <textarea
                      rows="3"
                      className="form-textarea"
                      placeholder="Street, City, Zip Code..."
                      value={checkoutData.address}
                      onChange={(e) => setCheckoutData({ ...checkoutData, address: e.target.value })}
                      required
                    />

                    <label className="form-label">PAYMENT METHOD</label>
                    <select
                      className="form-select"
                      value={checkoutData.payment_method}
                      onChange={(e) => setCheckoutData({ ...checkoutData, payment_method: e.target.value })}
                    >
                      <option value="Credit Card">Credit Card</option>
                      <option value="PayPal">PayPal</option>
                      <option value="Cash on Delivery">Cash on Delivery</option>
                    </select>

                    <button type="submit" className="btn-submit">
                      Place Order
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && user?.role === 'buyer' && (
          <div className="orders-card">
            <h3 className="card-title">Order History</h3>
            {orders.length === 0 ? (
              <p style={{ color: '#888' }}>No order records found.</p>
            ) : (
              <div className="orders-list">
                {orders.map((order) => (
                  <div key={order.id} className="order-item-card">
                    <div>
                      <h4 style={{ margin: '0 0 5px 0' }}>{order.order_number}</h4>
                      <p style={{ fontSize: '13px', color: '#555' }}>Address: {order.address}</p>
                      <p style={{ fontSize: '13px', color: '#555' }}>Payment: {order.payment_method}</p>
                      <strong style={{ color: '#ee4d2d', fontSize: '16px' }}>Total: ${parseFloat(order.total_amount).toFixed(2)}</strong>
                      {order.items?.map((item) => (
                        <p key={item.id}>{item.name} × {item.quantity} · {item.status}</p>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <strong>Status: {order.status}</strong>
                      {order.status === 'Pending' && <div>
                        <button onClick={() => handleDeleteOrder(order.id)} className="btn-danger">
                          Cancel / Delete
                        </button>
                      </div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-card" style={{ maxWidth: '500px', margin: '0 auto' }}>
            <h3 className="card-title">Account Settings</h3>

            <form onSubmit={handleUpdateProfile} className="profile-form">
              <label className="form-label">FULL NAME</label>
              <input
                className="form-input"
                value={profileData.name}
                onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              />

              <button type="submit" className="btn-submit" style={{ marginTop: '15px' }}>
                Update Name
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
