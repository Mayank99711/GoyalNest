import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./AdminSubscriptionCheckoutHistory.css";

const rupees = paise => `₹${(Number(paise || 0) / 100).toLocaleString("en-IN", {maximumFractionDigits:2})}`;
const when = value => value ? new Date(value).toLocaleString("en-IN") : "—";
const meanings = {
  TEST_PAID: ["Test payment captured", "No real money or subscription activation"],
  PAID: ["Gateway verified", "Verified payment; subscription entitlement should be reconciled"],
  CREATED: ["Awaiting payment", "Provider order created; not yet paid"],
  CREATING: ["Preparing", "Checkout order creation in progress"],
  REVIEW_REQUIRED: ["Manual review", "Gateway result requires reconciliation"],
  FAILED: ["Failed", "Checkout failed; no entitlement"],
};
export default function AdminSubscriptionCheckoutHistory() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({checkouts:[],total:0,totalPages:0});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => { const timer = setTimeout(() => setSubmittedQuery(query.trim()), 350); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(1); }, [submittedQuery, status]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    api(`/admin-subscriptions/checkouts?${new URLSearchParams({page: String(page), ...(submittedQuery ? {search: submittedQuery} : {}), ...(status ? {status} : {})}).toString()}`)
      .then(data=>{if(active){setResult(data);setError("");}})
      .catch(e=>{if(active)setError(e.message||"Unable to load checkout history");})
      .finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[page,refresh,submittedQuery,status]);
  const rows = result.checkouts || [];
  return <section className="gnch-root" aria-label="Subscription checkout history">
    <header className="gnch-head"><div><span className="gnch-eyebrow">PAYMENT OPERATIONS</span><h2>Subscription checkout history</h2><p>Payment attempts are shown separately from active subscription entitlements. TEST payments are not revenue.</p></div><button type="button" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>↻ Refresh history</button></header>
    <div className="gnch-info">A Razorpay test capture produces <strong>TEST_PAID</strong> and does <strong>not</strong> activate an owner's plan. Only backend-verified live <strong>PAID</strong> checkouts can create subscriptions.</div>
    <div className="gnch-filters"><label htmlFor="gnch-search">Search all checkout history</label><input id="gnch-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Owner name, email, plan or status"/><label htmlFor="gnch-status">Status</label><select id="gnch-status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{Object.keys(meanings).map(key=><option key={key} value={key}>{meanings[key][0]}</option>)}</select><button type="button" className="gnch-clear" disabled={!query&&!status} onClick={()=>{setQuery("");setStatus("");}}>Clear</button><span aria-live="polite">{result.total||0} matching checkout(s)</span></div>
    {error&&<p role="alert" className="gnch-error">{error}</p>}
    <div className="gnch-scroll"><table><thead><tr><th>Owner</th><th>Plan</th><th>Amount</th><th>Gateway state</th><th>Created</th><th>Fulfilled</th></tr></thead><tbody>
      {rows.map(c=>{const [label,detail]=meanings[c.status]||[c.status,"Not verified"];return <tr key={c.id}><td><strong>{c.owner?.name||"Unknown owner"}</strong><small>{c.owner?.email||"—"}</small></td><td>{c.plan||c.referenceId||"—"}</td><td>{rupees(c.amountPaise)}</td><td><span className={`gnch-pill gnch-${c.status?.toLowerCase()}`}>{label}</span><small>{detail}</small></td><td>{when(c.createdAt)}</td><td>{when(c.fulfilledAt)}</td></tr>})}
      {!busy&&!rows.length&&<tr><td colSpan={6} className="gnch-empty">No matching checkout attempts for these filters. This does not prove that a subscription exists.</td></tr>}
      {busy&&<tr><td colSpan={6} className="gnch-empty">Loading checkout attempts…</td></tr>}
    </tbody></table></div>
    <footer className="gnch-footer"><span>Page {page} of {Math.max(1,result.totalPages||1)}</span><div><button type="button" disabled={busy||page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><button type="button" disabled={busy||page>=result.totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></div></footer>
  </section>;
}
