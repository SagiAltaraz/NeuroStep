import { userFirebaseService } from "../services/user.js";
import { generateToken } from "../utils/jwt.js";

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
