
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await api(
        `/admin-operations/complaints?page=${page}`
      );

      setComplaints(result.complaints || []);
      setTotal(result.total || 0);
      setTotalPages(Math.max(1, result.totalPages || 1));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page]);

  async function resolveComplaint() {
    if (!selected || notes.trim().length < 10) {
      setError("Enter at least 10 characters in resolution notes.");
      return;
    }

    if (!window.confirm("Mark this complaint as resolved?")) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api(
        `/admin-operations/complaints/${selected.id}/resolve`,
        {
          method: "PATCH",
          body: { notes: notes.trim() },
        }
      );

      setMessage(result.message);
      setSelected(null);
      setNotes("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = complaints.filter(c => {
    if (filter === "ALL") return true;
    if (filter === "OPEN") return c.status !== "RESOLVED";
    return c.status === "RESOLVED";
  });

  return (
    <div className="dashboard-grid">
      <section className="card" style={{ padding: 24 }}>
        <h2>Complaints & Disputes</h2>
        <p className="muted">
          Platform-wide maintenance complaint monitoring.
          Financial and booking disputes are not included
          in this maintenance queue.
        </p>

        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
        }}>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ padding: 12 }}
          >
            <option value="ALL">All Complaints</option>
            <option value="OPEN">Unresolved</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          <button
            className="btn outline"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>

          <span>Total: {total}</span>
        </div>

        {error && <p role="alert" className="error">{error}</p>}
        {message && <p role="status">{message}</p>}
        {loading && <p>Loading complaints...</p>}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr>
                <th>Complaint</th>
                <th>Tenant</th>
                <th>Property</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td>{c.tenant}</td>
                  <td>{c.property}</td>
                  <td>{c.priority}</td>
                  <td>{c.status}</td>
                  <td>
                    <button
                      className="btn outline"
                      onClick={() => {
                        setSelected(c);
                        setNotes("");
                        setError("");
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <p className="muted">No matching complaints.</p>
        )}

        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginTop: 20,
        }}>
          <button
            className="btn outline"
            disabled={loading || page <= 1}
            onClick={() => {
              setSelected(null);
              setPage(p => p - 1);
            }}
          >
            Previous
          </button>

          <span>Page {page} of {totalPages}</span>

          <button
            className="btn outline"
            disabled={loading || page >= totalPages}
            onClick={() => {
              setSelected(null);
              setPage(p => p + 1);
            }}
          >
            Next
          </button>
        </div>
      </section>

      {selected && (
        <section className="card" style={{ padding: 24 }}>
          <h2>Complaint Review</h2>

          <p><strong>{selected.title}</strong></p>
          <p>{selected.description}</p>
          <p>Tenant: {selected.tenant}</p>
          <p>Property: {selected.property}</p>
          <p>Room: {selected.room}</p>
          <p>Status: {selected.status}</p>

          {selected.status !== "RESOLVED" && (
            <>
              <label>
                Resolution Notes
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 8,
                  }}
                />
              </label>

              <button
                className="btn primary"
                disabled={busy || notes.trim().length < 10}
                onClick={resolveComplaint}
                style={{ marginTop: 14 }}
              >
                {busy ? "Saving..." : "Resolve Complaint"}
              </button>
            </>
          )}

          <button
            className="btn outline"
            onClick={() => setSelected(null)}
            style={{ marginTop: 14, marginLeft: 10 }}
          >
            Close
          </button>
        </section>
      )}
    </div>
  );
}
