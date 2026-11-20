import "../owner/MyProperties.css";
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
const KEYS = ["dateValid", "signatureVerifiedByBank", "amountMatches", "balanceConfirmedByBank", "accountActiveByBank", "chequeNumberVerified", "bankDetailsChecked", "noOverwriting", "payeeMatches", "withinValidity", "notStoppedByBank", "notDuplicate"];
const LABELS = ["Cheque date valid", "Bank signature verification confirmed", "Amount in words and figures matches", "Bank confirms sufficient balance", "Bank confirms active account", "Cheque number verified", "Bank / branch / IFSC checked", "No unauthorized alterations", "Payee name correct", "Cheque within 3-month validity", "Bank confirms no stop payment", "Cheque not already paid"];
const currency = n => `₹${Number(n || 0).toLocaleString("en-IN")}`;
export default function OfflinePayments({ tenant, invoices = [], onUpdated }) {
  const [rows, setRows] = useState([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState("");
  const [fields, setFields] = useState({});
  const [message, setMessage] = useState("");
  const [review, setReview] = useState(null);
  const [checks, setChecks] = useState({});
  const [status, setStatus] = useState("UNDER_REVIEW");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedInvoice = useMemo(() => invoices.find(i => i.id === invoiceId), [invoiceId, invoices]);
  const outstanding = Number(selectedInvoice?.outstanding || 0);
  const numericAmount = Number(amount);
  const validAmount = Number.isSafeInteger(numericAmount) && numericAmount > 0 && numericAmount <= outstanding;
  const openInvoices = invoices.filter(i => ["PENDING", "OVERDUE"].includes(i.status) && i.outstanding > 0);
  const load = () => api("/offline-payments/mine").then(setRows).catch(e => setMessage(e.message));
  useEffect(() => { load(); }, []);
  const submit = async e => {
    e.preventDefault(); if (!validAmount || busy) return;
    setBusy(true);
    try {
      await api("/offline-payments", { method: "POST", body: { invoiceId, method, amount: numericAmount, ...(method === "CHEQUE" ? fields : {}) } });
      setMessage(`Request for ${currency(numericAmount)} submitted. This is not a confirmed payment. Owner verification is required.`);
      setAmount(""); load(); onUpdated?.();
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const decide = async e => {
    e.preventDefault(); if (busy) return; setBusy(true);
    try {
      const result = await api(`/offline-payments/${review.id}/review`, { method: "PATCH", body: { status, reviewNote: note, bankReference: reference, checklist: checks } });
      setReview(null); setMessage(status === "CLEARED" ? `Verified payment recorded. Remaining invoice balance: ${currency(result.remaining)}.` : "Review saved; invoice is not settled.");
      load(); onUpdated?.();
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  return <section className="gpc-panel gn-offline-panel">
    <header className="gn-offline-head"><div><h3>Cash & Cheque Payments</h3><p className="muted">Full or partial payments; money is recorded only after verified receipt/clearance.</p></div></header>
    {message && <p role="status" className="gn-offline-message">{message}</p>}
    {tenant && <form className="gn-offline-form" onSubmit={submit}>
      <label>Unpaid invoice<select required value={invoiceId} onChange={e => { setInvoiceId(e.target.value); setAmount(""); }}><option value="">Select invoice</option>{openInvoices.map(i => <option key={i.id} value={i.id}>{i.property} · {i.period} · Due {currency(i.outstanding)}</option>)}</select></label>
      <label>Method<select value={method} onChange={e => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="CHEQUE">Cheque</option></select></label>
      <label>Payment amount (INR)<input type="number" min="1" step="1" max={outstanding || undefined} required value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter full or partial amount"/></label>
      {selectedInvoice && <div className="gn-offline-balance"><span>Current outstanding: <strong>{currency(outstanding)}</strong></span><span>After this request clears: <strong>{validAmount ? currency(outstanding - numericAmount) : "—"}</strong></span><button type="button" className="btn outline" onClick={() => setAmount(String(outstanding))}>Pay full balance</button></div>}
      {method === "CHEQUE" && <div className="gn-offline-cheque">{[["chequeNumber", "Cheque number"], ["chequeDate", "Cheque issue date"], ["bankName", "Bank name"], ["branch", "Branch"], ["ifsc", "IFSC"], ["payeeName", "Payee name"], ["amountWords", "Amount in words"]].map(([key, label]) => <label key={key}>{label}<input required={["chequeNumber", "chequeDate", "bankName", "payeeName"].includes(key)} type={key === "chequeDate" ? "date" : "text"} value={fields[key] || ""} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}/></label>)}</div>}
      <button type="submit" className="btn primary" disabled={!validAmount || busy}>{busy ? "Submitting…" : `Request ${currency(validAmount ? numericAmount : 0)} ${method.toLowerCase()} payment`}</button>
    </form>}
    <div className="gn-offline-table"><table><thead><tr><th>Date</th><th>Method</th><th>Amount</th><th>Status</th>{!tenant && <th>Action</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleDateString("en-IN")}</td><td>{row.method}</td><td>{currency(row.amount)}</td><td><span className="gn-status">{row.status.replaceAll("_", " ")}</span></td>{!tenant && <td>{!["CLEARED", "BOUNCED", "REJECTED"].includes(row.status) && <button className="btn outline" onClick={() => { setReview(row); setStatus("UNDER_REVIEW"); setChecks({}); setReference(""); setNote(""); }}>Review</button>}</td>}</tr>)}{!rows.length && <tr><td colSpan={tenant ? 4 : 5}>No cash/cheque requests yet.</td></tr>}</tbody></table></div>
    {review && <div className="gn-property-modal-backdrop"><section className="gn-property-modal" role="dialog" aria-modal="true" aria-label="Offline payment review"><h3>Review {review.method} · {currency(review.amount)}</h3><form onSubmit={decide} className="gn-offline-review"><label>Review status<select value={status} onChange={e => setStatus(e.target.value)}>{["UNDER_REVIEW", "DEPOSITED", "BANK_PENDING", "CLEARED", "BOUNCED", "REJECTED"].map(v => <option key={v}>{v}</option>)}</select></label>{review.method === "CHEQUE" && KEYS.map((key, i) => <label key={key}><input type="checkbox" checked={!!checks[key]} onChange={e => setChecks(c => ({ ...c, [key]: e.target.checked }))}/>{LABELS[i]}</label>)}<label>Bank / receipt reference<input value={reference} onChange={e => setReference(e.target.value)}/></label><label>Review note<textarea value={note} onChange={e => setNote(e.target.value)}/></label><p className="muted">CLEARED means verified money received. An owner checklist does not constitute automated bank verification.</p><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save review"}</button><button className="btn outline" type="button" onClick={() => setReview(null)}>Cancel</button></form></section></div>}
  </section>;
}
