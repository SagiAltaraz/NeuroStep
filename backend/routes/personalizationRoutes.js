import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import User from "../models/User.js";

const router = express.Router();

// Save personalization profile
router.post("/profile/save", protect, async (req, res) => {
  try {
    const { answers, prompt } = req.body;
    const userId = req.user._id; // From protect middleware

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Update the user with personalization data
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        personalizationAnswers: answers,
        personalizationPrompt: prompt,
        profileCompletedAt: new Date(),
      },
      { new: true }
    ).select("-password");

    res.json({
      success: true,
      message: "Profile saved successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error saving profile:", error);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

// Get user personalization profile
router.get("/profile", protect, async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await User.findById(userId).select(
      "id email name personalizationAnswers personalizationPrompt profileCompletedAt"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
