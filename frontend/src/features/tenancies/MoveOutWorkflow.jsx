
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const dateText = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN")
    : "N/A";

export default function MoveOutWorkflow() {
  const { user } = useAuth();

  const [tenancies, setTenancies] = useState([]);
  const [dates, setDates] = useState({});
  const [notes, setNotes] = useState({});
  const [deductions, setDeductions] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isTenant = user?.role === "TENANT";
  const isOwner = user?.role === "OWNER";
  const canInspect = ["OWNER", "MANAGER"].includes(user?.role);

  async function load() {
    try {
      const data = await api("/tenancies/mine");
      setTenancies(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function action(key, method, endpoint, body) {
    setBusy(key);
    setError("");
    setMessage("");

    try {
      const result = await api(endpoint, {
        method,
        body,
      });

      setMessage(result.message || "Updated successfully");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const records = tenancies.filter((t) =>
    ["ACTIVE", "VACATING", "VACATED"].includes(t.status)
  );

  return (
    <section style={{ marginTop: 20 }}>
      <h2>
        {isTenant
          ? "My Move-out & Settlement"
          : "Move-out Management"}
      </h2>

      <p className="muted">
        Track vacating requests, inspections,
        security deposit deductions and settlements.
      </p>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="notice">{message}</div>
      )}

      {records.length === 0 && (
        <div className="card" style={{ padding: 20 }}>
          No eligible tenancies available.
        </div>
      )}

      {records.map((t) => {
        const moveOut = t.moveOut;
        const balance = t.depositPaid || 0;
        const deduction = Number(deductions[t.id] ?? 0);

        return (
          <div
            key={t.id}
            className="card"
            style={{
              padding: 24,
              marginBottom: 18,
              borderRadius: 14,
            }}
          >
            <h3>
              {t.unit?.property?.title || "Property"}
            </h3>

            <p>Room: {t.unit?.label || "N/A"}</p>
            <p>Tenant: {t.tenant?.name || "N/A"}</p>
            <p>
              Tenancy Status: <strong>{t.status}</strong>
            </p>
            <p>Deposit Paid: {money(balance)}</p>

            {isTenant && t.status === "ACTIVE" && (
              <div style={{ marginTop: 18 }}>
                <h4>Request Move-out</h4>

                <label>
                  Proposed vacating date
                  <input
                    type="date"
                    min={new Date().toLocaleDateString(
                      "en-CA",
                      { timeZone: "Asia/Kolkata" }
                    )}
                    value={dates[t.id] || ""}
                    onChange={(e) =>
                      setDates((old) => ({
                        ...old,
                        [t.id]: e.target.value,
                      }))
                    }
                  />
                </label>

                <button
                  className="btn primary"
                  style={{ marginTop: 12 }}
                  disabled={Boolean(busy) || !dates[t.id]}
                  onClick={() => {
                    if (!window.confirm(
                      "Submit your move-out request?"
                    )) return;

                    action(
                      t.id,
                      "POST",
                      `/tenancies/${t.id}/move-out`,
                      {
                        requestedDate:
                          `${dates[t.id]}T12:00:00+05:30`,
                      }
                    );
                  }}
                >
                  Submit Move-out Request
                </button>
              </div>
            )}

            {moveOut && (
              <div
                style={{
                  padding: 16,
                  border: "1px solid #e1e8df",
                  borderRadius: 12,
                  marginTop: 18,
                }}
              >
                <h4>Move-out Details</h4>

                <p>
                  Requested Date:{" "}
                  {dateText(moveOut.requestedDate)}
                </p>

                <p>
                  Inspection:{" "}
                  {moveOut.inspectionNotes ||
                    "Awaiting inspection"}
                </p>

                <p>
                  Settlement:{" "}
                  {moveOut.approved
  ? moveOut.refund > 0
    ? "Settlement approved — refund processing pending"
    : "Settlement completed — no refund due"
  : "Pending"}
                </p>

                {moveOut.approved && moveOut.refund > 0 && (
  <small>
    Refund approved for manual processing.
    Bank transfer is not yet confirmed.
  </small>
)}
              </div>
            )}

            {canInspect &&
              t.status === "VACATING" &&
              moveOut && (
                <div style={{ marginTop: 18 }}>
                  <h4>Property Inspection</h4>

                  <textarea
                    rows={3}
                    placeholder="Room condition, damages, inspection findings..."
                    style={{ width: "100%", padding: 12 }}
                    value={
                      notes[t.id] ??
                      moveOut.inspectionNotes ??
                      ""
                    }
                    onChange={(e) =>
                      setNotes((old) => ({
                        ...old,
                        [t.id]: e.target.value,
                      }))
                    }
                  />

                  <button
  className="btn outline"
  disabled={Boolean(busy)}
  onClick={() => {
    const inspectionNotes = String(
      notes[t.id] ?? moveOut.inspectionNotes ?? ""
    ).trim();

    if (
      inspectionNotes.length < 10 ||
      inspectionNotes.length > 1000
    ) {
      alert("Inspection notes must contain 10-1000 characters");
      return;
    }

    action(
      t.id,
      "PATCH",
      `/tenancies/${t.id}/inspection`,
      {
        notes: inspectionNotes,
      }
    );
  }}
>
  Save Inspection
</button>
                </div>
              )}

            {isOwner &&
              t.status === "VACATING" &&
              moveOut?.inspectionNotes && (
                <div style={{ marginTop: 20 }}>
                  <h4>Final Security Deposit Settlement</h4>

                  <p>
                    Total Deposit: {money(balance)}
                  </p>

                  <label>
                    Approved deduction (INR)
                    <input
                      type="number"
                      min="0"
                      max={balance}
                      step="1"
                      value={deductions[t.id] ?? 0}
                      onChange={(e) =>
                        setDeductions((old) => ({
                          ...old,
                          [t.id]: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <p>
                    Estimated refund:{" "}
                    <strong>
                      {money(Math.max(0, balance - deduction))}
                    </strong>
                  </p>

{new Date(moveOut.requestedDate) > new Date() && (
  <p className="muted" style={{ marginTop: 12 }}>
    Final settlement cannot be approved before the
    requested move-out date:
    {" "}
    {new Date(moveOut.requestedDate).toLocaleString("en-IN")}
  </p>
)}

<button
  type="button"
  className="btn primary"
  style={{ marginTop: 14 }}
  disabled={
    Boolean(busy) ||
    !Number.isSafeInteger(deduction) ||
    deduction < 0 ||
    deduction > balance ||
    new Date(moveOut.requestedDate) > new Date()
  }
  onClick={() => {
    if (!window.confirm(
      "Approve final settlement? This records the decision but does not transfer funds."
    )) {
      return;
    }

    action(
      t.id,
      "POST",
      `/tenancies/${t.id}/settle`,
      { deduction }
    );
  }}
>
  {busy === t.id
    ? "Approving..."
    : "Approve Final Settlement"}
</button>

                </div>

              )}
          </div>
        );
      })}
    </section>
  );
}
