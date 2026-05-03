import { userFirebaseService } from "../services/user.js";
import { generateToken } from "../utils/jwt.js";
import { firebaseAuth, firestore } from "../config/firebase.js";

async function recordActivity(userId, name, email, method) {
  try {
    await firestore.collection('activityLogs').add({
      userId, name, email, method,
      timestamp: new Date(),
    });
    await firestore.collection('users').doc(userId).update({
      lastLoginAt: new Date(),
    });
  } catch { /* non-blocking */ }
}

// ===== SIGNUP =====
export const signup = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const user = await userFirebaseService.createUser({
      name,
      email,
      password,
      role: "user"
    });

    const token = generateToken(user);

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (err) {
    if (err.message === "User already exists") {
      return res.status(400).json({ message: "User already exists" });
    }
    return res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

// ===== LOGIN =====
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await userFirebaseService.verifyPassword(email, password);

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);
    recordActivity(user.id, user.name, user.email, 'email');

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (err) {
    return res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

// ===== LOGOUT =====
export const logout = async (req, res) => {
  return res.status(200).json({ message: "Logged out successfully" });
};

// ===== GOOGLE AUTH =====
export const googleAuth = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: "ID token is required" });
  }

  try {
    // Verify the Firebase ID token
    const decodedToken = await firebaseAuth.verifyIdToken(idToken);
    const { email, name, uid } = decodedToken;

    if (!email) {
      return res.status(400).json({ message: "Email not found in Google account" });
    }

    // Check if user already exists
    let user = await userFirebaseService.findByEmail(email);

    if (!user) {
      // Create new user with Google data (no password needed)
      user = await userFirebaseService.createGoogleUser({
        name: name || email.split("@")[0],
        email,
        googleUid: uid,
        role: "user"
      });
    }

    const token = generateToken(user);
    recordActivity(user.id, user.name, user.email, 'google');

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (err) {
    console.error("Google auth error:", err);
    return res.status(401).json({
      message: "Invalid Google token",
      error: err.message
    });
  }
};
