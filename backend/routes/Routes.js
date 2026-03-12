import express from 'express';
import { askFromOpenAI } from '../controllers/chatassistant.js';

const router = express.Router();

router.post('/askAI', askFromOpenAI);

export default router;
