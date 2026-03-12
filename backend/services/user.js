import { firestore } from '../config/firebase.js';
import bcrypt from 'bcryptjs';

const USERS_COLLECTION = 'users';

/**
 * User Service - Firestore + bcrypt
 *
 * Schema:
 * - id: string (Firestore auto-generated)
 * - name: string
 * - email: string (unique)
 * - password: string (bcrypt hash)
 * - role: 'user' | 'admin'
 * - personalizationAnswers: object | null
 * - personalizationPrompt: string | null
 * - profileCompletedAt: Date | null
 * - createdAt: Date
 * - updatedAt: Date
 */
export const userFirebaseService = {
  /**
   * יצירת משתמש חדש
   */
  async createUser({ name, email, password, role = 'user' }) {
    if (!firestore) {
      throw new Error('Firebase not initialized');
    }

    // בדיקה אם המשתמש קיים
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // נתוני המשתמש
    const userData = {
      name,
      email,
      password: hashedPassword,
      role,
      personalizationAnswers: null,
      personalizationPrompt: null,
      profileCompletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // יצירה עם ID אוטומטי של Firestore
    const docRef = await firestore.collection(USERS_COLLECTION).add(userData);

    return {
      id: docRef.id,
      ...userData,
    };
  },

  /**
   * יצירת משתמש חדש דרך Google (ללא סיסמה)
   */
  async createGoogleUser({ name, email, googleUid, role = 'user' }) {
    if (!firestore) {
      throw new Error('Firebase not initialized');
    }

    // נתוני המשתמש
    const userData = {
      name,
      email,
      password: null, // אין סיסמה למשתמשי Google
      googleUid,
      role,
      personalizationAnswers: null,
      personalizationPrompt: null,
      profileCompletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // יצירה עם ID אוטומטי של Firestore
    const docRef = await firestore.collection(USERS_COLLECTION).add(userData);

    return {
      id: docRef.id,
      ...userData,
    };
  },

  /**
   * חיפוש משתמש לפי email
   */
  async findByEmail(email) {
    if (!firestore) {
      throw new Error('Firebase not initialized');
    }

    const snapshot = await firestore
      .collection(USERS_COLLECTION)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    };
  },

  /**
   * חיפוש משתמש לפי ID
   */
  async findById(userId) {
    if (!firestore) {
      throw new Error('Firebase not initialized');
    }

    const doc = await firestore.collection(USERS_COLLECTION).doc(userId).get();

    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
    };
  },

  /**
   * עדכון משתמש
   */
  async updateUser(userId, updates) {
    if (!firestore) {
      throw new Error('Firebase not initialized');
    }

    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    await firestore.collection(USERS_COLLECTION).doc(userId).update(updateData);

    return this.findById(userId);
  },

  /**
   * עדכון personalization
   */
  async updatePersonalization(userId, { answers, prompt }) {
    return this.updateUser(userId, {
      personalizationAnswers: answers,
      personalizationPrompt: prompt,
      profileCompletedAt: new Date(),
    });
  },

  /**
   * אימות סיסמה (login)
   */
  async verifyPassword(email, password) {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return null;
    }

    return user;
  },

  /**
   * שליפת כל המשתמשים
   */
  async findAll() {
    if (!firestore) {
      throw new Error('Firebase not initialized');
    }

    const snapshot = await firestore.collection(USERS_COLLECTION).get();

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  },

  /**
   * מחיקת משתמש
   */
  async deleteUser(userId) {
    if (!firestore) {
      throw new Error('Firebase not initialized');
    }

    await firestore.collection(USERS_COLLECTION).doc(userId).delete();

    return true;
  },
};

export default userFirebaseService;
