// routes/Routes.js
import express from 'express';
//import { PrismaClient } from '@prisma/client';
import { askFromOpenAI } from '../controllers/chatassistant.js';
import personalizationRoutes from './personalizationRoutes.js';

const router = express.Router();
//const prisma = new PrismaClient();

// Route to ask OpenAI
router.post('/askAI', askFromOpenAI);

// Personalization routes
router.use('/personalization', personalizationRoutes);

// // Route to get all reviews for a specific product
// router.get('/products/:id/reviews', async (req, res) => {
//     const productId = parseInt(req.params.id);

//     try {
//         const reviews = await prisma.review.findMany({
//             where: { productId },
//             orderby: { createdAt: 'desc' }
//         });

//         res.json(reviews);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: 'Failed to fetch reviews' });
//     }
// });

export default router;
