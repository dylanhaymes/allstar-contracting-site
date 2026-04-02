'use strict';

require('dotenv').config();

const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        address TEXT,
        message TEXT,
        submitted_at TIMESTAMP DEFAULT NOW(),
        ip_address VARCHAR(50),
        source VARCHAR(100) DEFAULT 'website'
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads (submitted_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);`);
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err.message);
    // Non-fatal — site still works without DB
  }
}

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://www.google.com', 'https://maps.googleapis.com', 'https://maps.gstatic.com'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        frameSrc: ["'self'", 'https://www.google.com'],
        connectSrc: ["'self'"],
      },
    },
  })
);

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { success: false, error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Core Middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Templating ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// ─── Helper: Active Nav ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.path = req.path;
  next();
});

// ─── GET Routes ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.render('index', { title: 'Home | All Star Contracting & Seamless Gutters LLC' });
});

app.get('/services', (req, res) => {
  res.render('services', { title: 'Services | All Star Contracting & Seamless Gutters LLC' });
});

app.get('/seamless-gutters', (req, res) => {
  res.render('seamless-gutters', { title: 'Seamless Gutters | All Star Contracting & Seamless Gutters LLC' });
});

app.get('/contracting', (req, res) => {
  res.render('contracting', { title: 'Contracting & Renovations | All Star Contracting & Seamless Gutters LLC' });
});

app.get('/dumpster-service', (req, res) => {
  res.render('dumpster-service', { title: 'Dumpster Service | All Star Contracting & Seamless Gutters LLC' });
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us | All Star Contracting & Seamless Gutters LLC' });
});

app.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact Us | All Star Contracting & Seamless Gutters LLC' });
});

// ─── POST /contact ─────────────────────────────────────────────────────────────
app.post('/contact', contactLimiter, async (req, res) => {
  const { name, phone, email, address, message } = req.body;

  // Validate required fields
  if (!name || !phone || !email || !message) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  // 1. Save to database
  try {
    await pool.query(
      `INSERT INTO leads (name, phone, email, address, message, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [name.trim(), phone.trim(), email.trim(), (address || '').trim(), message.trim(), ip]
    );
  } catch (dbErr) {
    console.error('DB insert error:', dbErr.message);
    // Continue even if DB fails — still try to send email
  }

  return res.json({ success: true });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found | All Star Contracting' });
});

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong. Please try again.');
});

// ─── HTML Escape Helper ────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Start ────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`All Star Contracting server running on port ${PORT}`);
  });
});
