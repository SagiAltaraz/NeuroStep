import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import Routes from './routes/Routes.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api', Routes); 

const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  if (req.path.includes('.')) return res.status(404).send();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on → http://localhost:${PORT}`));
