import DisputeConversation from "../disputes/DisputeConversation";
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./AdminDisputes.css";

const TYPES = [
  "BOOKING",
  "PAYMENT",
  "REFUND",
  "SECURITY_DEPOSIT",
  "OTHER",
];

const PRIORITIES = [
  "LOW", "MEDIUM", "HIGH", "URGENT"
];

const emptyForm = {
  type: "BOOKING",
  subject: "",
  description: "",
  priority: "MEDIUM",
  bookingId: "",
  paymentId: "",
};

const formatDate = value =>
  value
    ? new Date(value).toLocaleString("en-IN")
    : "—";

export default function AdminDisputes() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [nextStatus, setNextStatus] = useState("UNDER_REVIEW");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
      });

      if (status) params.set("status", status);
      if (query) params.set("search", query);

      const result = await api(
        `/admin-disputes?${params.toString()}`
      );

      setData(result);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page, status, query]);

  useEffect(() => {
    if (!modal) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) {
        setModal(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modal, busy]);

  function createNew() {
    setForm({ ...emptyForm });
    setError("");
    setModal({ mode: "CREATE" });
  }

  function openReview(item) {
    setNotes(item.adminNotes || "");
    setResolution(item.resolution || "");
    setNextStatus(
      item.status === "OPEN"
        ? "UNDER_REVIEW"
        : "RESOLVED"
    );
    setError("");
    setModal({ mode: "REVIEW", item });
  }

  async function createDispute() {
    if (
      form.subject.trim().length < 5 ||
      form.description.trim().length < 10
    ) {
      setError("Enter a subject and detailed description.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await api("/admin-disputes", {
        method: "POST",
        body: {
          type: form.type,
          subject: form.subject.trim(),
          description: form.description.trim(),
          priority: form.priority,
          ...(form.bookingId.trim()
            ? { bookingId: form.bookingId.trim() }
            : {}),
          ...(form.paymentId.trim()
            ? { paymentId: form.paymentId.trim() }
            : {}),
        },
      });

      setModal(null);
      setMessage(result.message);
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reviewDispute() {
    if (!modal?.item) return;

    if (
      ["RESOLVED", "REJECTED"].includes(nextStatus) &&
      resolution.trim().length < 10
    ) {
      setError("A resolution reason of at least 10 characters is required.");
      return;
    }

    if (!window.confirm(`Set dispute to ${nextStatus}?`)) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await api(
        `/admin-disputes/${modal.item.id}/review`,
        {
          method: "PATCH",
          body: {
            status: nextStatus,
            expectedStatus: modal.item.status,
            adminNotes: notes.trim(),
            ...(nextStatus !== "UNDER_REVIEW"
              ? { resolution: resolution.trim() }
              : {}),
          },
        }
      );

      setMessage(result.message);
      setModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const summary = data?.summary || {};

  return (
    <main className="gd-page">
      <header className="gd-header">
        <div>
          <h2>Booking & Payment Disputes</h2>
          <p>
            Investigate complaints, record decisions and
            track dispute resolution.
          </p>
        </div>

        <button
          className="gd-btn gd-primary"
          onClick={createNew}
        >
          + Create Dispute
        </button>
      </header>

      <div className="gd-stats">
        {[
          ["Total", summary.total || 0],
          ["Open", summary.OPEN || 0],
          ["Under Review", summary.UNDER_REVIEW || 0],
          ["Resolved", summary.RESOLVED || 0],
          ["Rejected", summary.REJECTED || 0],
        ].map(([label, count]) => (
          <div className="gd-stat" key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>

      {message && (
        <p className="gd-success" role="status">
          {message}
        </p>
      )}

      {!modal && error && (
        <p className="gd-error" role="alert">
          {error}
        </p>
      )}

      <section className="gd-card">
        <div className="gd-toolbar">
          <form
            onSubmit={e => {
              e.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
          >
            <input
              placeholder="Search subject, booking or payment ID"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <button
              type="submit"
              className="gd-btn gd-outline"
            >
              Search
            </button>
          </form>

          <select
            value={status}
            onChange={e => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div className="gd-table-wrap">
          <table className="gd-table">
            <thead>
              <tr>
                <th>Dispute</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {(data?.disputes || []).map(item => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.subject}</strong>
                    <small>{item.id}</small>
                  </td>
                  <td>{item.type.replaceAll("_", " ")}</td>
                  <td>{item.priority}</td>
                  <td>
                    <span
                      className={`gd-status gd-${item.status.toLowerCase()}`}
                    >
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    <button
                      className="gd-btn gd-outline"
                      onClick={() => openReview(item)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <p className="gd-empty">Loading...</p>}

        {!loading && !data?.disputes?.length && (
          <p className="gd-empty">No disputes found.</p>
        )}

        <footer className="gd-pagination">
          <span>
            Page {page} of {Math.max(1, data?.totalPages || 1)}
          </span>

          <div>
            <button
              className="gd-btn gd-outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>

            <button
              className="gd-btn gd-outline"
              disabled={page >= (data?.totalPages || 1)}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>

      {modal && (
        <div
          className="gd-overlay"
          onMouseDown={e => {
            if (e.target === e.currentTarget && !busy) {
              setModal(null);
            }
          }}
        >
          <section
            className="gd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gd-modal-title"
          >
            <header className="gd-modal-header">
              <div>
                <h3 id="gd-modal-title">
                  {modal.mode === "CREATE"
                    ? "Create New Dispute"
                    : "Review Dispute"}
                </h3>

                <p>
                  {modal.mode === "CREATE"
                    ? "Register a case for investigation."
                    : "Review the case and record your decision."}
                </p>
              </div>

              <button
                className="gd-close"
                onClick={() => setModal(null)}
                disabled={busy}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="gd-modal-body">
              {error && (
                <p className="gd-error" role="alert">{error}</p>
              )}

              {modal.mode === "CREATE" ? (
                <>
                  <div className="gd-form-grid">
                    <label>
                      Dispute Type
                      <select
                        value={form.type}
                        onChange={e => setForm({
                          ...form,
                          type: e.target.value,
                        })}
                      >
                        {TYPES.map(type => (
                          <option key={type} value={type}>
                            {type.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Priority
                      <select
                        value={form.priority}
                        onChange={e => setForm({
                          ...form,
                          priority: e.target.value,
                        })}
                      >
                        {PRIORITIES.map(priority => (
                          <option key={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label>
                    Subject
                    <input
                      value={form.subject}
                      maxLength={150}
                      onChange={e => setForm({
                        ...form,
                        subject: e.target.value,
                      })}
                      placeholder="Briefly describe the issue"
                    />
                  </label>

                  <label>
                    Description
                    <textarea
                      rows={4}
                      maxLength={3000}
                      value={form.description}
                      onChange={e => setForm({
                        ...form,
                        description: e.target.value,
                      })}
                      placeholder="Explain what happened..."
                    />
                  </label>

                  <div className="gd-form-grid">
                    <label>
                      Booking ID (optional)
                      <input
                        value={form.bookingId}
                        onChange={e => setForm({
                          ...form,
                          bookingId: e.target.value,
                        })}
                      />
                    </label>

                    <label>
                      Payment ID (optional)
                      <input
                        value={form.paymentId}
                        onChange={e => setForm({
                          ...form,
                          paymentId: e.target.value,
                        })}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="gd-case-info">

                    <strong>{modal.item.subject}</strong>
                    <p>{modal.item.description}</p>
                    <small>
                      Booking: {modal.item.bookingId || "Not linked"}
                    </small>
                    <small>
                      Payment: {modal.item.paymentId || "Not linked"}
                    </small>
                    <small>
                      Current status: {modal.item.status}
                    </small>
                  </div>
                  <DisputeConversation
  key={modal.item.id}
  disputeId={modal.item.id}
  status={modal.item.status}
/>
                  {!["RESOLVED", "REJECTED"].includes(
                    modal.item.status
                  ) ? (
                    <>
                      <label>
                        New Status
                        <select
                          value={nextStatus}
                          onChange={e => setNextStatus(e.target.value)}
                        >
                          {modal.item.status === "OPEN" && (
                            <option value="UNDER_REVIEW">
                              Under Review
                            </option>
                          )}
                          <option value="RESOLVED">Resolved</option>
                          <option value="REJECTED">Rejected</option>
                        </select>
                      </label>

                      <label>
                        Investigation Notes
                        <textarea
                          rows={3}
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                        />
                      </label>

                      {nextStatus !== "UNDER_REVIEW" && (
                        <label>
                          Resolution / Rejection Reason
                          <textarea
                            rows={3}
                            value={resolution}
                            onChange={e => setResolution(e.target.value)}
                          />
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      <p><strong>Admin Notes:</strong> {modal.item.adminNotes || "—"}</p>
                      <p><strong>Resolution:</strong> {modal.item.resolution || "—"}</p>
                    </>
                  )}
                </>
              )}

              <div className="gd-info">
                Dispute management does not automatically initiate
                refunds or change booking/payment records.
              </div>
            </div>

            <footer className="gd-modal-footer">
              <button
                className="gd-btn gd-outline"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>

              {(
                modal.mode === "CREATE" ||
                !["RESOLVED", "REJECTED"].includes(
                  modal.item.status
                )
              ) && (
                <button
                  className="gd-btn gd-primary"
                  disabled={busy}
                  onClick={
                    modal.mode === "CREATE"
                      ? createDispute
                      : reviewDispute
                  }
                >
                  {busy ? "Saving..." : "Save"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
