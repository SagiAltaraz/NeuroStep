// src/pages/admin/settings/AdminSettings.tsx
import { useState } from "react";

const AdminSettings: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [settings, setSettings] = useState({
    siteName: "NeuroStep",
    emailNotifications: true,
    maintenanceMode: false,
  });

  const handleSave = () => {
    alert("Settings saved successfully!");
  };

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>System Settings</h2>
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="settings-form">
        <label>
          Site Name
          <input
            type="text"
            value={settings.siteName}
            onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={settings.emailNotifications}
            onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
          />
          Enable Email Notifications
        </label>

        <label>
          <input
            type="checkbox"
            checked={settings.maintenanceMode}
            onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
          />
          Maintenance Mode
        </label>

        <button className="save-btn" onClick={handleSave}>
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default AdminSettings;