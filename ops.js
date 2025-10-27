const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const crypto = require('crypto');

const router = express.Router();

// Request ID middleware
router.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Security headers
router.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
router.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS not allowed'));
  },
  credentials: true,
}));

// Logging
router.use(morgan(':date[iso] :method :url :status :response-time ms req_id=:req[id]'));

// Rate limits
const baseLimiter = rateLimit({ windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100) });
const authLimiter = rateLimit({ windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000), max: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 5) });

router.use(baseLimiter);

// Health endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now(), req_id: req.id });
});

// Version endpoint
router.get('/version', (req, res) => {
  res.json({ version: process.env.APP_VERSION || '0.1.0', commit: process.env.GIT_SHA || null });
});

// Attach auth limiter to auth routes (mounting point expected at /api/auth)
router.authLimiter = authLimiter;

// Centralized error handler
// Usage: app.use('/ops', opsMiddleware), then app.use(errorHandler)
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.expose ? err.message : 'Something went wrong';

  if (status >= 500) {
    console.error(`[${new Date().toISOString()}] req_id=${req.id} status=${status} code=${code} error=`, err);
  }

  res.status(status).json({
    error: { code, message },
    req_id: req.id,
  });
}

module.exports = { opsMiddleware: router, errorHandler };