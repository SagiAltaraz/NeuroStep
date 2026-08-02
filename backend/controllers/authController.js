import { userFirebaseService } from "../services/user.js";
import { generateToken } from "../utils/jwt.js";
import { firebaseAuth, firestore } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Record one entry into the system for the admin activity log.
 *
 * Every way IN gets logged — including 'signup', which used to be missed
 * entirely, so a brand-new account was invisible in the log until its owner
 * happened to log in a second time.
 *
 * The two writes are independent (a failed counter must not cost us the log
 * row) and BOTH are awaited: a fire-and-forget write can be lost when the
 * process recycles right after responding, and that is exactly the "the log
 * isn't updating" symptom. Failures are logged, never swallowed — a silent
 * catch here is why a broken audit log can look like an empty one for weeks.
 */
async function recordActivity(userId, name, email, method) {
  const timestamp = new Date();

  const results = await Promise.allSettled([
    firestore.collection('activityLogs').add({ userId, name, email, method, timestamp }),
    // set+merge, not update: a user doc that is missing (or was written by an
    // older flow) must still get its counters instead of throwing.
    firestore.collection('users').doc(userId).set(
      { lastLoginAt: timestamp, loginCount: FieldValue.increment(1) },
      { merge: true },
    ),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(
        `[Activity] ${method} entry for ${userId} failed:`,
        result.reason?.message ?? result.reason,
      );
    }
  }
}

// ===== SIGNUP =====
export const signup = async (req, res) => {
  const { name, email, password, language } = req.body;

  try {
    const user = await userFirebaseService.createUser({
      name,
      email,
      password,
      role: "user",
      language,
    });

      const token = generateToken(user);
    await recordActivity(user.id, user.name, user.email, 'signup');

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language ?? 'he',
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
         return res.status(400).json({ message: 'Invalid credentials' });
      }

    const token = generateToken(user);
    await recordActivity(user.id, user.name, user.email, 'email');

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language ?? 'he',
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
   return res.status(200).json({ message: 'Logged out successfully' });
};

// ===== GOOGLE AUTH =====
export const googleAuth = async (req, res) => {
   const { idToken } = req.body;

   if (!idToken) {
      return res.status(400).json({ message: 'ID token is required' });
   }

   try {
      // Verify the Firebase ID token
      const decodedToken = await firebaseAuth.verifyIdToken(idToken);
      const { email, name, uid } = decodedToken;

      if (!email) {
         return res
            .status(400)
            .json({ message: 'Email not found in Google account' });
      }

      // Check if user already exists
      let user = await userFirebaseService.findByEmail(email);

      if (!user) {
         // Create new user with Google data (no password needed)
         user = await userFirebaseService.createGoogleUser({
            name: name || email.split('@')[0],
            email,
            googleUid: uid,
            role: 'user',
         });
      }

    const token = generateToken(user);
    await recordActivity(user.id, user.name, user.email, 'google');

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language ?? 'he',
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
