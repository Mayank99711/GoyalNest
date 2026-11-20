import { createIdempotencySuffix } from "../../lib/idempotency";
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./UnifiedRentModal.css";

const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const chequeFields = [["chequeNumber", "Cheque number"], ["chequeDate", "Cheque date"], ["bankName", "Bank name"], ["branch", "Branch"], ["ifsc", "IFSC"], ["payeeName", "Payee name"], ["amountWords", "Amount in words"]];
let scriptPromise;
function ensureRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { scriptPromise = undefined; reject(new Error("Unable to load Razorpay checkout")); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Unified presentation only: existing backend APIs remain the payment authority. */
export default function UnifiedRentModal({ invoice, onClose, onUpdated }) {
  const [method, setMethod] = useState("ONLINE");
  const [config, setConfig] = useState(null);
  const [amount, setAmount] = useState(String(invoice.outstanding));
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [onlineHistory, setOnlineHistory] = useState([]);
  const outstanding = Number(invoice.outstanding);
  const numericAmount = Number(amount);
  const isValidOfflineAmount = Number.isSafeInteger(numericAmount) && numericAmount > 0 && numericAmount <= outstanding;
  const hasRecordedPayment = Number(invoice.demoPaid || 0) > 0 || Number(invoice.realPaid || 0) > 0;
  const onlineEligible = !hasRecordedPayment && Number(invoice.total ?? (Number(invoice.amount || 0) + Number(invoice.penalty || 0))) === outstanding;
  const priorTestPaid = onlineHistory.some(c => c.purpose === "RENT" && c.referenceId === invoice.id && c.status === "TEST_PAID");

  useEffect(() => {
    let active = true;
    Promise.all([api("/secure-checkout/config"), api("/secure-checkout/mine")]).then(([settings, history]) => {
      if (active) { setConfig(settings); setOnlineHistory(history.checkouts || []); }
    }).catch(e => { if (active) { setConfig({ configured: false, mode: "UNAVAILABLE" }); setError(`Online checkout status: ${e.message}`); } });
    return () => { active = false; };
  }, []);

  async function refresh() { await onUpdated?.(); }
  async function submitOffline(event) {
    event.preventDefault();
    if (busy || !isValidOfflineAmount) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/offline-payments", { method: "POST", body: {
        invoiceId: invoice.id, method, amount: numericAmount,
        ...(method === "CHEQUE" ? fields : {}),
      }});
      setMessage(`${method === "CHEQUE" ? "Cheque" : "Cash"} request submitted for ${money(numericAmount)}. The invoice remains unpaid until owner verification.`);
      await refresh();
    } catch (e) { setError(e.message || "Unable to submit payment request"); }
    finally { setBusy(false); }
  }
  async function startOnline() {
    if (busy || !config?.configured || priorTestPaid || !onlineEligible || outstanding <= 0) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await ensureRazorpay();
      const idempotencyKey = `gn_${createIdempotencySuffix()}`;
      const { checkout } = await api("/secure-checkout/start", {
        method: "POST", body: { purpose: "RENT", referenceId: invoice.id, idempotencyKey },
      });
      const instance = new window.Razorpay({
        key: checkout.keyId, amount: checkout.amount, currency: "INR", name: "GoyalNest",
        description: checkout.label, order_id: checkout.providerOrderId,
        theme: { color: "#1e4d3c" },
        handler: async response => {
          try {
            const result = await api("/secure-checkout/confirm", { method: "POST", body: { checkoutId: checkout.id, ...response } });
            setMessage(result.message || "Payment verified by the provider.");
            const history = await api("/secure-checkout/mine");
            setOnlineHistory(history.checkouts || []);
            await refresh();
          } catch (e) { setError(`${e.message}. Check checkout history and verify status before paying again.`); }
          finally { setBusy(false); }
        },
        modal: { ondismiss: () => { setBusy(false); } },
      });
      instance.on("payment.failed", () => {
        setError("Payment did not complete. Review transaction history before retrying.");
        setBusy(false);
      });
      instance.open();
    } catch (e) { setError(e.message || "Could not start checkout"); setBusy(false); }
  }
  return <div className="gpc-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <section className="gpc-modal gnu-modal" role="dialog" aria-modal="true" aria-label="Pay rent">
      <header className="gpc-modal-head"><h3>Pay rent</h3><button type="button" disabled={busy} onClick={onClose} aria-label="Close payment dialog">×</button></header>
      <p className="gpc-muted">{invoice.property} · {invoice.unit} · {invoice.period}</p>
      <div className="gpc-line"><span>Rent</span><strong>{money(invoice.amount)}</strong></div>
      <div className="gpc-line"><span>Penalty</span><strong>{money(invoice.penalty)}</strong></div>
      <div className="gpc-line"><span>Previously recorded demo payments (not real funds)</span><strong>−{money(invoice.demoPaid)}</strong></div>
      <div className="gpc-line"><span>Verified cash/cheque payments</span><strong>−{money(invoice.realPaid)}</strong></div>
      <div className="gpc-line gpc-total"><span>Outstanding</span><strong>{money(invoice.outstanding)}</strong></div>
      <fieldset className="gnu-methods"><legend>Choose payment method</legend>
        <label><input type="radio" name="gn-rent-method" checked={method === "ONLINE"} onChange={() => { setMethod("ONLINE"); setError(""); }} /> Online · UPI / Card / Net Banking</label>
        <label><input type="radio" name="gn-rent-method" checked={method === "CASH"} onChange={() => { setMethod("CASH"); setError(""); }} /> Cash</label>
        <label><input type="radio" name="gn-rent-method" checked={method === "CHEQUE"} onChange={() => { setMethod("CHEQUE"); setError(""); }} /> Cheque</label>
      </fieldset>
      <p className="gnu-guidance">Online: gateway verification. Cash/Cheque: request first, owner verifies later. Invoice status changes only after the applicable verification.</p>
      {error && <p role="alert" className="gpc-alert">{error}</p>}
      {message && <p role="status" className="gpc-confirm">{message}</p>}
      {method === "ONLINE" ? <div className="gnu-method-body">
        <p className="gpc-muted">{!onlineEligible ? "This invoice has previous payment records or adjustments. Online checkout is restricted to invoices without previous rent payments. Choose Cash/Cheque for an outstanding amount, or contact the owner for reconciliation." : config === null ? "Checking secure checkout configuration…" : !config.configured ? "Razorpay checkout is not configured. Cash/Cheque requests remain available." : config.mode === "TEST" ? "Razorpay TEST mode — no real money is transferred and the TEST payment does not settle this invoice." : "Razorpay LIVE checkout — the backend verifies capture before recording payment."}</p>
        {priorTestPaid && <p className="gpc-muted">A TEST payment has already been recorded for this invoice. You can review its status in checkout history.</p>}
        <button className="gpc-main-btn" type="button" disabled={busy || !config?.configured || priorTestPaid || !onlineEligible || outstanding <= 0} onClick={startOnline}>{busy ? "Opening checkout…" : `Pay online · ${money(invoice.outstanding)}`}</button>
      </div> : <form className="gnu-method-body gnu-offline-form" onSubmit={submitOffline}>
        <label>Payment amount (INR)<input type="number" required min="1" step="1" max={outstanding} value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <button type="button" className="gpc-small-action" onClick={() => setAmount(String(outstanding))}>Use full outstanding</button>
        {isValidOfflineAmount && <p className="gpc-muted">Balance after verified clearance: {money(outstanding - numericAmount)}</p>}
        {method === "CHEQUE" && <div className="gnu-cheque-fields">{chequeFields.map(([key, label]) => <label key={key}>{label}<input type={key === "chequeDate" ? "date" : "text"} required={["chequeNumber", "chequeDate", "bankName", "payeeName"].includes(key)} value={fields[key] || ""} onChange={e => setFields(current => ({ ...current, [key]: e.target.value }))} /></label>)}</div>}
        <p className="gpc-muted">Submitting this request does not mark rent paid. The owner must verify receipt/clearance.</p>
        <button type="submit" className="gpc-main-btn" disabled={busy || !isValidOfflineAmount}>{busy ? "Submitting…" : `Submit ${method.toLowerCase()} request`}</button>
      </form>}
      <p className="gnu-history-label">Online payment history for this invoice</p>
      <ul className="gnu-history">{onlineHistory.filter(c => c.purpose === "RENT" && c.referenceId === invoice.id).slice(0, 5).map(c => <li key={c.id}><span>{c.status === "TEST_PAID" ? "TEST payment only" : c.status.replaceAll("_", " ")}</span><span>{new Date(c.createdAt).toLocaleDateString("en-IN")}</span><button type="button" className="gpc-small-action" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await api(`/secure-checkout/reconcile/${encodeURIComponent(c.id)}`, { method: "POST" }); const h = await api("/secure-checkout/mine"); setOnlineHistory(h.checkouts || []); await refresh(); setMessage("Provider status checked. Review the invoice for the latest balance."); } catch(e) { setError(e.message || "Unable to verify payment status"); } finally { setBusy(false); } }}>Verify status</button></li>)}</ul>
    </section>
  </div>;
}
