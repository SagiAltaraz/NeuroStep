import { userFirebaseService } from "../services/user.js";
import { firestore } from "../config/firebase.js";

// ===== GET ALL USERS =====
export const getAllUsers = async (req, res) => {
  try {
    const users = await userFirebaseService.findAll();
    // Remove password from response
    const usersWithoutPassword = users.map(({ password, ...user }) => user);
    res.json(usersWithoutPassword);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// ===== PROMOTE / DEMOTE USER =====
export const updateUserRole = async (req, res) => {
  const { role } = req.body;

  if (!["user", "admin"].includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  try {
    const user = await userFirebaseService.updateUser(req.params.id, { role });
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    res.status(500).json({ message: "Failed to update role" });
  }
};

// ===== EDIT USER =====
export const updateUser = async (req, res) => {
  const { name, email } = req.body;

  try {
    const user = await userFirebaseService.updateUser(req.params.id, { name, email });
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (err) {
    res.status(500).json({ message: "Failed to update user" });
  }
};

// ===== DELETE USER =====
export const deleteUser = async (req, res) => {
  try {
    await userFirebaseService.deleteUser(req.params.id);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user" });
  }
};

// ===== GAME SESSIONS =====
export const getSessions = async (req, res) => {
  try {
    const snap = await firestore
      .collection('sessions')
      .orderBy('startedAt', 'desc')
      .limit(50)
      .get();

    const sessions = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      report: doc.data().report
        ? {
            cognitiveScore: doc.data().report.cognitiveScore,
            summaryHe:      doc.data().report.summaryHe,
            generatedAt:    doc.data().report.generatedAt,
          }
        : null,
    }));

    // Batch-fetch usernames for all unique userIds
    const uniqueIds = [...new Set(sessions.map(s => s.userId).filter(Boolean))];
    const userDocs = await Promise.all(
      uniqueIds.map(id => firestore.collection('users').doc(id).get())
    );
    const nameMap = Object.fromEntries(
      userDocs.map(doc => [doc.id, doc.exists ? doc.data().name : null])
    );

    res.json(sessions.map(s => ({ ...s, username: nameMap[s.userId] ?? null })));
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch sessions", error: err.message });
  }
};

// ===== USER ACTIVITY (login history) =====
export const getActivity = async (req, res) => {
  try {
    const snap = await firestore
      .collection('activityLogs')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const logs = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.()?.getTime() ?? doc.data().timestamp,
    }));

    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch activity", error: err.message });
  }
};

// ===== CLAUDE TOKEN USAGE =====
export const getTokenUsage = async (req, res) => {
  try {
    const doc = await firestore.collection('meta').doc('tokenUsage').get();
    res.json(doc.exists ? doc.data() : { totalInputTokens: 0, totalOutputTokens: 0, totalReports: 0 });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch token usage", error: err.message });
  }
};
