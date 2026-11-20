import { createIdempotencySuffix } from "../../lib/idempotency";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import "./CheckoutPortal.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
const when = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" })
    : "—";
const PLAN_NAMES = ["STARTER", "PRO", "BUSINESS"];

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gn-razorpay="1"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener(
        "error",
        () => reject(Error("Could not load secure checkout")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.gnRazorpay = "1";
    script.onload = resolve;
    script.onerror = () => reject(Error("Could not load secure checkout"));
    document.head.appendChild(script);
  });
}

export default function CheckoutPortal() {
  const { user } = useAuth();
  const tenant = user?.role === "TENANT";
  const owner = user?.role === "OWNER";
  const [data, setData] = useState({});
  const [history, setHistory] = useState([]);
  const [config, setConfig] = useState({ configured: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!user || (!tenant && !owner)) return;
    setLoading(true);
    try {
      const [core, settings, records] = await Promise.all([
        tenant
          ? api("/tenancies/mine")
          : Promise.all([
              api("/owner-workspace/subscription"),
              api("/subscriptions/plans"),
            ]),
        api("/secure-checkout/config"),
        api("/secure-checkout/mine"),
      ]);
      setData(
        tenant
          ? { tenancies: Array.isArray(core) ? core : [] }
          : { summary: core[0], plans: core[1] },
      );
      setConfig(settings);
      setHistory(records.checkouts || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tenant, owner]);

  useEffect(() => {
    load();
  }, [load]);

  async function start(purpose, referenceId) {
    if (!config.configured || busy) return;
    setBusy(referenceId);
    setError("");
    setNotice("");
    try {
      await loadRazorpayScript();
      const idempotencyKey = `gn_${createIdempotencySuffix()}`;
      const { checkout } = await api("/secure-checkout/start", {
        method: "POST",
        body: { purpose, referenceId, idempotencyKey },
      });
      const instance = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: "INR",
        name: "GoyalNest",
        description: checkout.label,
        order_id: checkout.providerOrderId,
        theme: { color: "#1e4d3c" },
        handler: async (response) => {
          try {
            const confirmation = await api("/secure-checkout/confirm", {
              method: "POST",
              body: { checkoutId: checkout.id, ...response },
            });
            setNotice(confirmation.message || "Payment verified");
          } catch (e) {
            setError(
              `${e.message}. If money was deducted, use Verify Status in payment history; do not immediately pay again.`,
            );
          } finally {
            setBusy("");
            await load();
          }
        },
        modal: {
          ondismiss: () => {
            setBusy("");
            load();
          },
        },
      });
      instance.on("payment.failed", () => {
        setError(
          "Payment was not completed. Check transaction history before retrying.",
        );
        setBusy("");
        load();
      });
      instance.open();
    } catch (e) {
      setError(e.message);
      setBusy("");
    }
  }

  async function verify(checkoutId) {
    setBusy(checkoutId);
    setError("");
    setNotice("");
    try {
      await api(
        `/secure-checkout/reconcile/${encodeURIComponent(checkoutId)}`,
        { method: "POST" },
      );
      setNotice("Payment status verified with the provider.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  if (!tenant && !owner)
    return <p>This payment area is available to Owners and Tenants.</p>;
  const invoices = (data.tenancies || []).flatMap((t) =>
    (t.invoices || []).map((i) => ({
      ...i,
      property: t.unit?.property?.title || "Property",
      unit: t.unit?.label || "Unit",
      tenancyId: t.id,
      recordedPayment: (t.payments || []).some(
        (p) => p.kind === "RENT" && p.invoiceId === i.id,
      ),
    })),
  );
  const testPaidRentRefs = new Set(
    history
      .filter((item) => item.purpose === "RENT" && item.status === "TEST_PAID")
      .map((item) => item.referenceId),
  );
  const active = data.summary?.active;

  return (
    <main className="gck-root">
      <header className="gck-head">
        <div>
          <span>GOYALNEST · SECURE BILLING</span>
          <h2>{tenant ? "Rent & Payments" : "Subscription & Billing"}</h2>
          <p>
            {tenant
              ? "Review rent invoices and pay securely."
              : "Compare plans and purchase your listing subscription."}
          </p>
        </div>
        <button className="gck-reload" onClick={load}>
          Refresh
        </button>
      </header>
      <section className="gck-banner">
        <strong>
          {config.configured
            ? `${config.mode} checkout configured`
            : "Online checkout is not configured"}
        </strong>
        <p>
          {config.configured
            ? config.mode === "TEST"
              ? "This checkout uses Razorpay test mode; no real money will move."
              : "Payments are processed by Razorpay. Plans and invoices update only after provider verification."
            : "Add Razorpay merchant credentials to the backend to enable UPI, cards and supported payment methods. No charges can be made yet."}
        </p>
      </section>
      {error && (
        <p className="gck-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="gck-success" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="gck-panel">Loading billing data…</p>
      ) : tenant ? (
        <>
          <section className="gck-overview">
            <div>
              <span>Invoices</span>
              <strong>{invoices.length}</strong>
            </div>
            <div>
              <span>Open invoices</span>
              <strong>
                {
                  invoices.filter((i) =>
                    ["PENDING", "OVERDUE"].includes(i.status),
                  ).length
                }
              </strong>
            </div>
            <div>
              <span>Unsettled rent total</span>
              <strong>
                {money(
                  invoices
                    .filter((i) => ["PENDING", "OVERDUE"].includes(i.status))
                    .reduce((a, i) => a + i.amount + i.penalty, 0),
                )}
              </strong>
            </div>
          </section>
          <section className="gck-panel">
            <h3>My rent invoices</h3>
            <p className="gck-muted">
              Amounts are calculated from your tenancy's invoice records.
            </p>
            <div className="gck-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Property / Unit</th>
                    <th>Billing month</th>
                    <th>Rent + penalty</th>
                    <th>Due date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <b>{i.property}</b>
                        <small>{i.unit}</small>
                      </td>
                      <td>{i.period}</td>
                      <td>{money(i.amount + i.penalty)}</td>
                      <td>{when(i.dueDate)}</td>
                      <td>
                        <span className="gck-status">{i.status}</span>
                      </td>
                      <td>
                        <button
                          className="gck-pay"
                          disabled={
                            !config.configured ||
                            !!busy ||
                            !["PENDING", "OVERDUE"].includes(i.status) ||
                            i.recordedPayment ||
                            (config.mode === "TEST" &&
                              testPaidRentRefs.has(i.id))
                          }
                          onClick={() => start("RENT", i.id)}
                        >
                          {busy === i.id
                            ? "Opening..."
                            : i.status === "PAID"
                              ? "Paid"
                              : i.recordedPayment
                                ? "Review payment"
                                : config.mode === "TEST" &&
                                    testPaidRentRefs.has(i.id)
                                  ? "TEST PAID"
                                  : "Pay Now"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!invoices.length && (
                    <tr>
                      <td colSpan={6}>No rent invoices available yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="gck-overview">
            <div>
              <span>Current plan</span>
              <strong>{active?.plan || "None"}</strong>
            </div>
            <div>
              <span>Listing usage</span>
              <strong>
                {data.summary?.usedListings || 0}/{active?.listingLimit || 0}
              </strong>
            </div>
            <div>
              <span>Expires</span>
              <strong>{when(active?.expiresAt)}</strong>
            </div>
          </section>
          <section className="gck-panel">
            <h3>Choose your subscription</h3>
            <p className="gck-muted">
              One month per purchase. Current active time is retained on
              renewal.
            </p>
            <div className="gck-plans">
              {PLAN_NAMES.filter((p) => data.plans?.[p]).map((plan) => (
                <article key={plan}>
                  <span>{plan}</span>
                  <h4>
                    {money(data.plans[plan].price)}
                    <small> / month</small>
                  </h4>
                  <p>Up to {data.plans[plan].limit} property listings</p>
                  <button
                    className="gck-pay"
                    disabled={!config.configured || !!busy}
                    onClick={() => start("SUBSCRIPTION", plan)}
                  >
                    {busy === plan ? "Opening…" : "Buy / Renew Plan"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="gck-panel">
        <h3>Checkout history</h3>
        <p className="gck-muted">
          Verified payments appear as PAID. Pending attempts are not receipts.
        </p>
        <div className="gck-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction Timeline</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>
  <div>
    <small>Checkout started</small>
    <div>{when(item.createdAt)}</div>
  </div>

  {item.fulfilledAt && (
    <div style={{ marginTop: 8 }}>
      <small>Payment verified</small>
      <div>{when(item.fulfilledAt)}</div>
    </div>
  )}
</td>
                  <td>{item.purpose}</td>
                  <td>{item.plan || item.referenceId}</td>
                  <td>{money(item.amountPaise / 100)}</td>
                  <td>
                    <span className="gck-status">
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    {item.status !== "PAID" && (
                      <button
                        className="gck-reload"
                        disabled={!config.configured || !!busy}
                        onClick={() => verify(item.id)}
                      >
                        {busy === item.id ? "Checking…" : "Verify Status"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!history.length && (
                <tr>
                  <td colSpan={6}>No online checkout history yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
