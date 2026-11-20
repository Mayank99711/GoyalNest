import "./AdminPolish.css";
import "../owner/MyProperties.css";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import NotificationInbox from "../notifications/NotificationInbox";

export default function AdminNotificationsRoles({
  page = "notifications",
}) {
  const notificationsPage = page === "notifications";

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetRole, setTargetRole] = useState("ALL");
  const [announcements, setAnnouncements] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [composeOpen,setComposeOpen] = useState(false);
  const [viewing,setViewing] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      if (notificationsPage) {
        const result = await api("/platform-notifications/admin");
        setAnnouncements(result.announcements || []);
      } else {
        const result = await api("/admin-operations/permissions");
        setPermissions(result.roles || []);
      }
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [notificationsPage]);

  async function publish(event) {
    event.preventDefault();

    if (!window.confirm(
      `Publish this announcement to ${targetRole}?`
    )) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const result = await api(
        "/platform-notifications/admin",
        {
          method: "POST",
          body: { title, message, targetRole },
        }
      );

      setSuccess(result.message);
      setTitle("");
      setMessage("");
      setComposeOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!notificationsPage) {
    return (
      <section className="card" style={{ padding: 24 }}>
        <h2>Roles & Permissions</h2>
        <p className="muted">
          Read-only overview of supported role capabilities.
        </p>

        {error && <p className="error">{error}</p>}

        <div style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginTop: 18,
        }}>
          {permissions.map(item => (
            <article
              key={item.role}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 18,
              }}
            >
              <h3>{item.role}</h3>
              <p className="muted">{item.description}</p>

              <ul>
                {item.permissions.map(permission => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="dashboard-grid gn-admin-polish gn-admin-notifications">
      <NotificationInbox />
      <section className="card" style={{ padding: 24 }}>
        <h2>Platform Notifications</h2>

        <p className="muted">
          Publish in-app announcements to selected user roles.
        </p>

        {error && <p className="error">{error}</p>}
        {success && <p role="status">{success}</p>}

        <button type="button" className="btn primary" onClick={()=>setComposeOpen(true)}>+ Create Notification</button>
      </section>

      <section className="card" style={{ padding: 24 }}>
        <h2>Published Announcements</h2>

        {announcements.length === 0 && (
          <p className="muted">No announcements yet.</p>
        )}

        <div style={{overflowX:"auto"}}><table style={{width:"100%"}}><thead><tr><th>Title</th><th>Audience</th><th>Published</th><th>Read by</th><th>Details</th></tr></thead><tbody>
          {announcements.map(a=><tr key={a.id}><td><strong>{a.title}</strong></td><td><span className="gn-admin-pill">{a.targetRole}</span></td><td>{new Date(a.createdAt).toLocaleString("en-IN")}</td><td>{a._count?.reads??0}</td><td><button className="btn outline" onClick={()=>setViewing(a)}>View Details</button></td></tr>)}
        </tbody></table></div>
      </section>
      {composeOpen&&<div className="gn-property-modal-backdrop"><section className="gn-property-modal" role="dialog" aria-modal="true" aria-label="Create platform notification"><header className="gn-property-modal-header"><h2>Create Notification</h2><button type="button" className="btn outline" onClick={()=>setComposeOpen(false)}>Close ×</button></header>
        <form
          onSubmit={publish}
          style={{ display: "grid", gap: 14 }}
        >
          <label>
            Notification Title
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              minLength={5}
              maxLength={120}
              required
              style={{ display: "block", width: "100%" }}
            />
          </label>

          <label>
            Message
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              minLength={10}
              maxLength={2000}
              required
              rows={4}
              style={{ display: "block", width: "100%" }}
            />
          </label>

          <label>
            Send To
            <select
              value={targetRole}
              onChange={e => setTargetRole(e.target.value)}
              style={{ display: "block", width: "100%" }}
            >
              {["ALL", "OWNER", "TENANT", "MANAGER", "ADMIN"]
                .map(role => (
                  <option key={role} value={role}>
                    {role === "ALL" ? "All Users" : role}
                  </option>
                ))}
            </select>
          </label>

          <button
            type="submit"
            className="btn primary"
            disabled={busy}
          >
            {busy ? "Publishing..." : "Publish Notification"}
          </button>
        </form>
</section></div>}
      {viewing&&<div className="gn-property-modal-backdrop"><section className="gn-property-modal" role="dialog" aria-modal="true" aria-label="Notification details"><header className="gn-property-modal-header"><h2>{viewing.title}</h2><button type="button" className="btn outline" onClick={()=>setViewing(null)}>Close ×</button></header><p>{viewing.message}</p><p className="muted">Audience: {viewing.targetRole}</p><p className="muted">Published: {new Date(viewing.createdAt).toLocaleString("en-IN")}</p><p className="muted">Read by: {viewing._count?.reads??0}</p></section></div>}
    </div>
  );
}
