import React from "react";
import "./AdminStats.css"; // create this file or add to global

const AdminStats: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  // Mock data - replace with real API fetch
  const stats = {
    totalUsers: 142,
    activeUsers: 89,
    totalEvents: 34,
    revenue: "$12,450",
  };

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>Statistics Overview</h2>
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Users</h3>
          <p className="stat-number">{stats.totalUsers}</p>
        </div>
        <div className="stat-card">
          <h3>Active Users</h3>
          <p className="stat-number">{stats.activeUsers}</p>
        </div>
        <div className="stat-card">
          <h3>Total Events</h3>
          <p className="stat-number">{stats.totalEvents}</p>
        </div>
        <div className="stat-card">
          <h3>Revenue</h3>
          <p className="stat-number">{stats.revenue}</p>
        </div>
      </div>
    </div>
  );
};

export default AdminStats;