import express from 'express';
import { askFromOpenAI } from '../controllers/chatassistant.ts';

const router = express.Router();

router.post('/askAI', askFromOpenAI);

export default router;
