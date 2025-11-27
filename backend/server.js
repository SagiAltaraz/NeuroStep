const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const Routes = require('./routes/Routes');

dotenv.config();

const app = express();

app.use(cors({
  origin: true,  
  credentials: true
}));

app.use(express.json());

app.use('/', Routes);


const frontendPath = path.join(__dirname, '../frontend/dist'); 
app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  if (req.path.includes('.')) { 
    return res.status(404).send();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on → http://localhost:${PORT}`);
});