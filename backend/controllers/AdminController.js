import { userFirebaseService } from "../services/user.js";

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
