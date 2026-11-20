import React, { useState } from "react";
import { useRemote } from "../../components/UI";
import BookingKYCReview from "./BookingKYCReview";
import "./ProfessionalWorkbench.css";
const date = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "—");
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
export default function BookingApprovals() {
  const { data, error, busy, reload } = useRemote("/bookings/mine");
  const [filter, setFilter] = useState("ALL"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState(null),
    [processing, setProcessing] = useState(false),
    [message, setMessage] = useState(""),
    [readiness, setReadiness] = useState(null),
    [readinessError, setReadinessError] = useState(""),
    [readinessBusy, setReadinessBusy] = useState(false);
  const rows = Array.isArray(data) ? data : [];
  const visible = rows.filter(
    (b) =>
      (filter === "ALL" || b.status === filter) &&
      `${b.tenant?.name || ""} ${b.tenant?.email || ""} ${b.unit?.property?.title || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function loadReadiness(booking) {
    setReadiness(null);
    setReadinessError("");
    if (!booking || booking.status !== "APPROVED") return;
    setReadinessBusy(true);
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}/move-in-readiness`, { credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load move-in readiness");
      setReadiness(result);
    } catch (error) {
      setReadinessError(error.message);
    } finally {
      setReadinessBusy(false);
    }
  }
  function openBooking(booking) {
    setSelected(booking);
    loadReadiness(booking);
  }
  async function activateTenancy() {
    if (!readiness?.activationEligible || !readiness?.tenancyId) return;
    if (!window.confirm("Activate this tenancy? The manager can then verify physical check-in.")) return;
    setProcessing(true);
    setReadinessError("");
    try {
      const response = await fetch(`/api/tenancies/${encodeURIComponent(readiness.tenancyId)}/activate`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Activation failed");
      setMessage("Tenancy activated. Assigned manager can verify physical arrival.");
      await loadReadiness(selected);
      reload();
    } catch (error) {
      setReadinessError(error.message);
    } finally {
      setProcessing(false);
    }
  }
  async function decide(b, approve) {
    if (
      !window.confirm(
        `Are you sure you want to ${approve ? "approve" : "reject"} this booking?`,
      )
    )
      return;
    setProcessing(true);
    setMessage("");
    try {
      const r = await fetch(`/api/bookings/${b.id}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Booking decision failed");
      setSelected(null);
      setMessage(`Booking ${approve ? "approved" : "rejected"}.`);
      reload();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setProcessing(false);
    }
  }
  return (
    <div className="gn-workbench">
      <section className="gn-surface">
        <header className="gn-work-head">
          <div>
            <h2>Booking Approvals</h2>
            <p>Review, decide and track tenant booking requests.</p>
          </div>
        </header>
        <div className="gn-refund-summary">
          <div>
            <span>Total requests</span>
            <strong>{rows.length}</strong>
          </div>
          <div>
            <span>Pending approval</span>
            <strong>{rows.filter((b) => b.status === "PENDING").length}</strong>
          </div>
          <div>
            <span>Reviewed</span>
            <strong>{rows.filter((b) => b.status !== "PENDING").length}</strong>
          </div>
        </div>
        {message && (
          <p role="status" className="gn-work-success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="gn-work-alert">
            {error}
          </p>
        )}
        <div className="gn-toolbar">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenant or property..."
            aria-label="Search bookings"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter booking status"
          >
            <option value="ALL">All bookings</option>
            {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="gn-table-scroll">
          <table className="gn-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Property / Room</th>
                <th>Move-in</th>
                <th>Monthly Rent</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.tenant?.name || "Unknown"}</strong>
                    <small>{b.tenant?.email || ""}</small>
                  </td>
                  <td>
                    {b.unit?.property?.title || "—"}
                    <small>{b.unit?.label || "—"}</small>
                  </td>
                  <td>{date(b.moveIn)}</td>
                  <td>{money(b.unit?.rent)}</td>
                  <td>
                    <span
                      className={`gn-status ${b.status === "APPROVED" ? "good" : b.status === "PENDING" ? "pending" : "muted"}`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn outline"
                      onClick={() => openBooking(b)}
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
              {!busy && !visible.length && (
                <tr>
                  <td colSpan="6" className="gn-empty">
                    No bookings match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (
        <div
          className="gn-modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Booking details"
            className="gn-work-modal gn-modal-wide"
          >
            <header className="gn-work-head">
              <div>
                <h3>Booking Details</h3>
                <p>Request {selected.id}</p>
              </div>
              <button
                className="gn-icon-button"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ×
              </button>
            </header>
            <div className="gn-detail-grid">
              <div>
                <span>Tenant</span>
                <strong>{selected.tenant?.name}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{selected.tenant?.email}</strong>
              </div>
              <div>
                <span>Property</span>
                <strong>{selected.unit?.property?.title}</strong>
              </div>
              <div>
                <span>Unit</span>
                <strong>{selected.unit?.label}</strong>
              </div>
              <div>
                <span>Move-in</span>
                <strong>{date(selected.moveIn)}</strong>
              </div>
              <div>
                <span>Rent</span>
                <strong>{money(selected.unit?.rent)}</strong>
              </div>
              <div>
                <span>Deposit requested</span>
                <strong>{selected.wantsDeposit ? "Yes" : "No"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{selected.status}</strong>
              </div>
            </div>
            {selected.status === "APPROVED" && (
              <section className="gn-movein-readiness" aria-label="Move-in readiness" style={{ marginTop: 20, padding: 18, border: "1px solid #d9e6dd", borderRadius: 14, background: "#f6faf7" }}>
                <h4 style={{ margin: "0 0 8px" }}>Move-in readiness</h4>
                {readinessBusy && <p role="status">Checking tenancy and agreement...</p>}
                {readinessError && <p role="alert" className="gn-work-alert">{readinessError}</p>}
                {readiness && <>
                  <div className="gn-detail-grid">
                    <div><span>Tenancy</span><strong>{readiness.tenancyStatus || "Not created"}</strong></div>
                    <div><span>Rental agreement</span><strong>{readiness.agreementSigned ? "Signed" : readiness.agreementCreated ? "Waiting for tenant signature" : "Not generated"}</strong></div>
                    <div><span>Security deposit</span><strong>{`${money(readiness.depositPaid)} / ${money(readiness.depositRequired)}`}</strong></div>
                    <div><span>Physical check-in</span><strong>{readiness.checkInAt ? date(readiness.checkInAt) : "Not confirmed"}</strong></div>
                    <div><span>Assigned manager(s)</span><strong>{readiness.assignedManagers.length ? readiness.assignedManagers.map((m) => m.name || m.email).join(", ") : "None assigned"}</strong></div>
                  </div>
                  <p style={{ marginTop: 12 }}><strong>Next step:</strong> {readiness.nextAction}</p>
                  <p style={{ fontSize: 13, color: "#53685e" }}>Approved booking is not the same as active tenancy or physical check-in. Agreement and deposit checks are enforced by the backend.</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                    <a className="btn outline" href="/dashboard/agreements">Manage agreements</a>
                    <a className="btn outline" href="/dashboard/employees">Manager assignments</a>
                    {readiness.activationEligible && <button type="button" className="btn primary" disabled={processing} onClick={activateTenancy}>{processing ? "Activating..." : "Activate tenancy"}</button>}
                    <button type="button" className="btn outline" disabled={readinessBusy} onClick={() => loadReadiness(selected)}>Refresh status</button>
                  </div>
                </>}
              </section>
            )}
            {selected.status === "PENDING" && (
              <>
                <div className="gn-kyc-in-modal">
                  <BookingKYCReview bookingId={selected.id} />
                </div>
                <footer className="gn-modal-footer">
                  <button
                    className="btn outline gn-danger"
                    disabled={processing}
                    onClick={() => decide(selected, false)}
                  >
                    Reject
                  </button>
                  <button
                    className="btn primary"
                    disabled={processing}
                    onClick={() => decide(selected, true)}
                  >
                    Approve Booking
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
