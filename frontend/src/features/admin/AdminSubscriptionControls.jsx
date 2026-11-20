
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./AdminSubscriptionControls.css";

const PLANS = ["STARTER", "PRO", "BUSINESS"];

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not available";

export default function AdminSubscriptionControls() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);

    try {
      const data = await api(
        `/admin-subscriptions?page=${page}`
      );

      setItems(data.subscriptions || []);
      setTotal(data.total || 0);
      setTotalPages(Math.max(1, data.totalPages || 1));
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

  const activeCount = items.filter(
    (item) => item.status === "ACTIVE"
  ).length;

  const expiredCount = items.filter(
    (item) => item.status === "EXPIRED"
  ).length;

  return (
    <div className="gn-subscriptions">
      <header className="gn-sub-header">
        <div>
          <h2>Subscriptions & Plans</h2>
          <p>
            Manage property owner subscriptions,
            plan limits and validity.
          </p>
        </div>
        <button
          className="gn-btn gn-btn-outline"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </button>
      </header>

      <div className="gn-stats">
        <div className="gn-stat-card">
          <span>Total Subscriptions</span>
          <strong>{total}</strong>
        </div>

        <div className="gn-stat-card">
          <span>Active on this page</span>
          <strong>{activeCount}</strong>
        </div>

        <div className="gn-stat-card">
          <span>Expired on this page</span>
          <strong>{expiredCount}</strong>
        </div>
      </div>

      {error && (
        <p role="alert" className="gn-error">
          {error}
        </p>
      )}

      {success && (
        <p role="status" className="gn-success">
          {success}
        </p>
      )}

      <section className="gn-table-card">
        <div className="gn-table-heading">
          <div>
            <h3>All Subscriptions</h3>
            <p>
              Review and manage owner subscriptions.
            </p>
          </div>

          <span className="gn-count">
            {total} subscriptions
          </span>
        </div>

        <div className="gn-table-scroll">
          <table className="gn-table">
            <thead>
              <tr>
                <th>Property Owner</th>
                <th>Plan</th>
                <th>Price</th>
                <th>Listing Limit</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="gn-owner">
                      <span className="gn-avatar">
                        {(item.owner?.name || "O")
                          .charAt(0)
                          .toUpperCase()}
                      </span>

                      <div>
                        <strong>
                          {item.owner?.name || "Unknown Owner"}
                        </strong>
                        <small>
                          {item.owner?.email || "No email"}
                        </small>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span className="gn-plan-badge">
                      {item.plan}
                    </span>
                  </td>

                  <td>₹{item.price ?? "—"}</td>

                  <td>{item.listingLimit}</td>

                  <td>{formatDate(item.expiresAt)}</td>

                  <td>
                    <span
                      className={`gn-status ${
                        item.status === "ACTIVE"
                          ? "is-active"
                          : "is-expired"
                      }`}
                    >
                      {item.status || "UNKNOWN"}
                    </span>
                  </td>

                  <td>
                    <button
                      className="gn-btn gn-btn-outline gn-manage-btn"
                      onClick={() => {
                        setSelected(item);
                        setSuccess("");
                      }}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && items.length === 0 && (
          <p className="gn-empty">
            No subscriptions found.
          </p>
        )}

        <div className="gn-pagination">
          <span>
            Page {page} of {totalPages}
          </span>

          <div>
            <button
              className="gn-btn gn-btn-outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>

            <button
              className="gn-btn gn-btn-outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {selected && (
        <ManageSubscriptionModal
          key={selected.id}
          subscription={selected}
          onClose={() => setSelected(null)}
          onSaved={async (message) => {
            setSelected(null);
            setSuccess(message);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ManageSubscriptionModal({
  subscription,
  onClose,
  onSaved,
}) {
  const [mode, setMode] = useState("PLAN");
  const [plan, setPlan] = useState(subscription.plan);
  const [listingLimit, setListingLimit] = useState(
    subscription.listingLimit
  );
  const [action, setAction] = useState(
    subscription.status === "ACTIVE"
      ? "EXTEND"
      : "ACTIVATE"
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [busy, onClose]);

  async function save() {
    if (busy) return;

    if (reason.trim().length < 10) {
      setError("Reason must contain at least 10 characters.");
      return;
    }

    setError("");

    let endpoint;
    let body;

    if (mode === "PLAN") {
      const limit = Number(listingLimit);

      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        setError("Listing limit must be between 1 and 1000.");
        return;
      }

      if (
        plan === subscription.plan &&
        limit === subscription.listingLimit
      ) {
        setError("No changes detected.");
        return;
      }

      endpoint = `/admin-subscriptions/${subscription.id}/plan`;

      body = {
        plan,
        listingLimit: limit,
        reason: reason.trim(),
        expectedPlan: subscription.plan,
        expectedListingLimit: subscription.listingLimit,
      };
    } else {
      if (!subscription.expiresAt) {
        setError("Current expiry is unavailable.");
        return;
      }

      if (action !== "DEACTIVATE") {
        const nextDate = new Date(expiresAt);

        if (
          !expiresAt ||
          Number.isNaN(nextDate.getTime()) ||
          nextDate <= new Date()
        ) {
          setError("Please select a future expiry date.");
          return;
        }

        if (
          action === "EXTEND" &&
          nextDate <= new Date(subscription.expiresAt)
        ) {
          setError(
            "New expiry must be later than the current expiry."
          );
          return;
        }
      }

      endpoint =
        `/admin-subscriptions/${subscription.id}/lifecycle`;

      body = {
        action,
        reason: reason.trim(),
        expectedExpiresAt:
          new Date(subscription.expiresAt).toISOString(),
        ...(action !== "DEACTIVATE"
          ? { expiresAt: new Date(expiresAt).toISOString() }
          : {}),
      };
    }

    if (
      !window.confirm(
        `Confirm ${mode === "PLAN" ? "plan update" : action.toLowerCase()}?`
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const result = await api(endpoint, {
        method: "PATCH",
        body,
      });

      await onSaved(
        result.message || "Subscription updated successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="gn-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <div
        className="gn-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gn-modal-title"
      >
        <div className="gn-modal-header">
          <div className="gn-modal-title">
            <span className="gn-modal-icon">◈</span>
            <div>
              <h2 id="gn-modal-title">Manage Subscription</h2>
              <p>
                Update subscription plan, limits or validity.
              </p>
            </div>
          </div>

          <button
            className="gn-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <div className="gn-owner-summary">
          <div className="gn-owner-identity">
            <span className="gn-avatar gn-avatar-large">
              {(subscription.owner?.name || "O")[0]}
            </span>

            <strong>
              {subscription.owner?.name || "Property Owner"}
            </strong>

            <small>
              {subscription.owner?.email || ""}
            </small>
          </div>

          <div className="gn-summary-details">
            <div>
              <span>Current Plan</span>
              <strong>{subscription.plan}</strong>
            </div>

            <div>
              <span>Listing Limit</span>
              <strong>{subscription.listingLimit}</strong>
            </div>

            <div>
              <span>Current Expiry</span>
              <strong>
                {formatDate(subscription.expiresAt)}
              </strong>
            </div>

            <div>
              <span>Status</span>
              <strong>
                {subscription.status || "UNKNOWN"}
              </strong>
            </div>
          </div>
        </div>

        <div className="gn-subscription-id">
          Subscription ID: {subscription.id}
        </div>

        <div className="gn-modal-tabs">
          <button
            className={mode === "PLAN" ? "active" : ""}
            onClick={() => {
              setMode("PLAN");
              setError("");
            }}
          >
            Plan & Limits
          </button>

          <button
            className={mode === "LIFECYCLE" ? "active" : ""}
            onClick={() => {
              setMode("LIFECYCLE");
              setError("");
            }}
          >
            Activation & Expiry
          </button>
        </div>

        <div className="gn-modal-form">
          {mode === "PLAN" ? (
            <div className="gn-form-grid">
              <label>
                Plan
                <select
                  value={plan}
                  onChange={e => setPlan(e.target.value)}
                >
                  {PLANS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label>
                Listing Limit
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={listingLimit}
                  onChange={e => setListingLimit(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="gn-form-grid">
              <label>
                Subscription Action
                <select
                  value={action}
                  onChange={e => setAction(e.target.value)}
                >
                  <option value="ACTIVATE">Activate</option>
                  <option value="EXTEND">Extend Expiry</option>
                  <option value="DEACTIVATE">Deactivate</option>
                </select>
              </label>

              {action !== "DEACTIVATE" && (
                <label>
                  New Expiry Date & Time
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={e => setExpiresAt(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          <label className="gn-reason-label">
            Reason for Change
            <textarea
              rows={4}
              maxLength={500}
              placeholder="Enter a reason for this administrative action..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </label>

          {error && (
            <p role="alert" className="gn-error">
              {error}
            </p>
          )}

          <div className="gn-info-box">
            Administrative changes are recorded in audit logs.
            No payment will be charged automatically.
          </div>
        </div>

        <div className="gn-modal-footer">
          <button
            className="gn-btn gn-btn-outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>

          <button
            className="gn-btn gn-btn-primary"
            onClick={save}
            disabled={busy}
          >
            {busy ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
