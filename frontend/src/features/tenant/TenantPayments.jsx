import { createIdempotencySuffix } from "../../lib/idempotency";
import React, { useEffect, useState } from "react";
import RentPayments from "../rent/RentPayments";
import { api } from "../../lib/api";
import "./TenantPortal.css";
const formatMoney = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
export default function TenantPayments() {
  const [intents, setIntents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    const [tenancies, paymentIntents] = await Promise.all([
      api("/tenancies/mine"), api("/gateway-payments/intents/mine"),
    ]);
    setInvoices((Array.isArray(tenancies) ? tenancies : []).flatMap(t => (t.invoices||[]).map(i => ({ ...i, tenancyId:t.id, property:t.unit?.property?.title||"Property" }))));
    setIntents(Array.isArray(paymentIntents) ? paymentIntents : []);
  }
  useEffect(()=>{ load().catch(e=>setError(e.message)).finally(()=>setLoading(false)); }, []);
  async function initiate(invoice) {
    setBusy(invoice.id); setError(""); setNotice("");
    try {
      const key = `gn_${createIdempotencySuffix()}`;
      const response = await api("/gateway-payments/intents", { method: "POST", body: { invoiceId:invoice.id, idempotencyKey:key } });
      setNotice(response.nextStep || "Payment intent created. No money has been charged."); await load();
    } catch(e) { setError(e.message); } finally { setBusy(""); }
  }
  const eligible = invoices.filter(i=>["PENDING","OVERDUE"].includes(i.status) && !intents.some(v=>v.invoiceId===i.id));
  return <main className="tp-page">
    <header className="tp-heading"><span>FINANCIAL OVERVIEW</span><h2>Rent & Payment Centre</h2><p>Review invoices, due dates, payment history and available payment options.</p></header>
    <section className="tp-panel"><div className="tp-row tp-between"><div><h3>Secure Payment Gateway</h3><p className="tp-muted">Gateway integration is currently unavailable. Payment intents record requests only; they never charge your account.</p></div><span className="tp-status tp-requested">NOT CONFIGURED</span></div>
      {error && <p className="tp-alert" role="alert">{error}</p>}{notice && <p className="tp-success" role="status">{notice}</p>}
      {loading ? <p>Loading payment options...</p> : <>
        {eligible.length === 0 && <p className="tp-muted">No new eligible invoices for gateway intent creation.</p>}
        {eligible.map(i=><div className="tp-record" key={i.id}><div><strong>{i.property} · {i.period}</strong><p>{formatMoney(i.amount+i.penalty)} · {i.status}</p></div><button className="tp-outline" disabled={!!busy} onClick={()=>initiate(i)}>{busy===i.id ? "Processing..." : "Create Payment Intent"}</button></div>)}
        {intents.length>0 && <><h4>Payment Intent History</h4>{intents.map(v=><div className="tp-record" key={v.id}><div><strong>{formatMoney(v.amount)} · {v.status}</strong><p className="tp-muted">{new Date(v.createdAt).toLocaleDateString("en-IN")} · Provider: {v.provider}</p></div><span className="tp-status tp-requested">NO CHARGE</span></div>)}</>}
      </>}
    </section>
    <div className="tp-payment-existing"><RentPayments /></div>
  </main>;
}
