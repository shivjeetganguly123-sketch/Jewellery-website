/* ============================================================
   Unique & Stylish — Backend API
   Node.js + Express + MongoDB (Mongoose)

   Stores:
   1. User accounts  (registration / login)
   2. Orders         (every purchase, with item categories & types)
   ============================================================ */
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/unique_stylish';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serves the website

/* ---------------- MongoDB connection ---------------- */
mongoose.connect(MONGO_URI)
  .then(() => console.log('✓ Connected to MongoDB:', MONGO_URI))
  .catch(err => {
    console.error('✗ MongoDB connection failed:', err.message);
    console.error('  → Is MongoDB running? Or set MONGO_URI in .env (e.g. MongoDB Atlas).');
  });

/* ---------------- Schemas & Models ---------------- */
const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:    { type: String, required: true, trim: true },
  password: { type: String, required: true },              // bcrypt hash
  createdAt:{ type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
  orderId:  { type: String, required: true, unique: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = guest checkout
  customer: {
    name:    String,
    phone:   String,
    address: String,
    pincode: String
  },
  items: [{
    name:     { type: String, required: true },   // product type, e.g. "Jhumka Earrings"
    category: { type: String, required: true },   // purchase category, e.g. "Earrings"
    price:    { type: Number, required: true },
    qty:      { type: Number, required: true, min: 1 }
  }],
  subtotal:      Number,
  shipping:      Number,
  total:         { type: Number, required: true },
  paymentMethod: { type: String, required: true },          // GPay / Paytm / UPI / Cash on Delivery
  status:        { type: String, default: 'Placed' },       // Placed → Shipped → Delivered
  createdAt:     { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

/* ---------------- Auth helpers ---------------- */
function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, phone: user.phone };
}

// Required auth — rejects if no valid token
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Please login first' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please login again' });
  }
}

// Optional auth — attaches user if token present, continues either way (guest checkout)
function optionalAuth(req, _res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token) {
    try { req.userId = jwt.verify(token, JWT_SECRET).id; } catch { /* guest */ }
  }
  next();
}

/* ================= ROUTES ================= */

/* Health check */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

/* ---- 1. REGISTER — saves new user account in MongoDB ---- */
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || name.trim().length < 3) return res.status(400).json({ error: 'Please enter your full name' });
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Please enter a valid email' });
    if (!/^[6-9]\d{9}$/.test(phone || '')) return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists — please login' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name.trim(), email, phone, password: hash });

    console.log('👤 New user registered:', user.email);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error — please try again' });
  }
});

/* ---- 2. LOGIN ---- */
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: 'No account found with this email' });

    const match = await bcrypt.compare(password || '', user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error — please try again' });
  }
});

/* ---- Current user profile ---- */
app.get('/api/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(publicUser(user));
});

/* ---- 3. SAVE ORDER — every purchase stored in MongoDB ----
   Works for logged-in users (linked to their account)
   AND guest checkouts (user = null).                        */
app.post('/api/orders', optionalAuth, async (req, res) => {
  try {
    const { orderId, customer, items, subtotal, shipping, total, paymentMethod } = req.body;
    if (!orderId || !Array.isArray(items) || items.length === 0 || !total || !paymentMethod) {
      return res.status(400).json({ error: 'Invalid order data' });
    }
    const order = await Order.create({
      orderId,
      user: req.userId || null,
      customer,
      items,           // each item carries its name (type) + category
      subtotal,
      shipping,
      total,
      paymentMethod
    });
    console.log('🛍 Order saved:', order.orderId, '·', items.length, 'item type(s) ·', '₹' + total, '·', paymentMethod, req.userId ? '· user:' + req.userId : '· guest');
    res.status(201).json({ ok: true, orderId: order.orderId });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Duplicate order ID' });
    console.error(err);
    res.status(500).json({ error: 'Could not save order' });
  }
});

/* ---- 4. MY ORDERS — purchase history for logged-in user ---- */
app.get('/api/my-orders', requireAuth, async (req, res) => {
  const orders = await Order.find({ user: req.userId }).sort({ createdAt: -1 }).limit(50);
  res.json(orders);
});

/* ---- 5. ADMIN (simple) — all orders & users, protected by key ----
   Usage: GET /api/admin/orders?key=YOUR_ADMIN_KEY                    */
function requireAdmin(req, res, next) {
  if (req.query.key !== (process.env.ADMIN_KEY || 'admin123')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
app.get('/api/admin/orders', requireAdmin, async (_req, res) => {
  res.json(await Order.find().sort({ createdAt: -1 }).populate('user', 'name email'));
});
app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  res.json(await User.find().sort({ createdAt: -1 }).select('-password'));
});

/* Send the website for any non-API route */
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('✨ Unique & Stylish running at http://localhost:' + PORT);
});
