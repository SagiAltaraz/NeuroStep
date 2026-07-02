import express from 'express';
import { askFromAI } from '../controllers/chatassistant.ts';
import { optionalProtect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/askAI', optionalProtect, askFromAI);

export default router;
