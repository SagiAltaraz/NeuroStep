import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import Routes from './routes/Routes.js';

// Load environment variables
dotenv.config();

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// CORS setup
app.use(
   cors({
      origin: 'http://localhost:5173',
      credentials: true,
   })
);

// JSON body parsing
app.use(express.json());

// API routes
app.use('/api', Routes);

// Serve frontend static files
const frontendPath = join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// Fallback route to serve index.html for SPA
app.get('/', (req, res) => {
   res.sendFile(join(frontendPath, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
   console.log(`Server running on → http://localhost:${PORT}`);
   console.log(`API endpoint: http://localhost:${PORT}/api/askAI`);
});
