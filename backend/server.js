import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Routes from "./routes/Routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use("/", Routes);

const frontendPath = join(__dirname, "../frontend/dist");
app.use(express.static(frontendPath));

app.get(/^(?!.*\.).*$/, (req, res) => {
  res.sendFile(join(frontendPath, "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on → http://localhost:${PORT}`);
});
