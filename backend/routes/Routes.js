// routes/Routes.js
import express from 'express';
import { askFromOpenAI } from '../controllers/chatassistant.js';
import personalizationRoutes from './personalizationRoutes.js';

const router = express.Router();

// Route to ask OpenAI
router.post('/askAI', askFromOpenAI);

// Personalization routes
router.use('/personalization', personalizationRoutes);

export default router;
