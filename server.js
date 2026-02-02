import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';

// Route imports
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import planRoutes from './routes/plan.js';
import weightRoutes from './routes/weight.js';
import workoutRoutes from './routes/workout.js';
import stepsRoutes from './routes/steps.js';
import mealsRoutes from './routes/meals.js';
import analyticsRoutes from './routes/analytics.js';

dotenv.config();

const app = express();

// CORS must be FIRST - before any other middleware
// Support multiple origins via comma-separated FRONTEND_URL or single URL
const allowedOrigins =
  process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || '').split(',').map(url => url.trim()).filter(Boolean)
    : ['http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    // allow server-to-server / curl / health checks
    if (!origin) return callback(null, true);

    // Normalize: remove trailing slashes for comparison
    const normalizedOrigin = origin.replace(/\/+$/, '');
    const normalizedAllowed = allowedOrigins.map(o => o.replace(/\/+$/, ''));

    if (normalizedAllowed.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    // Log rejected origins for debugging
    console.log(`CORS rejected origin: ${origin}, allowed: ${allowedOrigins.join(', ')}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS requests immediately - no DB needed
app.options('*', (req, res) => {
  res.sendStatus(200);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to ensure DB connection before handling requests (skip for OPTIONS)
app.use(async (req, res, next) => {
  // OPTIONS already handled above
  if (req.method === 'OPTIONS') {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/weight', weightRoutes);
app.use('/api/workout', workoutRoutes);
app.use('/api/steps', stepsRoutes);
app.use('/api/meals', mealsRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Only start server in development - Vercel handles this in production
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
