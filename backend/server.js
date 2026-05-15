// Load environment variables FIRST - ESM imports are hoisted, so we use
// the side-effect form of dotenv to ensure it runs before any other import.
import 'dotenv/config';

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import Routes from './routes/Routes.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/adminRoutes.js';
import personalizationRoutes from './routes/personalizationRoutes.js';

// Import Firebase AFTER dotenv
import './config/firebase.js';

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please create a .env file with these variables.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

console.log('Firebase Connected!');

const defaultOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];
const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : defaultOrigins;

app.use(
   cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
   })
);

app.use(express.json());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/personalization", personalizationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", Routes);

const frontendPath = join(__dirname, "../frontend/dist");
app.use(express.static(frontendPath));

app.get("/{*path}", (req, res) => {
  res.sendFile(join(frontendPath, "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
   console.log(`Server running on → http://localhost:${PORT}`);
});
