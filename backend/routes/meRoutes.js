// routes/meRoutes.js — self-service ("me") endpoints for the logged-in user.
import express from 'express';
import {
   getMyProfile,
   getMyProgression,
   getMyReport,
   getMyGameStats,
   getMyCompanion,
   getMyChatSessionRecommendation,
   updateMyChatSessionMood,
} from '../controllers/MeController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/profile', protect, getMyProfile);
router.get('/progression', protect, getMyProgression);
router.get('/companion', protect, getMyCompanion);
router.get('/chat-session/:sessionId/recommendation', protect, getMyChatSessionRecommendation);
router.patch('/chat-session/mood', protect, updateMyChatSessionMood);
router.get('/reports/:sessionId', protect, getMyReport);
router.get('/stats/:gameId', protect, getMyGameStats);
router.get('/target-time/:gameId', protect, getMyTargetTime);

export default router;
