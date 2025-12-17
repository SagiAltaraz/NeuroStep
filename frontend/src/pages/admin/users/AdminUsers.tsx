// src/pages/admin/users/AdminUsers.tsx
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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });

  useEffect(() => {
    if (!token) {
      setError("Not authenticated – missing token");
      setLoading(false);
      return;
    }

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
      } catch (err: any) {
        setError(err.message || "Error loading users");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [token]);

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
    } catch (err) {
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
        method: "PATCH",
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
    } catch (err) {
      alert("Error updating user");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", email: "" });
  };

  if (loading) return <div className="admin-view-page"><h2>User Management</h2><p>Loading users...</p></div>;
  if (error) return <div className="admin-view-page"><h2>User Management</h2><p className="error">Error: {error}</p></div>;

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>User Management</h2>
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr><td colSpan={4} className="no-users">No users found</td></tr>
          ) : (
            users.map((user) => (
              <tr key={user._id}>
                <td>
                  {editingId === user._id ? (
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} autoFocus />
                  ) : (
                    user.name
                  )}
                </td>
                <td>
                  {editingId === user._id ? (
                    <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                  ) : (
                    user.email
                  )}
                </td>
                <td>
                  <span className={`role-badge ${user.role}`}>
                    {user.role === "admin" ? "Admin" : "User"}
                  </span>
                </td>
                <td className="actions">
                  <button className="role-btn" onClick={() => toggleRole(user)}>
                    {user.role === "admin" ? "Demote" : "Promote"}
                  </button>
                  {editingId === user._id ? (
                    <>
                      <button className="save-btn" onClick={saveEdit}>Save</button>
                      <button className="cancel-btn" onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <button className="edit-btn" onClick={() => startEdit(user)}>Edit</button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AdminUsers;