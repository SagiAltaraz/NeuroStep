import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import "./AdminUsers.css";

interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt?: string;
  updatedAt?: string;
}

interface AdminUsersProps {
  onBack: () => void;
}

const AdminUsers: React.FC<AdminUsersProps> = ({ onBack }) => {
  const { token, user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "email" | "role" | "date">("date");

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

  const filteredAndSortedUsers = useMemo(() => {
    let result = users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    result.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "email":
          return a.email.localeCompare(b.email);
        case "role":
          return a.role.localeCompare(b.role);
        case "date":
        default:
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
    });

    return result;
  }, [users, searchTerm, sortBy]);

  const toggleRole = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert("You cannot change your own role");
      return;
    }

    const newRole = user.role === "admin" ? "user" : "admin";
    const action = newRole === "admin" ? "promote" : "demote";

    if (!confirm(`Are you sure you want to ${action} "${user.name}" to ${newRole}?`)) {
      return;
    }

    try {
      setActionLoading(user.id);
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      const updatedUser = await res.json();
      setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    } catch {
      alert("Error updating role");
    } finally {
      setActionLoading(null);
    }
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm({ name: user.name, email: user.email });
  };

  const saveEdit = async () => {
    if (!editingId) return;

    if (!editForm.name.trim() || !editForm.email.trim()) {
      alert("Name and email are required");
      return;
    }

    try {
      setActionLoading(editingId);
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
      setUsers(users.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
      setEditingId(null);
    } catch {
      alert("Error updating user");
    } finally {
      setActionLoading(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", email: "" });
  };

  const deleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert("You cannot delete your own account");
      return;
    }

    if (!confirm(`Are you sure you want to delete "${user.name}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      setActionLoading(user.id);
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete user");
      setUsers(users.filter((u) => u.id !== user.id));
    } catch {
      alert("Error deleting user");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="admin-users">
        <div className="users-header">
          <h2>User Management</h2>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <span>Loading users...</span>
        </div>
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
        <div className="error-state">
          <span>{error}</span>
          <button onClick={fetchUsers} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-users">
      <div className="users-header">
        <h2>User Management</h2>
        <button className="back-btn" onClick={onBack}>Back</button>
      </div>

      <div className="users-toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search" onClick={() => setSearchTerm("")}>
              ×
            </button>
          )}
        </div>
        <div className="sort-box">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">Join Date</option>
            <option value="name">Name</option>
            <option value="email">Email</option>
            <option value="role">Role</option>
          </select>
        </div>
      </div>

      <div className="users-stats">
        <span className="stat-item">
          <strong>{users.length}</strong> total users
        </span>
        <span className="stat-item">
          <strong>{users.filter(u => u.role === "admin").length}</strong> admins
        </span>
        <span className="stat-item">
          <strong>{users.filter(u => u.role === "user").length}</strong> users
        </span>
        {searchTerm && (
          <span className="stat-item search-result">
            <strong>{filteredAndSortedUsers.length}</strong> found
          </span>
        )}
      </div>

      {filteredAndSortedUsers.length === 0 ? (
        <div className="empty-state">
          {searchTerm ? `No users found matching "${searchTerm}"` : "No users found"}
        </div>
      ) : (
        <div className="users-list">
          {filteredAndSortedUsers.map((user) => (
            <div
              key={user.id}
              className={`user-card ${user.id === currentUser?.id ? "current-user" : ""} ${actionLoading === user.id ? "loading" : ""}`}
            >
              <div className="user-info">
                <div className="user-avatar">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="user-details">
                  {editingId === user.id ? (
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
                      <span className="user-name">
                        {user.name}
                        {user.id === currentUser?.id && <span className="you-badge">(You)</span>}
                      </span>
                      <span className="user-email">{user.email}</span>
                      <span className="user-joined">Joined {formatDate(user.createdAt)}</span>
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
                {editingId === user.id ? (
                  <>
                    <button
                      className="btn btn-save"
                      onClick={saveEdit}
                      disabled={actionLoading === user.id}
                    >
                      {actionLoading === user.id ? "Saving..." : "Save"}
                    </button>
                    <button className="btn btn-cancel" onClick={cancelEdit}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-trend"
                      onClick={() => navigate(`/admin/users/${user.id}/trend`)}
                      title="View cognitive score trend"
                    >
                      Trend
                    </button>
                    <button
                      className="btn btn-role"
                      onClick={() => toggleRole(user)}
                      disabled={actionLoading === user.id || user.id === currentUser?.id}
                      title={user.id === currentUser?.id ? "Cannot change your own role" : ""}
                    >
                      {user.role === "admin" ? "Demote" : "Promote"}
                    </button>
                    <button
                      className="btn btn-edit"
                      onClick={() => startEdit(user)}
                      disabled={actionLoading === user.id}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-delete"
                      onClick={() => deleteUser(user)}
                      disabled={actionLoading === user.id || user.id === currentUser?.id}
                      title={user.id === currentUser?.id ? "Cannot delete your own account" : ""}
                    >
                      {actionLoading === user.id ? "..." : "Delete"}
                    </button>
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
