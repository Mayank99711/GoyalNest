
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

const initialForm = {
  condition: "GOOD",
  notes: "",
  damageObserved: false,
};

export default function ManagerCheckoutInspection() {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);

    try {
      const data = await api(
        "/manager-portal/checkout-inspections"
      );

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

  async function submit(event) {
    event.preventDefault();

    if (!selectedId) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await api(
        `/manager-portal/checkout-inspections/${selectedId}`,
        {
          method: "POST",
          body: form,
        }
      );

      setMessage(result.message);
      setSelectedId("");
      setForm(initialForm);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <div>
        <h2>Check-out Inspections</h2>
        <p className="muted">
          Inspect rooms for tenants with pending
          move-out requests. Owner handles final settlement.
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
        <div className="record">
          <p>No pending move-out inspections.</p>
          <p className="muted">
            Tenant must submit a move-out request first.
          </p>
        </div>
      )}

      <div className="record-list">
        {records.map((record) => (
          <section className="record" key={record.id}>
            <div>
              <h3>{record.tenant.name}</h3>
              <p className="muted">
                {record.unit.property.title}
              </p>
              <p>Room: {record.unit.label}</p>
              <p>
                Requested move-out:{" "}
                {record.moveOut?.requestedDate
                  ? new Date(
                      record.moveOut.requestedDate
                    ).toLocaleDateString("en-IN")
                  : "Not specified"}
              </p>

              {record.inspection ? (
                <>
                  <p>
                    Condition:{" "}
                    <strong>
                      {record.inspection.condition}
                    </strong>
                  </p>
                  <p>{record.inspection.notes}</p>
                  <p className="muted">
                    Inspection submitted — Owner review pending.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => {
                    setSelectedId(record.id);
                    setForm(initialForm);
                    setMessage("");
                  }}
                >
                  Record Inspection
                </button>
              )}
            </div>

            {selectedId === record.id &&
              !record.inspection && (
                <form
                  onSubmit={submit}
                  style={{
                    display: "grid",
                    gap: 14,
                    marginTop: 18,
                    width: "100%",
                  }}
                >
                  <label>
                    Room Condition
                    <select
                      value={form.condition}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          condition: e.target.value,
                        })
                      }
                      style={{ display: "block", width: "100%", padding: 12 }}
                    >
                      <option value="GOOD">Good</option>
                      <option value="NEEDS_REPAIR">
                        Needs Repair
                      </option>
                      <option value="DAMAGED">
                        Damaged
                      </option>
                    </select>
                  </label>

                  <label>
                    Inspection Notes
                    <textarea
                      required
                      minLength={10}
                      maxLength={2000}
                      rows={5}
                      value={form.notes}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          notes: e.target.value,
                        })
                      }
                      placeholder="Describe room condition and handover observations."
                      style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 12 }}
                    />
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={form.damageObserved}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          damageObserved: e.target.checked,
                        })
                      }
                    />
                    {" "}Damage observed during inspection
                  </label>

                  <div style={{
                    display: "flex",
                    gap: 10,
                  }}>
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={saving}
                    >
                      {saving
                        ? "Submitting..."
                        : "Submit Inspection"}
                    </button>

                    <button
                      type="button"
                      className="btn outline"
                      disabled={saving}
                      onClick={() => setSelectedId("")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
          </section>
        ))}
      </div>
    </div>
  );
}
