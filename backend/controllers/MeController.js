// controllers/MeController.js
// Self-service endpoints: a logged-in user reading their OWN cognitive profile,
// journey-map progression, per-session reports, and per-game stats. Every read
// is scoped to req.user.id (set by the `protect` middleware) — a user can never
// read another user's data here (that's what the admin routes are for).
import { firestore } from "../config/firebase.js";

// GET /api/me/profile — the caller's per-domain cognitive profile (up to 8 docs)
export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const snap = await firestore
      .collection("users").doc(userId)
      .collection("cognitiveProfile")
      .get();
    const domains = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ domains });
  } catch (err) {
    console.error("[me/profile]", err.message);
    res.status(500).json({ message: "Failed to load profile" });
  }
};

// GET /api/me/progression — the caller's journey-map state (single doc)
export const getMyProgression = async (req, res) => {
  try {
    const userId = req.user.id;
    const doc = await firestore
      .collection("users").doc(userId)
      .collection("progression").doc("current")
      .get();
    // Cold-start default so a brand-new user gets a renderable map.
    res.json(
      doc.exists
        ? doc.data()
        : { overallLevel: 0, rank: "beginner", regions: {}, avatarState: "idle" },
    );
  } catch (err) {
    console.error("[me/progression]", err.message);
    res.status(500).json({ message: "Failed to load progression" });
  }
};

// GET /api/me/reports/:sessionId — the full cognitive report for one of the
// caller's sessions (used if the end-of-session WS push was missed).
export const getMyReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const doc = await firestore.collection("sessions").doc(sessionId).get();
    const report = doc.exists ? doc.data().report : null;
    if (!report) return res.status(404).json({ message: "Report not found" });
    // Ownership check — the session doc isn't under the user subtree.
    if (report.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(report);
  } catch (err) {
    console.error("[me/reports]", err.message);
    res.status(500).json({ message: "Failed to load report" });
  }
};

// GET /api/me/stats/:gameId — the caller's per-game stats (difficultyLevel,
// baseline mean/stdDev, sessionsCount). Used by the difficulty-resume flow.
export const getMyGameStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { gameId } = req.params;
    const doc = await firestore
      .collection("users").doc(userId)
      .collection("stats").doc(gameId)
      .get();
    res.json(doc.exists ? doc.data() : {});
  } catch (err) {
    console.error("[me/stats]", err.message);
    res.status(500).json({ message: "Failed to load stats" });
  }
};
