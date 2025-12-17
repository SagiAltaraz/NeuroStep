// src/pages/admin/AdminPage.tsx
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Navigate } from "react-router-dom";

import AdminStats from "./stats/AdminStats";
import AdminEvents from "./events/AdminEvents";
import AdminUsers from "./users/AdminUsers";
import AdminSettings from "./settings/AdminSettings";

import "./AdminPage.css";

type AdminView = "stats" | "events" | "users" | "settings";

const AdminPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const [activeView, setActiveView] = useState<AdminView | null>(null);

  if (!isAdmin) return <Navigate to="/" />;

  const handleBack = () => setActiveView(null);

  const renderView = () => {
    if (!activeView) {
      return (
        <div className="admin-grid">
          <button className="admin-card" onClick={() => setActiveView("stats")}>
            📊 <span>Statistics</span>
          </button>
          <button className="admin-card" onClick={() => setActiveView("events")}>
            📅 <span>Events</span>
          </button>
          <button className="admin-card" onClick={() => setActiveView("users")}>
            👥 <span>Users</span>
          </button>
          <button className="admin-card" onClick={() => setActiveView("settings")}>
            ⚙️ <span>Settings</span>
          </button>
        </div>
      );
    }

    switch (activeView) {
      case "stats":
        return <AdminStats onBack={handleBack} />;
      case "events":
        return <AdminEvents onBack={handleBack} />;
      case "users":
        return <AdminUsers onBack={handleBack} />;
      case "settings":
        return <AdminSettings onBack={handleBack} />;
    }
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Admin Dashboard</h1>
      <div className="admin-content">{renderView()}</div>
    </div>
  );
};

export default AdminPage;