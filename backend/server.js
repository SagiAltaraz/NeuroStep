import dotenv from 'dotenv';
// Load environment variables FIRST - before any other imports that need them
dotenv.config();

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

app.use(
   cors({
      origin: 'http://localhost:5173',
      credentials: true,
   })
);

app.use(express.json());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/personalization", personalizationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", Routes);

// Static files (only in production)
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
