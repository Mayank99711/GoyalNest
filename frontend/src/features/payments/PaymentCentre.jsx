import { createIdempotencySuffix } from "../../lib/idempotency";
import OfflinePayments from "./OfflinePayments";
import UnifiedRentModal from "./UnifiedRentModal";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import "./PaymentCentre.css";

const INR = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const date = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const canRequest = invoice => ["PENDING", "OVERDUE"].includes(invoice.status) && invoice.outstanding > 0;
const pretty = value => String(value || "—").replaceAll("_", " ");
const empty = { summary: {}, invoices: [], payments: [], intents: [], subscriptions: [] };

function Status({ value }) {
  const key = String(value || "").toLowerCase();
  const tone = key === "paid" || key === "active" || key === "succeeded" || key === "real_paid" ? "good"
    : key === "overdue" || key === "failed" || key === "cancelled" ? "bad" : "pending";
  return <span className={`gpc-status gpc-${tone}`}>{pretty(value)}</span>;
}

function Card({ title, value, hint }) {
  return <div className="gpc-stat"><span>{title}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

export default function PaymentCentre() {
  const { user } = useAuth();
  const isTenant = user?.role === "TENANT";
  const isOwner = user?.role === "OWNER";
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("invoices");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api("/payment-center/overview");
      setData(result);
      setError("");
    } catch (e) { setError(e.message || "Unable to load billing information"); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => (data.invoices || []).filter(i => {
    if (filter !== "ALL" && i.status !== filter) return false;
    const term = search.trim().toLowerCase();
    return !term || `${i.property} ${i.tenantName} ${i.period} ${i.unit}`.toLowerCase().includes(term);
  }), [data.invoices, filter, search]);
  const lastIntent = invoiceId => (data.intents || []).find(v => v.invoiceId === invoiceId && ["CREATED", "PROCESSING", "SUCCEEDED"].includes(v.status));

  async function requestPayment(invoice) {
    setBusy(invoice.id); setError(""); setNotice("");
    try {
      const idempotencyKey = `gn_${createIdempotencySuffix()}`;
      const response = await api("/payment-center/intents", {
        method: "POST", body: { invoiceId: invoice.id, idempotencyKey },
      });
      setNotice(response.message);
      setSelected(null);
      await load(true);
      setTab("requests");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  async function cancelIntent(intent) {
    setBusy(intent.id); setError(""); setNotice("");
    try {
      await api(`/payment-center/intents/${encodeURIComponent(intent.id)}/cancel`, { method: "POST" });
      setNotice("Unprocessed payment request cancelled. No money was charged.");
      await load(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  if (!isTenant && !isOwner) return <p>Payment Centre is available to tenants and property owners only.</p>;
  const summary = data.summary || {};
  const currentSub = (data.subscriptions || []).find(s => new Date(s.expiresAt).getTime() > Date.now());

  return <main className="gpc-root">
    <header className="gpc-hero">
      <div><span className="gpc-kicker">GOYALNEST · FINANCIAL WORKSPACE</span>
        <h2>{isTenant ? "Rent & Payments" : "Collections & Billing"}</h2>
        <p>{isTenant ? "Stay on top of your rent, dues and payment requests." : "Track property receivables and subscription records in one place."}</p>
      </div>
      <button className="gpc-refresh" type="button" onClick={() => load()} disabled={loading}>↻ Refresh</button>
    </header>

    <div className="gpc-notice"><span aria-hidden="true">ⓘ</span><div><strong>Payment methods</strong><p>Choose Online (Razorpay), Cash or Cheque directly from Review dues. Cash/Cheque requests require owner verification. TEST online payments do not settle real invoices; demo receipts are not real transfers.</p></div></div>
    {error && <div className="gpc-alert" role="alert">{error}</div>}
    {notice && <div className="gpc-confirm" role="status">{notice}</div>}

    <div className="gpc-stats">
      <Card title="Outstanding balance" value={INR(summary.outstanding)} hint="Across available rent invoices"/>
      <Card title={isTenant ? "Demo rent recorded" : "Demo collections recorded"} value={INR(summary.demoCollected)} hint="Not a real bank settlement"/>
      <Card title="Unpaid invoices" value={summary.openInvoices || 0} hint={`${summary.overdue || 0} overdue`}/>
      <Card title="Invoices on record" value={summary.invoices || 0} hint="Your authorized properties"/>
    </div>

    {isOwner && <section className="gpc-panel gpc-subsummary">
      <div><div className="gpc-section-kicker">OWNER SUBSCRIPTION</div><h3>{currentSub ? currentSub.plan : "No active subscription"}</h3><p>{currentSub ? `Expires ${date(currentSub.expiresAt)} · ${currentSub.listingLimit} listing slots` : "Choose a plan in My Subscription to submit a billing request."}</p></div>
      <div><strong>{currentSub ? INR(currentSub.price) : "—"}</strong><small>Plan record — not proof of payment</small><a href="/dashboard/subscriptions" className="gpc-primary-link">View subscription</a></div>
    </section>}

    <section className="gpc-panel">
      <div className="gpc-tabs" role="tablist" aria-label="Payment records">
        <button role="tab" aria-selected={tab === "invoices"} className={tab === "invoices" ? "active" : ""} onClick={() => setTab("invoices")}>Invoices</button>
        {isTenant && <button role="tab" aria-selected={tab === "requests"} className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Payment requests <span>{data.intents?.length || 0}</span></button>}
        <button role="tab" aria-selected={tab === "offline"} className={tab === "offline" ? "active" : ""} onClick={() => setTab("offline")}>Cash / Cheque Payments</button>
        <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Payment history</button>
        {isOwner && <button role="tab" aria-selected={tab === "subscriptions"} className={tab === "subscriptions" ? "active" : ""} onClick={() => setTab("subscriptions")}>Plan records</button>}
      </div>

      {tab === "invoices" && <>
        <div className="gpc-tools"><div><h3>Rent invoices</h3><p>Current billing and outstanding balances</p></div><div className="gpc-controls"><input aria-label="Search invoices" placeholder="Search property, tenant or month" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter invoice status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option></select></div></div>
        {loading ? <p className="gpc-empty">Loading invoices…</p> : visible.length === 0 ? <p className="gpc-empty">No matching invoices found.</p> :
          <div className="gpc-scroll"><table><thead><tr><th>Property / unit</th><th>Billing period</th><th>Due</th><th>Amount</th><th>Outstanding</th><th>Status</th>{isTenant && <th>Action</th>}</tr></thead><tbody>{visible.map(i => <tr key={i.id}><td><strong>{i.property}</strong><small>{i.unit}{isOwner ? ` · ${i.tenantName}` : ""}</small></td><td>{i.period}</td><td>{date(i.dueDate)}</td><td>{INR(i.total)}</td><td><strong>{INR(i.outstanding)}</strong></td><td><Status value={i.outstanding > 0 && (i.demoPaid > 0 || i.realPaid > 0) ? "PARTIALLY_PAID" : i.status}/></td>{isTenant && <td>{canRequest(i) && ["ACTIVE", "VACATING", "PENDING_PAYMENT"].includes(i.tenancyStatus) ? <button className="gpc-small-action" onClick={() => setSelected(i)}>{"Pay rent"}</button> : "—"}</td>}</tr>)}</tbody></table></div>}
      </>}

      {tab === "requests" && isTenant && <><div className="gpc-tools"><div><h3>Payment requests</h3><p>Records of gateway requests, not actual charges</p></div></div><div className="gpc-scroll"><table><thead><tr><th>Request ID</th><th>Amount</th><th>Status</th><th>Provider</th><th>Created</th><th>Action</th></tr></thead><tbody>{(data.intents || []).map(v=><tr key={v.id}><td><code>{v.id.slice(0, 12)}…</code></td><td>{INR(v.amount)}</td><td><Status value={v.status}/></td><td>{v.provider}</td><td>{date(v.createdAt)}</td><td>{v.status === "CREATED" && <button className="gpc-small-action" disabled={!!busy} onClick={()=>cancelIntent(v)}>{busy === v.id ? "Cancelling…" : "Cancel request"}</button>}</td></tr>)}</tbody></table></div>{!data.intents?.length && <p className="gpc-empty">No payment requests yet.</p>}</>}

      {tab === "history" && <><div className="gpc-tools"><div><h3>Payment ledger</h3><p>Historical recorded payments; demo records are not bank receipts</p></div></div><div className="gpc-scroll"><table><thead><tr><th>Recorded</th><th>Kind</th><th>Amount</th><th>Status</th><th>Reference</th></tr></thead><tbody>{(data.payments || []).map(p => <tr key={p.id}><td>{date(p.createdAt)}</td><td>{pretty(p.kind)}</td><td>{INR(p.amount)}</td><td><Status value={p.status}/></td><td><code>{p.id.slice(0, 12)}…</code></td></tr>)}</tbody></table></div>{!data.payments?.length && <p className="gpc-empty">No recorded payments found.</p>}</>}

      {tab === "subscriptions" && isOwner && <><div className="gpc-tools"><div><h3>Subscription records</h3><p>Subscription history, not gateway receipts</p></div></div><div className="gpc-scroll"><table><thead><tr><th>Plan</th><th>Configured price</th><th>Listings</th><th>Created</th><th>Expires</th><th>Status</th></tr></thead><tbody>{(data.subscriptions || []).map(s => <tr key={s.id}><td><strong>{s.plan}</strong></td><td>{INR(s.price)}</td><td>{s.listingLimit}</td><td>{date(s.createdAt)}</td><td>{date(s.expiresAt)}</td><td><Status value={new Date(s.expiresAt) > new Date() ? "ACTIVE" : "EXPIRED"}/></td></tr>)}</tbody></table></div>{!data.subscriptions?.length && <p className="gpc-empty">No subscription records found.</p>}</>}
    </section>

    {tab === "offline" && <OfflinePayments tenant={isTenant} invoices={data.invoices||[]} onUpdated={() => load(true)}/>}

    {selected && <UnifiedRentModal invoice={selected} onClose={() => setSelected(null)} onUpdated={() => load(true)} />}
  </main>;
}
