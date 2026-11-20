import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import "./TenantTenancyPro.css";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const date = (value) => {
  if (!value) return "Not available";
  const result = new Date(value);
  return Number.isNaN(result.getTime()) ? "Not available" : result.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const normalize = (value) => String(value || "").toUpperCase();
const closed = (t) => ["VACATED", "CANCELLED", "REJECTED", "COMPLETED"].includes(normalize(t.status)) || Boolean(t.checkOutAt);
const label = (status) => ({ PENDING_PAYMENT: "Move-in pending", ACTIVE: "Currently staying", VACATING: "Moving out", VACATED: "Stay completed", CANCELLED: "Cancelled" }[normalize(status)] || String(status || "Unknown").replaceAll("_", " "));
const todayIndia = () => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

function Summary({ title, value, hint }) {
  return <div className="ttp-summary"><span>{title}</span><strong>{value}</strong><small>{hint}</small></div>;
}
function Timeline({ tenancy }) {
  const agreement = (tenancy.agreements || []).find(a => a.signedAt);
  const steps = [
    { name: "Booking", complete: true },
    { name: "Agreement", complete: Boolean(agreement) },
    { name: "Move-in", complete: Boolean(tenancy.checkInAt) || ["ACTIVE", "VACATING", "VACATED"].includes(normalize(tenancy.status)) },
    { name: "Move-out", complete: closed(tenancy) && normalize(tenancy.status) === "VACATED" },
  ];
  return <ol className="ttp-timeline" aria-label="Rental journey progress">{steps.map((step, i) => <li key={step.name} className={step.complete ? "is-done" : ""}><span>{step.complete ? "✓" : i + 1}</span><small>{step.name}</small></li>)}</ol>;
}

export default function TenantTenancyPro() {
  const navigate = useNavigate();
  const [tenancies, setTenancies] = useState([]);
  const [activeTab, setActiveTab] = useState("current");
  const [selectedId, setSelectedId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [requestDate, setRequestDate] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api("/tenancies/mine");
      if (!Array.isArray(result)) throw new Error("Unexpected tenancy response");
      setTenancies(result);
      setError("");
    } catch (err) { setError(err?.message || "Unable to load your tenancies."); }
    finally { if (!quiet) setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const sorted = useMemo(() => [...tenancies].sort((a, b) => new Date(b.createdAt || b.startDate || 0) - new Date(a.createdAt || a.startDate || 0)), [tenancies]);
  const current = sorted.filter(t => !closed(t));
  const past = sorted.filter(closed);
  const visible = activeTab === "current" ? current : past;
  const selection = visible.find(t => t.id === selectedId) || visible[0] || null;
  const pendingAmount = tenancies.reduce((sum, t) => sum + (t.invoices || []).filter(i => ["PENDING", "OVERDUE", "PARTIALLY_PAID"].includes(normalize(i.status))).reduce((s, i) => s + (Number(i.amount) || 0), 0), 0);
  const agreements = selection?.agreements || [];
  const signed = agreements.find(a => a.signedAt);
  const isOpen = selection && !closed(selection);

  async function submitMoveOut(event) {
    event.preventDefault();
    if (!selection || normalize(selection.status) !== "ACTIVE" || selection.moveOut || !requestDate || requestDate < todayIndia()) return;
    if (!window.confirm("Submit move-out request for this tenancy?")) return;
    setRequesting(true); setError(""); setNotice("");
    try {
      await api(`/tenancies/${encodeURIComponent(selection.id)}/move-out`, { method: "POST", body: { requestedDate: `${requestDate}T12:00:00+05:30` } });
      setNotice("Move-out request submitted. You can track its progress here.");
      setRequestDate("");
      await reload({ quiet: true });
    } catch (err) { setError(err?.message || "Move-out request could not be submitted."); }
    finally { setRequesting(false); }
  }

  return <main className="ttp-page">
    <div className="ttp-heading"><div><div className="ttp-eyebrow">TENANT PORTAL / MY STAY</div><h2>My Tenancy</h2><p>Everything about your home, payments, documents and move-out — in one place.</p></div><button className="ttp-button ttp-outline" onClick={() => reload()} disabled={loading}>↻ Refresh</button></div>
    {error && <div className="ttp-alert ttp-error" role="alert">{error}</div>}
    {notice && <div className="ttp-alert ttp-success" role="status">{notice}</div>}
    <div className="ttp-stats"><Summary title="Current stays" value={current.length} hint="Active and upcoming"/><Summary title="Past stays" value={past.length} hint="Completed and cancelled"/><Summary title="Invoice amount pending" value={money(pendingAmount)} hint="Across recorded tenancies"/></div>
    <section className="ttp-maincard">
      <div className="ttp-section-header"><div><h3>Your rental history</h3><p>Choose a stay to view its full details.</p></div><div className="ttp-tabs" role="group" aria-label="Tenancy status"><button className={activeTab === "current" ? "selected" : ""} onClick={() => { setActiveTab("current"); setSelectedId(""); }}>Current / Upcoming ({current.length})</button><button className={activeTab === "past" ? "selected" : ""} onClick={() => { setActiveTab("past"); setSelectedId(""); }}>Past Stays ({past.length})</button></div></div>
      {loading ? <div className="ttp-empty" role="status">Loading your rental details…</div> : !visible.length ? <div className="ttp-empty"><strong>{activeTab === "current" ? "No current stay" : "No past stays"}</strong><p>{activeTab === "current" ? "When your booking is approved, your tenancy will appear here." : "Completed and cancelled rental records appear here."}</p><button className="ttp-button ttp-dark" onClick={() => navigate("/properties")}>Explore Properties</button></div> : <>
        {visible.length > 1 && <div className="ttp-stay-selector" aria-label="Choose tenancy">{visible.map(t => <button key={t.id} className={selection?.id === t.id ? "chosen" : ""} onClick={() => { setSelectedId(t.id); setShowAll(false); }}><strong>{t.unit?.property?.title || "Rental Property"}</strong><small>{t.unit?.label || "Room"} · {date(t.startDate)} · {label(t.status)}</small></button>)}</div>}
        {selection && <div className="ttp-body"><div className="ttp-stay-head"><div><span className="ttp-caption">{activeTab === "past" ? "PAST RENTAL" : "YOUR RENTAL"}</span><h3>{selection.unit?.property?.title || "Rental Property"}</h3><p>{selection.unit?.label || "Unit not specified"} · {selection.unit?.property?.city || ""}</p></div><span className={`ttp-status ttp-status-${normalize(selection.status).toLowerCase()}`}>{label(selection.status)}</span></div>
          <Timeline tenancy={selection}/>
          <div className="ttp-detail-grid"><div><span>Monthly rent</span><strong>{money(selection.rent)}</strong></div><div><span>Start date</span><strong>{date(selection.startDate)}</strong></div><div><span>Check-in</span><strong>{date(selection.checkInAt)}</strong></div><div><span>Checkout</span><strong>{date(selection.checkOutAt)}</strong></div></div>
          {selection.checkOutAt && selection.startDate && new Date(selection.checkOutAt) < new Date(selection.startDate) && <div className="ttp-alert ttp-warning">Recorded checkout is earlier than the tenancy start date. Please contact support to verify this historical record.</div>}
          {normalize(selection.status) === "VACATED" && <div className="ttp-alert ttp-success">This stay is completed. Cancellation and new move-out requests are no longer available.</div>}
          <div className="ttp-panels">
            <section className="ttp-panel"><div className="ttp-panel-head"><h4>Rental agreement</h4><span>{signed ? "Signed" : agreements.length ? "Awaiting signature" : "Not created"}</span></div><p>{signed ? `Signed on ${date(signed.signedAt)}. Your agreement remains available in Documents.` : agreements.length ? "Review and sign your rental agreement to continue your move-in." : "Your Owner has not generated a rental agreement yet."}</p><button className="ttp-button ttp-outline" onClick={() => navigate("/dashboard/agreements")}>{signed ? "View Agreement & Documents" : "Open Agreements"} →</button></section>
            <section className="ttp-panel"><div className="ttp-panel-head"><h4>Rent & invoices</h4><span>{(selection.invoices || []).length} invoices</span></div>{(selection.invoices || []).length ? <div className="ttp-invoices">{[...(selection.invoices || [])].sort((a,b) => new Date(b.dueDate || 0)-new Date(a.dueDate || 0)).slice(0,showAll ? undefined : 3).map(invoice => <div className="ttp-invoice" key={invoice.id}><div><strong>{invoice.period || "Rent invoice"}</strong><small>Due {date(invoice.dueDate)}</small></div><strong>{money(invoice.amount)}</strong><span className={`ttp-invoice-state ${normalize(invoice.status) === "PAID" ? "paid" : ""}`}>{String(invoice.status || "Pending").replaceAll("_", " ")}</span></div>)}</div> : <p>No rent invoices recorded for this stay.</p>}<div className="ttp-inline-actions">{(selection.invoices || []).length > 3 && <button className="ttp-text-button" onClick={() => setShowAll(x => !x)}>{showAll ? "Show less" : "Show all invoices"}</button>}<button className="ttp-button ttp-outline" onClick={() => navigate("/dashboard/rent")}>Rent & Payments →</button></div></section>
            <section className="ttp-panel ttp-move"><div className="ttp-panel-head"><h4>Move-out & settlement</h4><span>{selection.moveOut ? "Request recorded" : "No request"}</span></div>{selection.moveOut ? <div className="ttp-move-details"><p><strong>Requested date:</strong> {date(selection.moveOut.requestedDate)}</p><p><strong>Inspection:</strong> {selection.moveOut.inspectionNotes || "Awaiting inspection"}</p><p><strong>Settlement:</strong> {selection.moveOut.approved ? "Approved" : "Pending"}</p>{selection.moveOut.approved && <p><strong>Deposit refund approved:</strong> {money(selection.moveOut.refund)} <small>Approval does not confirm bank transfer.</small></p>}</div> : normalize(selection.status) === "ACTIVE" ? <form className="ttp-move-form" onSubmit={submitMoveOut}><p>Planning to leave? Choose a proposed move-out date and submit a request for inspection.</p><label htmlFor="ttp-date">Proposed move-out date</label><input id="ttp-date" type="date" min={todayIndia()} value={requestDate} onChange={e => setRequestDate(e.target.value)} required/><button type="submit" className="ttp-button ttp-dark" disabled={requesting || !requestDate || requestDate < todayIndia()}>{requesting ? "Submitting…" : "Request Move-out"}</button></form> : <p>{closed(selection) ? "This rental is closed. Its move-out history is read-only." : "Move-out requests become available after your tenancy is active."}</p>}</section>
            <section className="ttp-panel"><div className="ttp-panel-head"><h4>Help & support</h4><span>Tenant services</span></div><p>Need assistance with room issues, agreement terms or a payment discrepancy?</p><div className="ttp-inline-actions"><button className="ttp-button ttp-outline" onClick={() => navigate("/dashboard/maintenance")}>Maintenance</button><button className="ttp-button ttp-outline" onClick={() => navigate("/dashboard/my-disputes")}>Disputes</button></div></section>
          </div>
        </div>}
      </>}
    </section>
  </main>;
}
