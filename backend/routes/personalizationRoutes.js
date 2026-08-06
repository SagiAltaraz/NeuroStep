import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { userFirebaseService } from "../services/user.js";

const router = express.Router();

router.post("/profile/save", protect, async (req, res) => {
  try {
    const { answers, prompt, questionnaire } = req.body;
    const updatedUser = await userFirebaseService.updatePersonalization(req.user.id, {
      answers,
      prompt,
      questionnaire,
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

router.get("/profile", protect, async (req, res) => {
  try {
    const user = await userFirebaseService.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      personalizationAnswers: user.personalizationAnswers,
      personalizationQuestionnaire: user.personalizationQuestionnaire,
      personalizationPrompt: user.personalizationPrompt,
      profileCompletedAt: user.profileCompletedAt,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

export default router;
