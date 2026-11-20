
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";

export default function TenancyWorkflow() {
  const { user } = useAuth();

  const [tenancies, setTenancies] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const result = await api("/tenancies/mine");
      setTenancies(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function execute(key, path, body) {
    setBusy(key);
    setError("");
    setMessage("");

    try {
      const result = await api(path, {
        method: "POST",
        body,
      });

      setMessage(
        result.message || "Action completed successfully."
      );

      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value || 0);

  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleDateString("en-IN")
      : "N/A";

  const isOwner = user?.role === "OWNER";
  const isTenant = user?.role === "TENANT";

  return (
    <div style={{ padding: 20, maxWidth: 1100 }}>
      <h2>
        {isOwner
          ? "Rental Agreements & Tenancies"
          : "My Rental Agreements"}
      </h2>

      <p className="muted">
        Manage agreements, tenancy activation
        and rent invoices.
      </p>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="notice">
          {message}
        </div>
      )}

      {tenancies.length === 0 && (
        <div className="card" style={{ padding: 24 }}>
          <h3>No tenancies available</h3>
          <p className="muted">
            Approved bookings must have a tenancy
            record before agreement creation.
          </p>
        </div>
      )}

      {tenancies.map((t) => {
        const signedAgreement = t.agreements?.find(
          (a) => a.signedAt
        );

        return (
          <div
            key={t.id}
            className="card"
            style={{
              padding: 24,
              marginBottom: 20,
            }}
          >
            <h3>
              {t.unit?.property?.title ||
                "Rental Property"}
            </h3>

            <p>
              <strong>Unit:</strong>{" "}
              {t.unit?.label || "N/A"}
            </p>

            <p>
              <strong>Tenant:</strong>{" "}
              {t.tenant?.name || "N/A"}
            </p>

            <p>
              <strong>Monthly Rent:</strong>{" "}
              {formatMoney(t.rent)}
            </p>

            <p>
              <strong>Start Date:</strong>{" "}
              {formatDate(t.startDate)}
            </p>

            <p>
              <strong>Tenancy Status:</strong>{" "}
              {t.status}
            </p>

            {isOwner &&
              t.status === "PENDING_PAYMENT" &&
              !t.agreements?.length && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    execute(
                      t.id + "-create",
                      `/agreements/${t.id}`,
                      { type: "GENERATED_TEXT" }
                    )
                  }
                >
                  Create Rental Agreement
                </button>
              )}

            {(t.agreements || []).map((a) => (
              <div
                key={a.id}
                style={{
                  marginTop: 16,
                  padding: 16,
                  border: "1px solid #ddd",
                  borderRadius: 10,
                }}
              >
                <h4>Rental Agreement</h4>

                <p style={{ whiteSpace: "pre-wrap" }}>
                  {a.content}
                </p>

                <p>
                  <strong>Status:</strong>{" "}
                  {a.signedAt
                    ? `Signed on ${formatDate(a.signedAt)}`
                    : "Awaiting Tenant Signature"}
                </p>

                {isTenant && !a.signedAt && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      const confirmed = window.confirm(
                        "I have read and agree to this rental agreement."
                      );

                      if (!confirmed) return;

                      execute(
                        a.id + "-sign",
                        `/agreements/${a.id}/consent`,
                        { signerName: user.name }
                      );
                    }}
                  >
                    I Agree & Sign
                  </button>
                )}
              </div>
            ))}

            {isOwner &&
              t.status === "PENDING_PAYMENT" &&
              signedAgreement && (
                <button
                  type="button"
                  className="btn primary"
                  style={{ marginTop: 16 }}
                  disabled={Boolean(busy)}
                  onClick={() =>
                    execute(
                      t.id + "-activate",
                      `/tenancies/${t.id}/activate`,
                      {}
                    )
                  }
                >
                  Activate Tenancy & Generate Rent
                </button>
              )}

            {(t.invoices || []).length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h4>Rent Invoices</h4>

                {t.invoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    style={{
                      borderTop: "1px solid #eee",
                      padding: "12px 0",
                    }}
                  >
                    <strong>{invoice.period}</strong>
                    {" — "}
                    {formatMoney(invoice.amount)}
                    {" — "}
                    {invoice.status}
                    <p className="muted">
                      Due: {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
