import express from 'express';
import { askFromOpenAI } from '../controllers/chatassistant.ts';

const router = express.Router();

router.post('/askAI', askAI);

export default router;
