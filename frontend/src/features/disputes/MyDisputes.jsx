import DisputeConversation from "./DisputeConversation";
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./MyDisputes.css";

const TYPES = [
  ["BOOKING", "Booking"],
  ["PAYMENT", "Payment"],
  ["REFUND", "Refund"],
  ["SECURITY_DEPOSIT", "Security Deposit"],
  ["OTHER", "Other"],
];

const initialForm = {
  type: "BOOKING",
  subject: "",
  description: "",
  bookingId: "",
  paymentId: "",
};

export default function MyDisputes() {
  const [items, setItems] = useState([]);
  const [references, setReferences] = useState({
    bookings: [],
    payments: [],
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

 async function load(silent = false) {
  if (!silent) setLoading(true);

  try {
    const params = new URLSearchParams({
      page: String(page),
    });

    if (filter) params.set("status", filter);

    const result = await api(
      `/dispute-cases?${params.toString()}`
    );

    setItems(result.disputes || []);
    setTotal(result.total || 0);
    setTotalPages(Math.max(1, result.totalPages || 1));
    setError("");
  } catch (err) {
    setError(err.message);
  } finally {
    if (!silent) setLoading(false);
  }
}

  // Initial loading + automatic background refresh
useEffect(() => {
  // Fetch immediately when page opens or filter changes
  load();

  // Refresh without showing loading spinner
  const refresh = () => {
    if (document.visibilityState === "visible") {
      load(true);
    }
  };

  const interval = setInterval(refresh, 15000);

  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);

  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("focus", refresh);
  };
}, [page, filter]);
  useEffect(() => {
    if (!showCreate && !selected) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function escape(event) {
      if (event.key === "Escape" && !busy) {
        setShowCreate(false);
        setSelected(null);
      }
    }

    window.addEventListener("keydown", escape);

    return () => {
      window.removeEventListener("keydown", escape);
      document.body.style.overflow = originalOverflow;
    };
  }, [showCreate, selected, busy]);

  async function openCreate() {
    setForm({ ...initialForm });
    setError("");

    try {
      const result = await api("/my-disputes/references");
      setReferences(result);
      setShowCreate(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(event) {
    event.preventDefault();

    if (
      form.subject.trim().length < 5 ||
      form.description.trim().length < 10
    ) {
      setError("Provide a valid subject and description.");
      return;
    }

    if (!form.bookingId && !form.paymentId) {
      setError("Select a booking or payment reference.");
      return;
    }

    if (
      ["PAYMENT", "REFUND", "SECURITY_DEPOSIT"].includes(
        form.type
      ) &&
      !form.paymentId
    ) {
      setError("Select a payment for this dispute type.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await api("/my-disputes", {
        method: "POST",
        body: {
          type: form.type,
          subject: form.subject.trim(),
          description: form.description.trim(),
          ...(form.bookingId
            ? { bookingId: form.bookingId }
            : {}),
          ...(form.paymentId
            ? { paymentId: form.paymentId }
            : {}),
        },
      });

      setNotice(result.message);
      setShowCreate(false);

      if (page !== 1) setPage(1);
      else await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const closeModal = () => {
    if (!busy) {
      setShowCreate(false);
      setSelected(null);
      setError("");
    }
  };

  return (
    <main className="md-page">
      <header className="md-header">
        <div>
          <h2>My Disputes</h2>
          <p>
            Raise and track your booking or payment concerns.
          </p>
        </div>

        <button
          className="md-btn md-primary"
          onClick={openCreate}
        >
          + Raise Dispute
        </button>
      </header>

      <div className="md-overview">
        <div className="md-metric">
          <span>Matching Disputes</span>
          <strong>{total}</strong>
        </div>
        <div className="md-metric">
          <span>Current Filter</span>
          <strong>{filter.replaceAll("_", " ") || "All"}</strong>
        </div>
      </div>

      {notice && (
        <p className="md-success" role="status">{notice}</p>
      )}
      {!showCreate && !selected && error && (
        <p className="md-error" role="alert">{error}</p>
      )}

      <section className="md-card">
        <div className="md-toolbar">
          <h3>Dispute History</h3>

          <select
            value={filter}
            onChange={e => {
              setFilter(e.target.value);
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

        <div className="md-table-scroll">
          <table className="md-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Type</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>{item.subject}</td>
                  <td>{item.type.replaceAll("_", " ")}</td>
                  <td>
                    <span className={`md-pill md-${item.status.toLowerCase()}`}>
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    {new Date(item.createdAt)
                      .toLocaleDateString("en-IN")}
                  </td>
                  <td>
                    <button
                      className="md-btn md-outline"
                      onClick={() => {
                        setSelected(item);
                        setError("");
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && items.length === 0 && (
  <div className="md-empty">
    Loading dispute history...
  </div>
)}

{!loading && items.length === 0 && !error && (
  <div className="md-empty">
    No disputes found.
  </div>
)}

        <footer className="md-pagination">
          <button
            className="md-btn md-outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            className="md-btn md-outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </footer>
      </section>

      {(showCreate || selected) && (
        <div
          className="md-overlay"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <section
            className="md-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="md-modal-title"
          >
            <div className="md-modal-header">
              <div>
                <h3 id="md-modal-title">
                  {showCreate ? "Raise New Dispute" : "Dispute Details"}
                </h3>
                <p>
                  {showCreate
                    ? "Provide information for Admin review."
                    : "Track the progress of your case."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="md-x"
                aria-label="Close"
                disabled={busy}
              >
                ×
              </button>
            </div>

            {showCreate ? (
              <form onSubmit={submit} className="md-form">
                <div className="md-field-grid">
                  <label>
                    Dispute Type
                    <select
                      value={form.type}
                      onChange={e => setForm({
                        ...form,
                        type: e.target.value,
                      })}
                    >
                      {TYPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Booking
                    <select
                      value={form.bookingId}
                      onChange={e => setForm({
                        ...form,
                        bookingId: e.target.value,
                        paymentId: "",
                      })}
                    >
                      <option value="">Select booking (optional)</option>
                      {references.bookings.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.id} ({b.status})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Payment
                    <select
                      value={form.paymentId}
                      onChange={e => setForm({
                        ...form,
                        paymentId: e.target.value,
                      })}
                    >
                      <option value="">Select payment (optional)</option>
                      {references.payments.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Subject
                    <input
                      value={form.subject}
                      maxLength={150}
                      onChange={e => setForm({
                        ...form,
                        subject: e.target.value,
                      })}
                      placeholder="Brief summary of your concern"
                      required
                    />
                  </label>
                </div>

                <label>
                  Description
                  <textarea
                    rows={5}
                    value={form.description}
                    maxLength={3000}
                    onChange={e => setForm({
                      ...form,
                      description: e.target.value,
                    })}
                    placeholder="Explain what happened and what assistance you need."
                    required
                  />
                </label>

                {error && (
                  <p role="alert" className="md-error">{error}</p>
                )}

                <div className="md-info">
                  Your dispute will be reviewed by the Admin team.
                  Submitting does not automatically issue a refund.
                </div>

                <div className="md-actions">
                  <button
                    type="button"
                    className="md-btn md-outline"
                    onClick={closeModal}
                    disabled={busy}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="md-btn md-primary"
                    disabled={busy}
                  >
                    {busy ? "Submitting..." : "Submit Dispute"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="md-details">
                <p><strong>{selected.subject}</strong></p>
                <p>{selected.description}</p>
                <p><strong>Type:</strong> {selected.type}</p>
                <p><strong>Status:</strong> {selected.status}</p>
                <p><strong>Booking:</strong> {selected.bookingId || "—"}</p>
                <p><strong>Payment:</strong> {selected.paymentId || "—"}</p>
                <p>
                  <strong>Resolution:</strong>{" "}
                  {selected.resolution || "Awaiting Admin decision"}
                </p>
                <DisputeConversation
  key={selected.id}
  disputeId={selected.id}
  status={selected.status}
/>

                <div className="md-actions">
                  <button
                    className="md-btn md-outline"
                    onClick={closeModal}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
