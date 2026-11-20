
import React, { useEffect, useState } from "react";
import "../admin/AdminPolish.css";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { notificationTarget, notificationActionLabel, notificationNeedsAction } from "./notificationRoutes";

export default function NotificationInbox() {
  const { user } = useAuth();
  const role = user?.role;
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  async function load() {
    try {
      const [announcements, personal] = await Promise.all([
        api("/platform-notifications/mine"),
        api("/user-notifications"),
      ]);
      const all = [
        ...(announcements.notifications || []).map(n => ({ ...n, source: "announcement" })),
        ...(personal.notifications || []).map(n => ({ ...n, source: "personal" })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setItems(all);
      setUnread((announcements.unreadCount || 0) + (personal.unreadCount || 0));
      window.dispatchEvent(new Event("goyalnest:notifications-updated"));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  async function markRead(item) {
    setBusy(item.id);

    try {
      await api(item.source === "personal"
        ? `/user-notifications/${item.id}/read`
        : `/platform-notifications/${item.id}/read`, {
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const visible = items.filter(item => filter === "ALL" || (filter === "UNREAD" && !item.readAt) || (filter === "ACTION" && notificationNeedsAction(item, role)));

  return (
    <section className="gn-admin-polish gn-notification-inbox card" aria-label="Personal notification inbox">
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}>
        <div>
          <div className="gn-admin-eyebrow">PERSONAL INBOX</div>
          <h2>My Notifications</h2>
          <p className="muted">
            {unread} unread notification(s)
          </p>
        </div>

        <button
          type="button"
          className="btn outline"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="gn-admin-toolbar gn-inbox-filters" role="group" aria-label="Filter notifications">
        {[['ALL','All'],['UNREAD','Unread'],['ACTION','Action related']].map(([key, label]) => <button key={key} type="button" className={filter === key ? "btn primary" : "btn outline"} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      {visible.length === 0 && <p className="gn-inbox-empty">{items.length === 0 ? "No notifications yet. New business events will appear here." : "No notifications match this filter."}</p>}

      {visible.map(item => (
        <article
          key={item.id}
          className={`record gn-inbox-item ${item.readAt ? "gn-inbox-read" : "gn-inbox-unread"}`}
          style={{ display: "block" }}
        >
          <strong>
            {item.readAt ? "" : "● "}
            {item.title}
          </strong>

          <p>{item.message}</p>

          <p className="muted">
            {new Date(item.createdAt).toLocaleString("en-IN")}
          </p>

          {item.source === 'personal' && (
            <Link className="btn primary gn-notice-open" to={notificationTarget(item.type, role)}>
              {notificationActionLabel(item.type, role)} →
            </Link>
          )}
          {!item.readAt && (
            <button
              type="button"
              className="btn outline"
              disabled={Boolean(busy)}
              onClick={() => markRead(item)}
            >
              {busy === item.id
                ? "Updating..."
                : "Mark as Read"}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
