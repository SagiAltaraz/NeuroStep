// src/pages/admin/settings/AdminSettings.tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";

// The product name is a fixed constant — shown read-only, never editable.
const SITE_NAME = "NeuroStep";

interface Settings {
  emailNotifications: boolean;
  maintenanceMode: boolean;
}

const AdminSettings: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { token } = useAuth();
  const [settings, setSettings] = useState<Settings>({
    emailNotifications: true,
    maintenanceMode: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  // Load the persisted settings on mount.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setSettings({
            emailNotifications: !!data.emailNotifications,
            maintenanceMode: !!data.maintenanceMode,
          });
        }
      } catch {
        /* keep defaults on failure */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>System Settings</h2>
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      {loading ? (
        <p className="stats-loading">Loading settings…</p>
      ) : (
        <div className="settings-form">
          <div className="settings-readonly">
            <span className="settings-readonly-label">Site Name</span>
            <span className="settings-readonly-value">{SITE_NAME}</span>
          </div>

          <label>
            <input
              type="checkbox"
              checked={settings.emailNotifications}
              onChange={(e) => {
                setSettings({ ...settings, emailNotifications: e.target.checked });
                setStatus("idle");
              }}
            />
            Enable Email Notifications
          </label>

          <label>
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={(e) => {
                setSettings({ ...settings, maintenanceMode: e.target.checked });
                setStatus("idle");
              }}
            />
            Maintenance Mode
          </label>

          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </button>

          {status === "saved" && <p className="settings-status ok">✓ Settings saved</p>}
          {status === "error" && (
            <p className="settings-status err">Failed to save — try again</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
