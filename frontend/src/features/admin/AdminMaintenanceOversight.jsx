import "./AdminPolish.css";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function AdminMaintenanceOversight() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const result = await api("/admin-maintenance/overview");
      setData(result);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function review(ticket) {
    setSelected(ticket);
    setForm({
      priority: ticket.priority,
      assignedToId: ticket.assignedToId || "",
      dueAt: ticket.slaConfigured && ticket.dueAt
        ? new Date(ticket.dueAt).toISOString().slice(0, 16)
        : "",
      escalated: ticket.escalated,
      adminNotes: ticket.adminNotes || "",
    });
    setError("");
    setMessage("");
    window.requestAnimationFrame(() => document.getElementById("gn-maintenance-review")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function save() {
    if (!selected) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api(
        `/admin-maintenance/${selected.id}`,
        {
          method: "PATCH",
          body: {
            priority: form.priority,
            assignedToId: form.assignedToId || null,
            dueAt: form.dueAt
              ? new Date(form.dueAt).toISOString()
              : null,
            escalated: Boolean(form.escalated),
            adminNotes: form.adminNotes || "",
          },
        }
      );

      setMessage(result.message);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tickets = (data?.tickets || []).filter(t => {
    if (filter === "ALL") return true;
    if (filter === "OVERDUE") return t.overdue;
    if (filter === "ESCALATED") return t.escalated;
    if (filter === "OPEN") {
      return !["RESOLVED", "CLOSED"].includes(t.status);
    }
    return t.status === filter;
  });

  return (
    <div className="dashboard-grid gn-admin-polish gn-admin-maintenance">
      <section className="card" style={{ padding: 24 }}>
        <h2>Maintenance Oversight</h2>
        <p className="muted">
          Monitor maintenance requests, priorities,
          assignments, SLA deadlines and escalations.
        </p>

        {error && <p className="error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}

        {data && (
          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}>
            {Object.entries(data.summary).map(([key, value]) => (
              <div key={key} style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 14,
              }}>
                <p className="muted">
                  {key.replace(/([A-Z])/g, " $1")}
                </p>
                <h3>{value}</h3>
              </div>
            ))}
          </div>
        )}

        <div style={{
          display: "flex",
          gap: 12,
          marginBottom: 18,
        }}>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            <option value="ALL">All Tickets</option>
            <option value="OPEN">Open Tickets</option>
            <option value="OVERDUE">Overdue SLA</option>
            <option value="ESCALATED">Escalated</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          <button className="btn outline" onClick={load}>
            Refresh
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr>
                <th>Issue</th>
                <th>Property</th>
                <th>Priority</th>
                <th>Manager</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {tickets.map(t => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  <td>{t.property}</td>
                  <td><span className={`gn-admin-pill gn-admin-pill--${String(t.priority || "").toLowerCase()}`}>{t.priority}</span></td>
                  <td>{t.assignedToName || "Unassigned"}</td>
                  <td><span className={`gn-admin-pill gn-admin-pill--${String(t.status || "").toLowerCase()}`}>{t.status}</span></td>
                  <td>
                    {t.overdue
                      ? "OVERDUE"
                      : t.dueAt ? new Date(t.dueAt).toLocaleDateString("en-IN") : "Not set"}
                    {!t.slaConfigured && " (Default)"}
                  </td>
                  <td>
                    <button
                      className="btn outline"
                      onClick={() => review(t)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.isSnapshotLimited && (
          <p className="muted">
            Showing latest 200 tickets only.
          </p>
        )}
      </section>

      {selected && (
        <section id="gn-maintenance-review" className="card gn-admin-review-panel" style={{ padding: 24 }}>
          <h2>Maintenance Review</h2>

          <h3>{selected.title}</h3>
          <p>{selected.description}</p>
          <p>Tenant: {selected.tenant}</p>
          <p>Property: {selected.property}</p>
          <p>Room: {selected.room}</p>
          <p>Status: {selected.status}</p>

          {["RESOLVED", "CLOSED"].includes(selected.status) ? (
            <p className="muted">
              Resolved tickets are read-only.
            </p>
          ) : (
            <div style={{
              display: "grid",
              gap: 14,
              marginTop: 20,
            }}>
              <label>
                Priority
                <select
                  value={form.priority}
                  onChange={e => setForm({
                    ...form,
                    priority: e.target.value,
                  })}
                >
                  {priorities.map(p => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label>
                Assigned Property Manager
                <select
                  value={form.assignedToId}
                  onChange={e => setForm({
                    ...form,
                    assignedToId: e.target.value,
                  })}
                >
                  <option value="">Unassigned</option>
                  {selected.availableManagers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                SLA Deadline
                <input
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={e => setForm({
                    ...form,
                    dueAt: e.target.value,
                  })}
                />
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={Boolean(form.escalated)}
                  onChange={e => setForm({
                    ...form,
                    escalated: e.target.checked,
                  })}
                />
                {" "}Escalate to Admin
              </label>

              <label>
                Admin Notes
                <textarea
                  rows={4}
                  maxLength={1000}
                  value={form.adminNotes}
                  onChange={e => setForm({
                    ...form,
                    adminNotes: e.target.value,
                  })}
                />
              </label>

              <button
                className="btn primary"
                disabled={busy}
                onClick={save}
              >
                {busy ? "Saving..." : "Save Oversight"}
              </button>
            </div>
          )}

          <button
            className="btn outline"
            onClick={() => setSelected(null)}
            style={{ marginTop: 14 }}
          >
            Close
          </button>
        </section>
      )}
    </div>
  );
}
