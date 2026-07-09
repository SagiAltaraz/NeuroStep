import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, Search, ChevronLeft } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import "./TrendsUserList.css";

interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}

interface Props {
  onBack: () => void;
}

/**
 * TrendsUserList — a clean, single-purpose picker for the "Trends" section.
 *
 * Unlike the full Users management view, this shows only what you need to pick
 * whose cognitive trend to open: name, email, role. Clicking a row goes straight
 * to that user's trend page. No edit / promote / delete / file actions.
 */
const TrendsUserList: React.FC<Props> = ({ onBack }) => {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load users");
        setUsers(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading users");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
    );
  }, [users, query]);

  const initial = (name: string) => (name?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="trends-list" dir="rtl">
      <div className="trends-list-head">
        <button className="trends-back-btn" onClick={onBack}>
          <ChevronLeft size={16} />
          <span>חזרה</span>
        </button>
        <h2 className="trends-list-title">
          <TrendingUp size={20} /> מגמות קוגניטיביות
        </h2>
      </div>

      <p className="trends-list-sub">בחרו משתמש כדי לראות את המגמה הקוגניטיבית שלו</p>

      <div className="trends-search">
        <Search size={16} />
        <input
          type="text"
          placeholder="חיפוש לפי שם או אימייל…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && <div className="trends-state">טוען משתמשים…</div>}
      {error && <div className="trends-state trends-state--error">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="trends-state">לא נמצאו משתמשים</div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="trends-users">
          {filtered.map((u) => (
            <li key={u.id}>
              <button
                className="trends-user-row"
                onClick={() => navigate(`/admin/users/${u.id}/trend`)}
                title={`צפה במגמה של ${u.name}`}
              >
                <span className="trends-user-avatar">{initial(u.name)}</span>
                <span className="trends-user-info">
                  <span className="trends-user-name">{u.name || "—"}</span>
                  <span className="trends-user-email">{u.email}</span>
                </span>
                {u.role === "admin" && <span className="trends-user-badge">מנהל</span>}
                <TrendingUp className="trends-user-cta" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TrendsUserList;
