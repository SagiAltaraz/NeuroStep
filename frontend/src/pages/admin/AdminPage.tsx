// src/pages/admin/AdminPage.tsx
import { useAuth } from "../../context/AuthContext";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import AdminStats    from "./stats/AdminStats";
import AdminEvents   from "./events/AdminEvents";
import AdminUsers    from "./users/AdminUsers";
import AdminActivity from "./activity/AdminActivity";

import "./AdminPage.css";

type AdminView = "stats" | "events" | "users" | "activity";

const AdminPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  // The open section lives in the URL (?view=users) rather than in local state,
  // so returning from a per-user sub-route (trend / player-file / coach-reports)
  // via navigate(-1) lands back on the section you were in — not the main grid.
  const [searchParams, setSearchParams] = useSearchParams();

  if (!isAdmin) return <Navigate to="/" />;

  const activeView = searchParams.get("view") as AdminView | null;
  const openView = (view: AdminView) => setSearchParams({ view });
  const handleBack = () => setSearchParams({});

  const renderView = () => {
    if (!activeView) {
      return (
        <div className="admin-grid">
          <button className="admin-card" onClick={() => openView("stats")}>
            📊 <span>Statistics</span>
          </button>
          <button className="admin-card" onClick={() => navigate("/admin/alerts")}>
            🚨 <span>Alerts</span>
          </button>
          <button className="admin-card" onClick={() => openView("events")}>
            📅 <span>Events</span>
          </button>
          <button className="admin-card" onClick={() => openView("users")}>
            👥 <span>Users</span>
          </button>
          <button className="admin-card" onClick={() => openView("activity")}>
            🕒 <span>Activity</span>
          </button>
          {/* Cognitive trends live per-user; this opens the users list where each
              row has a "Trend" action (and the back button returns here). */}
          <button className="admin-card" onClick={() => openView("users")}>
            📈 <span>Trends</span>
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
      case "activity":
        return <AdminActivity onBack={handleBack} />;
      default:
        return null;
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
