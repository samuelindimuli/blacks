const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const db = require('./database');
const orderRoutes = require('./routes/orders');
const ticketRoutes = require('./routes/tickets');
const mpesaRoutes = require('./routes/mpesa');
const analyticsRoutes = require('./routes/analytics');

const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url) => url.trim()).filter(Boolean)
  : [];

const defaultDevOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5501',
  'http://127.0.0.1:5501',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

const isProduction = process.env.NODE_ENV === 'production'
  || Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const allowList = [...new Set([...allowedOrigins, ...defaultDevOrigins])];
  if (allowList.includes(origin)) return true;

  if (!isProduction) {
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(null, false);
      }
    }
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static front-end files from the project root
app.use(express.static(path.join(__dirname, '..')));

app.use('/api/orders', orderRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    await Promise.resolve(db.initializeDatabase());
    app.listen(PORT, HOST, () => {
      const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`;
      console.log(` Server running on ${HOST}:${PORT}`);
      console.log(` Public URL: ${publicUrl}`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    process.exit(1);
  }
}

startServer();
