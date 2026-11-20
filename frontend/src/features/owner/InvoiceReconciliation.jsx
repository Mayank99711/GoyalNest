
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function InvoiceReconciliation() {
  const [invoices, setInvoices] = useState([]);
  const [reasons, setReasons] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const data = await api("/invoice-reconciliation/review");
      setInvoices(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function cancel(invoice) {
    const reason = String(
      reasons[invoice.invoiceId] || ""
    ).trim();

    if (reason.length < 10 || reason.length > 500) {
      setError("Enter a reason of 10-500 characters.");
      return;
    }

    if (!window.confirm(
      `Cancel ${invoice.period} invoice for ${invoice.tenant}? ` +
      "This action will be recorded in the audit log."
    )) return;

    setBusy(invoice.invoiceId);
    setError("");
    setMessage("");

    try {
      const result = await api(
        `/invoice-reconciliation/${invoice.invoiceId}/cancel`,
        {
          method: "POST",
          body: { reason },
        }
      );

      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card" style={{ padding: 24 }}>
      <h2>Invoice Reconciliation</h2>
      <p className="muted">
        Review future-period rent invoices associated
        with vacated tenancies. No invoices are deleted.
      </p>

      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status">{message}</p>}

      {invoices.length === 0 && (
        <p className="muted">
          No future-period invoices currently require review.
        </p>
      )}

      {invoices.map((invoice) => (
        <article
          key={invoice.invoiceId}
          style={{
            padding: 18,
            marginTop: 16,
            border: "1px solid #e1e8e3",
            borderRadius: 12,
          }}
        >
          <h3>{invoice.property}</h3>

          <p>
            {invoice.tenant} — {invoice.room}
          </p>

          <p>
            Billing Period: <strong>{invoice.period}</strong>
          </p>

          <p>
            Amount: ₹{invoice.amount.toLocaleString("en-IN")}
          </p>

          <p>
            Tenancy move-out:{" "}
            {new Date(invoice.moveOutDate)
              .toLocaleDateString("en-IN")}
          </p>

          <label style={{ display: "grid", gap: 8 }}>
            Reason for cancellation
            <textarea
              rows={3}
              maxLength={500}
              placeholder="Explain why this future-period invoice is invalid..."
              value={reasons[invoice.invoiceId] || ""}
              onChange={(e) =>
                setReasons((old) => ({
                  ...old,
                  [invoice.invoiceId]: e.target.value,
                }))
              }
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </label>

          <button
            type="button"
            className="btn outline"
            style={{ marginTop: 12 }}
            disabled={Boolean(busy)}
            onClick={() => cancel(invoice)}
          >
            {busy === invoice.invoiceId
              ? "Processing..."
              : "Cancel Invalid Invoice"}
          </button>
        </article>
      ))}
    </section>
  );
}
