import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { userFirebaseService } from "../services/user.js";

const router = express.Router();

// Save personalization profile
router.post("/profile/save", protect, async (req, res) => {
  try {
    const { answers, prompt } = req.body;
    const userId = req.user.id; // From protect middleware

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Update the user with personalization data
    const updatedUser = await userFirebaseService.updatePersonalization(userId, {
      answers,
      prompt,
    });

    const { password, ...userWithoutPassword } = updatedUser;

    res.json({
      success: true,
      message: "Profile saved successfully",
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("Error saving profile:", error);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

// Get user personalization profile
router.get("/profile", protect, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await userFirebaseService.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return only needed fields
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      personalizationAnswers: user.personalizationAnswers,
      personalizationPrompt: user.personalizationPrompt,
      profileCompletedAt: user.profileCompletedAt,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
