import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { notificationActionLabel, notificationTarget } from "./notificationRoutes";
import "./PortalNotificationBell.css";

export default function PortalNotificationBell({ role }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const rootRef = useRef(null);
  const fetchLock = useRef(false);
  const load = useCallback(async () => {
    if (fetchLock.current) return;
    fetchLock.current = true;
    setLoading(true);
    try {
      const [p, a] = await Promise.all([api("/user-notifications"), api("/platform-notifications/mine")]);
      const merged = [
        ...(p.notifications || []).map(n => ({ ...n, source: "personal" })),
        ...(a.notifications || []).map(n => ({ ...n, source: "announcement" })),
      ].sort((x,y) => new Date(y.createdAt || 0) - new Date(x.createdAt || 0));
      setItems(merged);
      setUnread(Number(p.unreadCount || 0) + Number(a.unreadCount || 0));
      setError("");
    } catch (e) { setError(e.message || "Unable to load notifications"); }
    finally { setLoading(false); fetchLock.current = false; }
  }, []);
  useEffect(() => {
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    const onUpdate = () => load();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("goyalnest:notifications-updated", onUpdate);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("goyalnest:notifications-updated", onUpdate); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const outside = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const escape = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function markRead(item) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await api(item.source === "personal" ? `/user-notifications/${item.id}/read` : `/platform-notifications/${item.id}/read`, { method: "POST" });
      await load();
    } catch (e) { setError(e.message || "Could not update notification"); }
    finally { setBusyId(null); }
  }
  function goTo(item) {
    setOpen(false);
    navigate(item.source === "personal" ? notificationTarget(item.type, role) : "/dashboard/notifications");
  }
  return <div className="gn-bell" ref={rootRef}>
    <button type="button" className="gn-bell-trigger" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen(v => !v); load(); }}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
      {unread > 0 && <span className="gn-bell-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <section className="gn-bell-panel" role="dialog" aria-label="Recent notifications">
      <header className="gn-bell-panel-head"><div><strong>Notifications</strong><small>{unread} unread</small></div><button type="button" className="gn-bell-close" onClick={() => setOpen(false)} aria-label="Close notifications">×</button></header>
      {error && <p role="alert" className="gn-bell-error">{error}</p>}
      {loading && !items.length && <div className="gn-bell-empty">Loading notifications…</div>}
      {!loading && !items.length && <div className="gn-bell-empty">No notifications yet.</div>}
      <div className="gn-bell-items">{items.slice(0,7).map(item => <article key={`${item.source}-${item.id}`} className={`gn-bell-item ${item.readAt ? "is-read" : "is-unread"}`}>
        <div className="gn-bell-item-top"><strong>{item.title || "Notification"}</strong>{!item.readAt && <span className="gn-bell-new">New</span>}</div>
        <p>{item.message}</p>
        <div className="gn-bell-item-actions"><button type="button" className="gn-bell-view" onClick={() => goTo(item)}>{item.source === "announcement" ? "View announcement" : notificationActionLabel(item.type,role)} →</button>
        {!item.readAt && <button type="button" className="gn-bell-mark" disabled={Boolean(busyId)} onClick={() => markRead(item)}>{busyId === item.id ? "Updating…" : "Mark read"}</button>}</div>
      </article>)}</div>
      <button type="button" className="gn-bell-all" onClick={() => { setOpen(false); navigate("/dashboard/notifications"); }}>View all notifications →</button>
    </section>}
  </div>;
}
