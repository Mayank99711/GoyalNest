
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function ManagerCheckIn() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [readiness, setReadiness] = useState(null);
  const [verification, setVerification] = useState({});

  async function load() {
    setLoading(true);

    try {
      const [data, overview] = await Promise.all([api("/manager-portal/checkins"), api("/manager-portal/checkin-readiness")]);
      setRecords(Array.isArray(data) ? data : []);
      setReadiness(overview);
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

  async function confirmCheckIn(record) {
    if (!verification[record.id]?.identity || !verification[record.id]?.room) {
      setError("Verify identity and room allocation before confirming check-in.");
      return;
    }
    const confirmed = window.confirm(
      `Record physical arrival for ${record.tenant.name} at ${record.unit.label}?`
    );

    if (!confirmed) return;

    setWorkingId(record.id);
    setError("");
    setMessage("");

    try {
      const result = await api(
        `/manager-portal/checkins/${record.id}/confirm`,
        { method: "POST", body: { identityVerified: true, roomVerified: true } }
      );

      setMessage(result.message);
      setVerification(prev => { const next={...prev}; delete next[record.id]; return next; });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="dashboard-grid">
      <div>
        <h2>Physical Check-in</h2>
        <p className="muted">
          Confirm tenant arrival only after identity
          and room verification.
        </p>
      </div>

      <div className="stats">
        <div>
          <span>Active Records</span>
          <strong>
            {records.filter(
              (r) => r.status === "ACTIVE"
            ).length}
          </strong>
        </div>

        <div>
          <span>Confirmed Check-ins</span>
          <strong>
            {records.filter(
              (r) => r.checkInAt && !r.checkOutAt
            ).length}
          </strong>
        </div>

        <div>
          <span>Awaiting Check-in</span>
          <strong>
            {records.filter(
              (r) =>
                r.status === "ACTIVE" &&
                !r.checkInAt &&
                !r.checkOutAt
            ).length}
          </strong>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {message && <p>{message}</p>}

      {loading && <p>Loading check-in records...</p>}

      {!loading && readiness && <div className="record" style={{marginBottom:16,display:"block"}}>
        <strong>Assignment and move-in readiness</strong>
        <p className="muted">Assigned properties: {readiness.assignedProperties} · Active tenancies: {readiness.activeTenancies} · Awaiting physical check-in: {readiness.awaitingCheckIn}</p>
        {readiness.assignedProperties === 0 && <p role="status">No property assigned to your Manager account. Ask the property Owner to open Employee Management → Manager Property Assignments.</p>}
        {readiness.assignedProperties > 0 && readiness.activeTenancies === 0 && <p role="status">Properties are assigned, but none has an ACTIVE tenancy yet. Owner must complete the booking/tenancy process first. Demo properties alone do not generate move-ins.</p>}
        {readiness.assignedProperties > 0 && readiness.activeTenancies > 0 && records.length === 0 && <p>Active tenancy exists but is not in the current check-in list. Refresh or inspect the backend response.</p>}
      </div>}
      {!loading && records.length === 0 && <p>No eligible check-in records for assigned properties.</p>}

      <div className="record-list">
        {records.map((record) => {
          const checkedIn =
            Boolean(record.checkInAt) &&
            !record.checkOutAt;

          const canCheckIn =
            record.status === "ACTIVE" &&
            !record.checkInAt &&
            !record.checkOutAt;

          return (
            <div className="record" key={record.id}>
              <div>
                <strong>{record.tenant.name}</strong>

                <p className="muted">
                  {record.unit.property.title}
                </p>

                <p className="muted">
                  Room: {record.unit.label}
                </p>

                <p className="muted">
                  Tenancy: {record.status}
                </p>

                <p className="muted">
                  Physical check-in:{" "}
                  {checkedIn
                    ? new Date(
                        record.checkInAt
                      ).toLocaleString("en-IN")
                    : "Not confirmed"}
                </p>
              </div>

              {canCheckIn ? (
                <div style={{display:"grid",gap:8,minWidth:220}}>
                  <label><input type="checkbox" checked={Boolean(verification[record.id]?.identity)} onChange={e=>setVerification(prev=>({...prev,[record.id]:{...prev[record.id],identity:e.target.checked}}))}/> Identity physically verified</label>
                  <label><input type="checkbox" checked={Boolean(verification[record.id]?.room)} onChange={e=>setVerification(prev=>({...prev,[record.id]:{...prev[record.id],room:e.target.checked}}))}/> Room and allocation verified</label>
                  <button
                  type="button"
                  className="btn primary"
                  disabled={workingId !== null || !verification[record.id]?.identity || !verification[record.id]?.room}
                  onClick={() =>
                    confirmCheckIn(record)
                  }
                >
                  {workingId === record.id
                    ? "Confirming..."
                    : "Confirm Check-in"}
                </button>
                </div>
              ) : (
                <span>
                  {checkedIn
                    ? "Checked In"
                    : record.checkOutAt
                      ? "Checked Out"
                      : "Check-in unavailable"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
