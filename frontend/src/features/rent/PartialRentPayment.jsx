
import React, { useState } from "react";
import { api } from "../../lib/api";

export default function PartialRentPayment({
  invoice,
  balance,
  onDone,
}) {
  const [amount, setAmount] = useState(
    String(balance)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const currentPeriod = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }
  ).formatToParts(new Date());

  const get = (type) =>
    currentPeriod.find((p) => p.type === type)?.value;

  const periodNow = `${get("year")}-${get("month")}`;

  const locked = invoice.period > periodNow;

  async function submit(event) {
    event.preventDefault();

    const value = Number(amount);

    if (
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > balance
    ) {
      setError(
        `Enter an amount between ₹1 and ₹${balance}.`
      );
      return;
    }

    if (
      !window.confirm(
        `Record a DEMO payment of ₹${value}?\nNo real money will be transferred.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api("/rent/payments/demo", {
        method: "POST",
        body: {
          tenancyId: invoice.tenancyId,
          invoiceId: invoice.id,
          kind: "RENT",
          amount: value,
        },
      });

      setMessage(
        `Demo payment recorded. Remaining: ₹${result.remaining}`
      );

      await onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (balance <= 0) {
    return <strong>Fully Paid</strong>;
  }

  return (
    <form
      onSubmit={submit}
      style={{
        display: "grid",
        gap: 10,
        maxWidth: 260,
      }}
    >
      <label>
        Payment amount (INR)
        <input
          type="number"
          min="1"
          max={balance}
          step="1"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={locked || busy}
        />
      </label>

      <small>
        Remaining invoice balance: ₹
        {balance.toLocaleString("en-IN")}
      </small>

      <button
        type="submit"
        className="btn primary"
        disabled={busy || locked}
      >
        {busy
          ? "Processing..."
          : locked
            ? "Payment opens on 1st"
            : "Record Partial / Full Demo Payment"}
      </button>

      {error && <small role="alert">{error}</small>}
      {message && <small>{message}</small>}
    </form>
  );
}
