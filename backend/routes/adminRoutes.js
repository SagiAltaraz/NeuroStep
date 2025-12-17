// routes/adminRoutes.js
import express from 'express';
import {
  getAllUsers,
  updateUserRole,
  updateUser,
  deleteUser,
} from '../controllers/AdminController.js';

import { protect, isAdmin } from "../middleware/authMiddleware.js";
const router = express.Router();

router.get("/users", protect, isAdmin, getAllUsers);
router.patch("/users/:id/role", protect, isAdmin, updateUserRole);
router.put("/users/:id", protect, isAdmin, updateUser);
router.delete("/users/:id", protect, isAdmin, deleteUser);
export default router;