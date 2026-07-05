// routes/adminRoutes.js
import express from 'express';
import {
  getAllUsers,
  updateUserRole,
  updateUser,
  deleteUser,
  getSessions,
  getActivity,
  getTokenUsage,
  getUserCognitiveTrend,
  getAlerts,
  acknowledgeAlert,
  getUserCoachReports,
  getUserPlayerFile,
  getSessionReport,
  getSettings,
  updateSettings,
  getAlertConfig,
  updateAlertConfig,
} from '../controllers/AdminController.js';

import { protect, isAdmin } from "../middleware/authMiddleware.js";
const router = express.Router();

router.get("/users",                       protect, isAdmin, getAllUsers);
router.patch("/users/:id/role",            protect, isAdmin, updateUserRole);
router.put("/users/:id",                   protect, isAdmin, updateUser);
router.delete("/users/:id",                protect, isAdmin, deleteUser);
router.get("/sessions",                    protect, isAdmin, getSessions);
router.get("/activity",                    protect, isAdmin, getActivity);
router.get("/token-usage",                 protect, isAdmin, getTokenUsage);
router.get("/users/:userId/trend",         protect, isAdmin, getUserCognitiveTrend);
router.get("/users/:userId/coach-reports", protect, isAdmin, getUserCoachReports);
router.get("/users/:userId/player-file",   protect, isAdmin, getUserPlayerFile);
router.get("/sessions/:sessionId/report",  protect, isAdmin, getSessionReport);
router.get("/alerts",                      protect, isAdmin, getAlerts);
router.post("/alerts/acknowledge",         protect, isAdmin, acknowledgeAlert);
router.get("/settings",                    protect, isAdmin, getSettings);
router.put("/settings",                    protect, isAdmin, updateSettings);
router.get("/alert-config",                protect, isAdmin, getAlertConfig);
router.put("/alert-config",                protect, isAdmin, updateAlertConfig);

export default router;
