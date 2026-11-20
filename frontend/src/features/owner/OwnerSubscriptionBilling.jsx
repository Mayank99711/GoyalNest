import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./OwnerSubscriptionBilling.css";

const money = value => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const date = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const PLAN_ORDER = ["STARTER", "PRO", "BUSINESS"];

export default function OwnerSubscriptionBilling() {
  const [info, setInfo] = useState(null);
  const [plans, setPlans] = useState({});
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("STARTER");
  const [action, setAction] = useState("RENEW");
  const [note, setNote] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [summary, available, pending] = await Promise.all([
        api("/owner-workspace/subscription"),
        api("/subscriptions/plans"),
        api("/subscription-billing/requests/mine"),
      ]);
      setInfo(summary);
      setPlans(available || {});
      setRequests(pending.requests || []);
      setSelected(previous => summary.active?.plan && previous === "STARTER" ? summary.active.plan : previous);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy || requests.some(r => r.status === "PENDING")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/subscription-billing/requests", {
        method: "POST", body: { plan: selected, action, note: note.trim() },
      });
      setNotice(result.message || "Request submitted");
      setNote("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const active = info?.active;
  const latest = info?.latest;
  const used = info?.usedListings || 0;
  const limit = active?.listingLimit || 0;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const hasPending = requests.some(r => r.status === "PENDING");

  return (
    <main className="osb-page">
      <header className="osb-heading">
        <div><span className="osb-kicker">OWNER BILLING</span><h2>Subscription & Billing</h2><p>Manage listing entitlements, review subscription records and request plan changes.</p></div>
        <button type="button" className="osb-btn osb-outline" onClick={load} disabled={loading}>Refresh</button>
      </header>

      {error && <p className="osb-feedback osb-error" role="alert">{error}</p>}
      {notice && <p className="osb-feedback osb-success" role="status">{notice}</p>}
      {loading && <div className="osb-panel">Loading subscription details…</div>}

      {!loading && info && <>
        <section className="osb-summary">
          <div className="osb-panel osb-current">
            <div className="osb-title-row"><span>YOUR CURRENT PLAN</span><span className={`osb-badge ${active ? "osb-active" : "osb-expired"}`}>{active ? "ACTIVE" : latest ? "EXPIRED" : "NOT SUBSCRIBED"}</span></div>
            <h3>{active?.plan || "No active plan"}</h3>
            <div className="osb-amount">{active ? money(active.price) : "—"}<small>{active ? " / plan record" : ""}</small></div>
            <p>Expiry: <strong>{date(active?.expiresAt || latest?.expiresAt)}</strong></p>
            <p className="osb-muted">Plan record prices are not proof of payment or a billing receipt.</p>
          </div>
          <div className="osb-panel">
            <div className="osb-title-row"><span>LISTING ENTITLEMENT</span><strong>{used} / {limit}</strong></div>
            <div className="osb-progress"><span style={{ width: `${pct}%` }}/></div>
            <div className="osb-figures"><div><small>Used</small><strong>{used}</strong></div><div><small>Available</small><strong>{info.availableListings || 0}</strong></div><div><small>Limit</small><strong>{limit}</strong></div></div>
            <p className="osb-muted">Pending and published property listings consume slots.</p>
          </div>
        </section>

        <section className="osb-panel">
          <div className="osb-section-head"><div><h3>Compare subscription plans</h3><p>These are configured plan prices and listing limits, not payment options.</p></div></div>
          <div className="osb-plan-grid">{PLAN_ORDER.filter(k => plans[k]).map(key => <div key={key} className={`osb-plan ${active?.plan === key ? "osb-chosen" : ""}`}>
            <div className="osb-title-row"><strong>{key}</strong>{active?.plan === key && <span className="osb-badge osb-active">CURRENT</span>}</div>
            <div className="osb-plan-price">{money(plans[key].price)}<small> / configured plan</small></div><p>Up to {plans[key].limit} listing slots</p>
            <button type="button" className="osb-btn osb-outline" onClick={() => { setSelected(key); document.getElementById("osb-request")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Request {key}</button>
          </div>)}</div>
        </section>

        <section className="osb-panel" id="osb-request">
          <h3>Request a plan change or renewal</h3>
          <p className="osb-muted">Your request goes to an Admin for review. It does not charge your bank account or automatically change your plan.</p>
          <form className="osb-form" onSubmit={submit}>
            <label>Request type<select value={action} onChange={e => setAction(e.target.value)}><option value="NEW">New subscription</option><option value="UPGRADE">Change / upgrade plan</option><option value="RENEW">Renew plan</option></select></label>
            <label>Requested plan<select value={selected} onChange={e => setSelected(e.target.value)}>{PLAN_ORDER.filter(p => plans[p]).map(p => <option key={p} value={p}>{p}</option>)}</select></label>
            <label className="osb-wide">Note (optional)<textarea maxLength={500} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Tell Admin what you need…"/></label>
            <button className="osb-btn osb-primary" type="submit" disabled={busy || hasPending}>{busy ? "Submitting…" : hasPending ? "Request awaiting review" : "Submit request"}</button>
          </form>
        </section>

        <section className="osb-panel">
          <h3>My plan requests</h3>
          <div className="osb-scroll"><table><thead><tr><th>Requested</th><th>Action</th><th>Plan</th><th>Status</th><th>Admin response</th></tr></thead><tbody>
          {requests.map(item => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{item.action}</td><td>{item.requestedPlan}</td><td><span className="osb-badge">{item.status}</span></td><td>{item.adminNote || "—"}</td></tr>)}
          {!requests.length && <tr><td colSpan={5}>No subscription requests yet.</td></tr>}
          </tbody></table></div>
        </section>

        <section className="osb-panel">
          <h3>Subscription record history</h3>
          <p className="osb-muted">These are plan records. The current database does not store subscription payment receipts or gateway transaction IDs.</p>
          <div className="osb-scroll"><table><thead><tr><th>Created</th><th>Plan</th><th>Listed price</th><th>Listing limit</th><th>Expiry</th><th>Record status</th></tr></thead><tbody>
          {(info.history || []).map(row => <tr key={row.id}><td>{date(row.createdAt)}</td><td>{row.plan}</td><td>{money(row.price)}</td><td>{row.listingLimit}</td><td>{date(row.expiresAt)}</td><td>{new Date(row.expiresAt) > new Date() ? "Valid record" : "Expired"}</td></tr>)}
          {!(info.history || []).length && <tr><td colSpan={6}>No subscription records yet.</td></tr>}
          </tbody></table></div>
        </section>
        <p className="osb-disclaimer">Secure online payment checkout, receipts and automatic paid renewal will be available only after a real subscription payment gateway and verified webhook flow are configured.</p>
      </>}
    </main>
  );
}
