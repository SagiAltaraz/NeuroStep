import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Routes from './routes/Routes.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/adminRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected!'))
  .catch((err) => console.log('MongoDB Connection Error:', err));

app.use(
   cors({
      origin: 'http://localhost:5173',
      credentials: true,
   })
);

app.use(express.json());

// API routes
app.use("/api/auth", authRoutes);
app.use("/api", Routes);
app.use("/api/admin", adminRoutes);

const frontendPath = join(__dirname, "../frontend/dist");
app.use(express.static(frontendPath));

app.use("/", (req, res) => {
  res.sendFile(join(frontendPath, "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
   console.log(`Server running on → http://localhost:${PORT}`);
});
