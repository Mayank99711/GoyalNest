import "./MaintenanceManagement.css";
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";

const statusLabels = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
};

export default function MaintenanceManagement() {
  const { user } = useAuth();

  const [tickets, setTickets] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [tenancyId, setTenancyId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isTenant = user?.role === "TENANT";
  const canManage = ["OWNER", "MANAGER"].includes(
    user?.role
  );

  async function load() {
    try {
      const results = await Promise.all([
        api("/maintenance"),
        ...(isTenant ? [api("/tenancies/mine")] : []),
      ]);

      setTickets(Array.isArray(results[0]) ? results[0] : []);

      if (isTenant) {
        const today = new Date();

const active = (results[1] || []).filter((t) => {
  if (t.status === "ACTIVE") return true;

  if (t.status === "VACATING" && t.moveOut?.requestedDate) {
    return new Date(t.moveOut.requestedDate) >= today;
  }

  return false;
});

        setTenancies(active);
        setTenancyId((old) => {
          if (active.some((t) => t.id === old)) return old;
          return active[0]?.id || "";
        });
      }

      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [isTenant]);

  async function createTicket(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await api("/maintenance", {
        method: "POST",
        body: {
          tenancyId,
          title,
          description,
        },
      });

      setTitle("");
      setDescription("");
      setMessage("Maintenance request submitted.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(ticket, status) {
    if (
      !window.confirm(
        `Change ticket status to ${statusLabels[status]}?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await api(`/maintenance/${ticket.id}`, {
        method: "PATCH",
        body: { status },
      });

      setMessage("Maintenance status updated.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const openCount = tickets.filter(
    (t) => t.status === "OPEN"
  ).length;

  const progressCount = tickets.filter(
    (t) => t.status === "IN_PROGRESS"
  ).length;

  const resolvedCount = tickets.filter(
    (t) => t.status === "RESOLVED"
  ).length;

  return (
    <div style={{ maxWidth: 1150, width: "100%" }}>
      <h2>Maintenance Management</h2>

      <p className="muted">
        {isTenant
          ? "Raise maintenance requests and track their progress."
          : "Review, manage and resolve maintenance requests."}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 14,
          margin: "20px 0",
        }}
      >
        {[
          ["Total", tickets.length],
          ["Open", openCount],
          ["In Progress", progressCount],
          ["Resolved", resolvedCount],
        ].map(([label, count]) => (
          <div
            className="card"
            style={{ padding: 18 }}
            key={label}
          >
            <p className="muted">{label}</p>
            <h2>{count}</h2>
          </div>
        ))}
      </div>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="notice">{message}</div>
      )}

      {isTenant && (
        <section
          className="card"
          style={{
            padding: 24,
            marginBottom: 20,
          }}
        >
          <h3>Raise Maintenance Request</h3>

          {tenancies.length === 0 ? (
            <p className="muted">
              An active tenancy is required to
              create a maintenance request.
              Previous requests remain visible below.
            </p>
          ) : (
            <form
  onSubmit={createTicket}
  className="maintenance-form"
>
              <label>
                Select Property / Room
                <select
                  required
                  value={tenancyId}
                  onChange={(e) =>
                    setTenancyId(e.target.value)
                  }
                >
                  {tenancies.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.unit?.property?.title} —
                      {" "}
                      {t.unit?.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Issue Title
                <input
                  required
                  minLength={5}
                  maxLength={120}
                  placeholder="Example: Water leakage"
                  value={title}
                  onChange={(e) =>
                    setTitle(e.target.value)
                  }
                />
              </label>

              <label>
                Description
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe the issue in detail..."
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value)
                  }
                />
              </label>

              <button
                type="submit"
                className="btn primary"
                disabled={busy}
              >
                {busy
                  ? "Submitting..."
                  : "Submit Maintenance Request"}
              </button>
            </form>
          )}
        </section>
      )}

      <section className="card" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h3>Maintenance Tickets</h3>

          <button
            type="button"
            className="btn outline"
            onClick={load}
            disabled={busy}
          >
            Refresh
          </button>
        </div>

        {tickets.length === 0 && (
          <p className="muted" style={{ marginTop: 18 }}>
            No maintenance requests found.
          </p>
        )}

        {tickets.map((ticket) => (
          <article
            key={ticket.id}
            style={{
              padding: 20,
              border: "1px solid #e0e8e1",
              borderRadius: 12,
              marginTop: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <h4>{ticket.title}</h4>

              <span
                style={{
                  background: "#eef4ef",
                  borderRadius: 20,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {statusLabels[ticket.status] ||
                  ticket.status}
              </span>
            </div>

            <p>{ticket.description}</p>

            <p className="muted">
              Property:{" "}
              {ticket.tenancy?.unit?.property?.title ||
                "Property"}
              {" · "}
              Room:{" "}
              {ticket.tenancy?.unit?.label || "N/A"}
            </p>

            {canManage && (
              <p className="muted">
                Tenant: {ticket.tenant?.name || "N/A"}
              </p>
            )}

            <p className="muted">
              Priority: <strong>{ticket.oversight?.priority || "MEDIUM"}</strong>
              {ticket.oversight?.assignedToName && (
                <> · Assigned manager: <strong>{ticket.oversight.assignedToName}</strong></>
              )}
              {ticket.oversight?.escalated && <> · Escalated</>}
              {ticket.oversight?.dueAt && (
                <> · SLA due: {new Date(ticket.oversight.dueAt).toLocaleString("en-IN")}</>
              )}
            </p>

            {user?.role === "MANAGER" && ticket.oversight?.canUpdate === false && (
              <p className="muted">Assigned to another manager (view-only).</p>
            )}

            <p className="muted">
              Created:{" "}
              {new Date(
                ticket.createdAt
              ).toLocaleString("en-IN")}
            </p>

            {canManage && ticket.oversight?.canUpdate !== false && ticket.status === "OPEN" && (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  changeStatus(ticket, "IN_PROGRESS")
                }
              >
                Start Work
              </button>
            )}

            {canManage && ticket.oversight?.canUpdate !== false &&
              ticket.status === "IN_PROGRESS" && (
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    changeStatus(ticket, "RESOLVED")
                  }
                >
                  Mark Resolved
                </button>
              )}
          </article>
        ))}
      </section>
    </div>
  );
}
