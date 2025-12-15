import { useState } from "react";
import type { AdminView } from "./types";
import { useAuth } from "../../context/AuthContext"; 
import { Navigate } from "react-router-dom"; 

import AdminMenu from "./menu/AdminMenu";
import AdminStats from "./stats//AdminStats";
import AdminEvents from "./events/AdminEvents";
import AdminUsers from "./users/AdminUsers";
import AdminSettings from "./settings/AdminSettings";

const AdminPage: React.FC = () => {
  const { isAdmin } = useAuth();  
  const [activeView, setActiveView] = useState<AdminView | null>(null);

  if (!isAdmin) {  
    return <Navigate to="/" />;
  }

  const renderView = () => {
    switch (activeView) {
      case "stats":
        return <AdminStats />;
      case "events":
        return <AdminEvents />;
      case "users":
        return <AdminUsers />;
      case "settings":
        return <AdminSettings />;
      default:
        return <p>בחר פעולה מהתפריט</p>;
    }
  };

  return (
    <div className="admin-page">
      <h1>Admin Dashboard</h1>
      <AdminMenu onSelect={setActiveView} />
      <div className="admin-content">{renderView()}</div>
    </div>
  );
};

export default AdminPage;