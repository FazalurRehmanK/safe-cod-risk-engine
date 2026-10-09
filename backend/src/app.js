// =============================================================================
// src/app.js
// Express Application Assembly
// =============================================================================

const express = require('express');
const cors = require('cors');
const AppError = require('./utils/AppError');
const errorHandler = require('./middleware/errorHandler');

// Route modules
const userRoutes    = require('./routes/users');
const productRoutes = require('./routes/products');
const addressRoutes = require('./routes/addresses');
const checkoutRoute = require('./routes/checkout');
const orderRoutes   = require('./routes/orders');

const app = express();

// =============================================================================
// GLOBAL MIDDLEWARE
// =============================================================================

// CORS: Allow requests from the Vite dev server (port 5173) in development.
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_ORIGIN
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));

// Parse JSON request bodies.
app.use(express.json({ limit: '10kb' }));

// =============================================================================
// ROUTES
// =============================================================================
app.use('/api/users',     userRoutes);
app.use('/api/products',  productRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/checkout',  checkoutRoute);
app.use('/api/orders',    orderRoutes);

// Health check endpoint — useful for deployment / uptime monitoring.
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Safe-COD API is running.',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// =============================================================================
// 404 HANDLER — Must come AFTER all routes.
// =============================================================================
app.all('*', (req, res, next) => {
  next(new AppError(`Cannot find ${req.method} ${req.originalUrl} on this server.`, 404));
});

// =============================================================================
// GLOBAL ERROR HANDLER — Must be the LAST middleware (4 params).
// =============================================================================
app.use(errorHandler);

module.exports = app;
