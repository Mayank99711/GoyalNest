
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import PaymentReceipt from "./PaymentReceipt";
import OwnerCollectionSummary from "./OwnerCollectionSummary";
import PartialRentPayment from "./PartialRentPayment";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

function todayInIndia() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = (key) =>
    parts.find((p) => p.type === key)?.value;

  return {
    period: `${value("year")}-${value("month")}`,
    day: Number(value("day")),
  };
}

const dateText = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
      })
    : "N/A";

export default function RentPayments() {
  const { user } = useAuth();

  const [tenancies, setTenancies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState([]);
  const [checkoutHistory, setCheckoutHistory] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isTenant = user?.role === "TENANT";
  const isOwner = user?.role === "OWNER";

  async function load() {
    try {
      const [data, balanceData] = await Promise.all([
  api("/tenancies/mine"),
  api("/rent/balances"),
]);

setTenancies(Array.isArray(data) ? data : []);
setBalances(Array.isArray(balanceData) ? balanceData : []);
if (isTenant) {
  try {
    const result = await api("/secure-checkout/mine");

    setCheckoutHistory(
      Array.isArray(result.checkouts)
        ? result.checkouts
        : []
    );
  } catch (checkoutError) {
    console.error(
      "Checkout history could not be loaded:",
      checkoutError
    );
  }
}
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const invoices = tenancies.flatMap((tenancy) =>
    (tenancy.invoices || []).map((invoice) => ({
      ...invoice,
      tenancyId: tenancy.id,
      property: tenancy.unit?.property?.title || "Property",
      room: tenancy.unit?.label || "Room",
      tenant: tenancy.tenant?.name || "Tenant",
    }))
  );

  const payments = tenancies.flatMap((tenancy) =>
    (tenancy.payments || []).map((payment) => ({
      ...payment,
      property: tenancy.unit?.property?.title || "Property",
      tenant: tenancy.tenant?.name || "Tenant",
    }))
  );

  const today = todayInIndia();

  const totalExpected = invoices.reduce(
    (sum, inv) => sum + inv.amount + inv.penalty,
    0
  );

  const collected = invoices
    .filter((inv) => inv.status === "PAID")
    .reduce(
      (sum, inv) => sum + inv.amount + inv.penalty,
      0
    );

  const outstanding = invoices
    .filter((inv) => inv.status !== "PAID")
    .reduce(
      (sum, inv) => sum + inv.amount + inv.penalty,
      0
    );

  const overdue = invoices.filter(
    (inv) => inv.status === "OVERDUE"
  ).length;

  async function payRent(invoice) {
    if (!window.confirm(
      `Record a DEMO payment of ${money(
        invoice.amount + invoice.penalty
      )}?\n\nNo real money will be transferred.`
    )) {
      return;
    }

    setBusyId(invoice.id);
    setError("");
    setMessage("");

    try {
      await api("/rent/payments/demo", {
        method: "POST",
        body: {
          tenancyId: invoice.tenancyId,
          invoiceId: invoice.id,
          kind: "RENT",
        },
      });

      setMessage(
        `Demo payment recorded for ${invoice.period}.`
      );

      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  if (!isTenant && !isOwner) {
    return <p>Rent dashboard is unavailable for this role.</p>;
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <h2>
        {isTenant
          ? "My Rent & Payments"
          : "Rent Collections"}
      </h2>

      <p className="muted">
        {isTenant
          ? "View your rent invoices, payment deadlines and receipts."
          : "Track rent collections across your properties."}
      </p>

      <button
        type="button"
        className="btn outline"
        onClick={load}
        style={{ marginBottom: 18 }}
      >
        Refresh
      </button>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {message && <div className="notice">{message}</div>}

      {loading ? (
        <p>Loading rent details...</p>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(175px, 1fr))",
              gap: 16,
              marginBottom: 24,
            }}
          >
            {[
              ["Total Invoiced", money(totalExpected)],
              ["Collected", money(collected)],
              ["Outstanding", money(outstanding)],
              ["Overdue Invoices", overdue],
            ].map(([label, value]) => (
              <div
                key={label}
                className="card"
                style={{ padding: 20, borderRadius: 12 }}
              >
                <p className="muted">{label}</p>
                <h2>{value}</h2>
              </div>
            ))}
          </div>
            {isOwner && (
  <OwnerCollectionSummary invoices={invoices} />
)}
          <section
            className="card"
            style={{ padding: 22, marginBottom: 22 }}
          >
            <h3>Rent Invoices</h3>

            {invoices.length === 0 && (
              <p className="muted">
                No rent invoices available.
              </p>
            )}

            {[...invoices]
              .sort((a, b) =>
                b.period.localeCompare(a.period)
              )
              .map((invoice) => {
                const unpaid = invoice.status !== "PAID";
                const beforePaymentWindow =
                  invoice.period > today.period;

                return (
                  <div
                    key={invoice.id}
                    style={{
                      padding: "18px 0",
                      borderBottom: "1px solid #e2e9e5",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      <div>
                        <h4>
                          {invoice.property} — {invoice.room}
                        </h4>

                        {isOwner && (
                          <p>Tenant: {invoice.tenant}</p>
                        )}

                        <p>Billing Month: {invoice.period}</p>
                        <p>
                          Payment Deadline:{" "}
                          {dateText(invoice.dueDate)}
                        </p>
                        <p>
                          Status: <strong>{invoice.status}</strong>
                        </p>
                      </div>

                      <div>
                        <p>Rent: {money(invoice.amount)}</p>
                        <p>
                          Late Fee: {money(invoice.penalty)}
                        </p>
                        <h3>
                          {money(
                            invoice.amount + invoice.penalty
                          )}
                        </h3>

                        {isTenant && unpaid && (
  <PartialRentPayment
    key={`${invoice.id}-${
      balances.find(b => b.invoiceId === invoice.id)
        ?.remaining ?? invoice.amount + invoice.penalty
    }`}
    invoice={invoice}
    balance={
      balances.find(b => b.invoiceId === invoice.id)
        ?.remaining ?? invoice.amount + invoice.penalty
    }
    onDone={load}
  />
)}
                      </div>
                    </div>
                  </div>
                );
              })}
          </section>

          <section
            className="card"
            style={{ padding: 22 }}
          >
            <h3>Payment History</h3>
            {isTenant && (
  <div style={{ marginTop: 16, marginBottom: 24 }}>
    <h4>Razorpay Transaction History</h4>

    <p className="muted">
      Test transactions are shown for reference only.
      They do not settle rent invoices or represent real payments.
    </p>

    {checkoutHistory.length === 0 ? (
      <p className="muted">
        No Razorpay transactions recorded yet.
      </p>
    ) : (
      checkoutHistory.map((item) => (
        <div
          key={item.id}
          style={{
            padding: 16,
            marginBottom: 12,
            border: "1px solid #dce8e1",
            borderRadius: 12
          }}
        >
          <strong>{item.purpose}</strong>

          <p>
            Amount: {money(item.amountPaise / 100)}
          </p>

          <p>
            Status:{" "}
            <strong>
              {item.status === "TEST_PAID"
                ? "TEST PAYMENT SUCCESSFUL"
                : item.status}
            </strong>
          </p>

          <p>
            Date: {dateText(item.createdAt)}
          </p>

          <p className="muted">
            Reference: {item.id}
          </p>

          {item.status === "TEST_PAID" && (
            <p style={{ color: "#98701d" }}>
              Test transaction verified. No real money
              collected. Invoice remains unpaid.
            </p>
          )}
        </div>
      ))
    )}
  </div>
)}

            {payments.length === 0 && (
              <p className="muted">
                No payments recorded yet.
              </p>
            )}

            {[...payments]
              .sort(
                (a, b) =>
                  new Date(b.createdAt) -
                  new Date(a.createdAt)
              )
              .map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    padding: "14px 0",
                    borderBottom: "1px solid #e2e9e5",
                  }}
                >
                  <strong>{payment.property}</strong>

                  {isOwner && (
                    <p>Tenant: {payment.tenant}</p>
                  )}

                  <p>Type: {payment.kind}</p>
                  <p>Amount: {money(payment.amount)}</p>
                  <p>Status: {payment.status}</p>
                  <p>Date: {dateText(payment.createdAt)}</p>
                  <p className="muted">
                    Reference: {payment.id}
                  </p>
                  {isTenant && (
  <PaymentReceipt payment={payment} />
)}
                </div>
              ))}
          </section>

          <p
            className="muted"
            style={{ marginTop: 16, fontSize: 12 }}
          >
            Demo payments are simulations only.
            No real bank transfer is performed.
          </p>
        </>
      )}
    </div>
  );
}
