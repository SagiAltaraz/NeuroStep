import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import "./AdminUsers.css";

interface User {
  _id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}

interface AdminUsersProps {
  onBack: () => void;
}

const AdminUsers: React.FC<AdminUsersProps> = ({ onBack }) => {
  const { token } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });

  useEffect(() => {
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load users");
      const data: User[] = await res.json();
      setUsers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading users");
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = async (user: User) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    try {
      const res = await fetch(`/api/admin/users/${user._id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      const updatedUser = await res.json();
      setUsers(users.map((u) => (u._id === updatedUser._id ? updatedUser : u)));
    } catch {
      alert("Error updating role");
    }
  };

  const startEdit = (user: User) => {
    setEditingId(user._id);
    setEditForm({ name: user.name, email: user.email });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch(`/api/admin/users/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error("Failed to update user");
      const updatedUser = await res.json();
      setUsers(users.map((u) => (u._id === updatedUser._id ? updatedUser : u)));
      setEditingId(null);
    } catch {
      alert("Error updating user");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", email: "" });
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete "${user.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete user");
      setUsers(users.filter((u) => u._id !== user._id));
    } catch {
      alert("Error deleting user");
    }
  };

  if (loading) {
    return (
      <div className="admin-users">
        <div className="users-header">
          <h2>User Management</h2>
        </div>
        <div className="loading-state">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-users">
        <div className="users-header">
          <h2>User Management</h2>
          <button className="back-btn" onClick={onBack}>Back</button>
        </div>
        <div className="error-state">{error}</div>
      </div>
    );
  }

  return (
    <div className="admin-users">
      <div className="users-header">
        <h2>User Management</h2>
        <button className="back-btn" onClick={onBack}>Back</button>
      </div>

      <div className="users-stats">
        <span>{users.length} users</span>
        <span>{users.filter(u => u.role === "admin").length} admins</span>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">No users found</div>
      ) : (
        <div className="users-list">
          {users.map((user) => (
            <div key={user._id} className="user-card">
              <div className="user-info">
                <div className="user-avatar">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="user-details">
                  {editingId === user._id ? (
                    <div className="edit-fields">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Name"
                        autoFocus
                      />
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="Email"
                      />
                    </div>
                  ) : (
                    <>
                      <span className="user-name">{user.name}</span>
                      <span className="user-email">{user.email}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="user-role">
                <span className={`role-badge ${user.role}`}>
                  {user.role === "admin" ? "Admin" : "User"}
                </span>
              </div>

              <div className="user-actions">
                {editingId === user._id ? (
                  <>
                    <button className="btn btn-save" onClick={saveEdit}>Save</button>
                    <button className="btn btn-cancel" onClick={cancelEdit}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-role" onClick={() => toggleRole(user)}>
                      {user.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    <button className="btn btn-edit" onClick={() => startEdit(user)}>Edit</button>
                    <button className="btn btn-delete" onClick={() => deleteUser(user)}>Delete</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
