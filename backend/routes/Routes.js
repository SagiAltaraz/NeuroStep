import express from 'express';
import { askAI } from '../controllers/chatassistant.js';

const router = express.Router();

router.post('/askAI', askAI);

export default router;
