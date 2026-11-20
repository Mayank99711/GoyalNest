import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./TenantPortal.css";
const dateText = d => d ? new Date(d).toLocaleDateString("en-IN") : "Pending";
const money = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
export default function TenantVacate() {
  const [rows, setRows] = useState([]);
  const [dates, setDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() { const data = await api("/tenancies/mine"); setRows(Array.isArray(data) ? data : []); }
  useEffect(() => { load().catch(e=>setError(e.message)).finally(()=>setLoading(false)); }, []);
  async function request(event, tenancyId) {
    event.preventDefault(); setBusy(tenancyId); setError(""); setNotice("");
    try {
      const data = await api(`/tenancies/${tenancyId}/move-out`, { method: "POST", body: { requestedDate: dates[tenancyId] } });
      setNotice(data.message || "Vacate request submitted. Awaiting inspection and settlement."); await load();
    } catch(e) { setError(e.message); } finally { setBusy(""); }
  }
  return <main className="tp-page">
    <header className="tp-heading"><span>TENANCY LIFECYCLE</span><h2>Vacate Requests</h2><p>Request move-out, track inspection and deposit settlement without losing your history.</p></header>
    {error && <p className="tp-alert" role="alert">{error}</p>}{notice && <p className="tp-success" role="status">{notice}</p>}
    {loading ? <p>Loading tenancies...</p> : rows.length === 0 ? <div className="tp-panel tp-empty">No tenancy records available yet.</div> : <div className="tp-stack">
      {rows.map(t => <section className="tp-panel" key={t.id}>
        <div className="tp-row tp-between"><div><h3>{t.unit?.property?.title || "Property"}</h3><p className="tp-muted">{t.unit?.label || "Unit"} · Started {dateText(t.startDate)}</p></div><span className={`tp-status tp-${t.status.toLowerCase()}`}>{t.status.replaceAll("_", " ")}</span></div>
        {t.moveOut ? <div className="tp-detail-grid">
          <div><span>Requested move-out</span><strong>{dateText(t.moveOut.requestedDate)}</strong></div>
          <div><span>Inspection</span><strong>{t.moveOut.inspectionNotes ? "Recorded" : "Awaiting inspection"}</strong></div>
          <div><span>Deposit paid</span><strong>{money(t.depositPaid)}</strong></div>
          <div><span>Deduction</span><strong>{money(t.moveOut.deduction)}</strong></div>
          <div><span>Calculated refund</span><strong>{money(t.moveOut.refund)}</strong></div>
          <div><span>Settlement</span><strong>{t.moveOut.approved ? "Approved" : "Pending owner decision"}</strong></div>
          {t.moveOut.inspectionNotes && <p className="tp-muted">Inspection notes: {t.moveOut.inspectionNotes}</p>}
        </div> : t.status === "ACTIVE" ? <form className="tp-form tp-inline" onSubmit={e=>request(e,t.id)}>
          <label>Planned vacating date<input type="date" required min={new Date().toISOString().slice(0,10)} value={dates[t.id]||""} onChange={e=>setDates(p=>({...p,[t.id]:e.target.value}))}/></label>
          <button className="tp-button" disabled={!!busy}>{busy === t.id ? "Submitting..." : "Request Move-out"}</button>
          <p className="tp-hint">Submitting a request does not immediately end tenancy or release your bed. Physical checkout is handled separately.</p>
        </form> : <p className="tp-muted">Move-out requests are available when the tenancy is active.</p>}
      </section>)}
    </div>}
  </main>;
}
