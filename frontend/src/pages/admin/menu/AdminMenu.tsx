import type { AdminView } from "../types";

interface AdminMenuProps {
  onSelect: (view: AdminView) => void;
}

const AdminMenu: React.FC<AdminMenuProps> = ({ onSelect }) => {
  return (
    <div className="admin-menu">
      <button onClick={() => onSelect("stats")}>📊 סטטיסטיקות</button>
      <button onClick={() => onSelect("events")}>⚡ ניהול אירועים</button>
      <button onClick={() => onSelect("users")}>👤 ניהול משתמשים</button>
      <button onClick={() => onSelect("settings")}>⚙️ הגדרות מערכת</button>
    </div>
  );
};

export default AdminMenu;
