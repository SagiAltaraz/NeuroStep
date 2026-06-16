import express from 'express';
import { askFromOpenAI } from '../controllers/chatassistant.ts';
import { optionalProtect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/askAI', optionalProtect, askFromOpenAI);

export default router;
