
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

function dateText(value) {
  return value
    ? new Date(value).toLocaleString("en-IN")
    : "—";
}

export default function OwnerCheckoutReview() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);

    try {
      const data = await api("/owner-checkout/inspections");
      setRecords(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function finalize(record) {
    if (!record.canFinalize) return;

    const confirmed = window.confirm(
      `Confirm physical check-out of ${record.tenant.name}? ` +
      "Only proceed after the room is handed over and settlement is complete."
    );

    if (!confirmed) return;

    setBusyId(record.id);
    setError("");
    setMessage("");

    try {
      const result = await api(
        `/owner-checkout/${record.id}/finalize`,
        {
          method: "POST",
        }
      );

      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="dashboard-grid">
      <div>
        <h2>Manager Inspections & Final Check-out</h2>
        <p className="muted">
          Review inspection findings. Complete the
          existing move-out settlement before finalizing
          the physical check-out.
        </p>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p role="status">{message}</p>
      )}

      {loading && <p>Loading inspections...</p>}

      {!loading && records.length === 0 && (
        <p className="muted">
          No move-out inspections to review.
        </p>
      )}

      <div className="record-list">
        {records.map((record) => (
          <article className="record" key={record.id}>
            <div>
              <h3>{record.tenant.name}</h3>

              <p className="muted">
                {record.unit.property.title}
              </p>

              <p>Room: {record.unit.label}</p>
              <p>Tenancy: {record.status}</p>

              <p>
                Physical check-in:{" "}
                {dateText(record.checkInAt)}
              </p>

              <p>
                Physical check-out:{" "}
                {dateText(record.checkOutAt)}
              </p>

              {record.inspection ? (
                <div style={{
                  border: "1px solid #e2e8e3",
                  borderRadius: 10,
                  padding: 14,
                  marginTop: 12,
                }}>
                  <strong>Manager Inspection</strong>

                  <p>
                    Condition: {record.inspection.condition}
                  </p>

                  <p>
                    Damage observed:{" "}
                    {record.inspection.damageObserved
                      ? "Yes"
                      : "No"}
                  </p>

                  <p>{record.inspection.notes}</p>

                  <p className="muted">
                    Inspected:{" "}
                    {dateText(record.inspection.inspectedAt)}
                  </p>
                </div>
              ) : (
                <p className="muted">
                  Waiting for Manager inspection.
                </p>
              )}

              {record.canFinalize ? (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busyId !== null}
                  onClick={() => finalize(record)}
                >
                  {busyId === record.id
                    ? "Finalizing..."
                    : "Finalize Physical Check-out"}
                </button>
              ) : record.checkOutAt ? (
                <p>
                  <strong>Physical check-out completed</strong>
                </p>
              ) : (
                <p className="muted">
                  {record.status === "VACATING"
                    ? "Awaiting Owner settlement."
                    : "Inspection or physical check-in is missing."}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
