
import React from "react";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

export default function PaymentReceipt({ payment }) {
  if (!payment || payment.status !== "DEMO_PAID") {
    return null;
  }

  function printReceipt() {
    const popup = window.open("", "_blank");

    if (!popup) {
      window.alert("Please allow popups to print the receipt.");
      return;
    }

    // Build a document using DOM methods rather than
    // inserting untrusted payment data into HTML.
    const doc = popup.document;
    doc.title = "GoyalNest Demo Payment Receipt";

    const style = doc.createElement("style");
    style.textContent = `
      body {
        font-family: Arial, sans-serif;
        margin: 48px auto;
        max-width: 650px;
        color: #173f34;
      }

      h1 { margin-bottom: 5px; }

      .subtitle { color: #6a8178; }

      .line {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid #ddd;
        padding: 14px 0;
        gap: 20px;
      }

      .total {
        font-size: 22px;
        font-weight: bold;
      }

      .notice {
        margin-top: 35px;
        font-size: 12px;
        color: #777;
      }

      @media print {
        body { margin: 20px; }
      }
    `;

    doc.head.appendChild(style);

    const heading = doc.createElement("h1");
    heading.textContent = "GoyalNest";
    doc.body.appendChild(heading);

    const subtitle = doc.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = "DEMO PAYMENT RECEIPT";
    doc.body.appendChild(subtitle);

    const rows = [
      ["Property", payment.property || "N/A"],
      ["Tenant", payment.tenant || "N/A"],
      ["Payment Reference", payment.id],
      ["Payment Type", payment.kind],
      [
        "Payment Date",
        new Date(payment.createdAt).toLocaleString(
          "en-IN",
          { timeZone: "Asia/Kolkata" }
        ),
      ],
      ["Payment Status", "DEMO PAID"],
      ["Amount", money(payment.amount)],
    ];

    for (const [label, value] of rows) {
      const row = doc.createElement("div");
      row.className = "line";

      const left = doc.createElement("span");
      left.textContent = label;

      const right = doc.createElement("strong");
      right.textContent = String(value);

      row.append(left, right);
      doc.body.appendChild(row);
    }

    const note = doc.createElement("p");
    note.className = "notice";
    note.textContent =
      "This receipt confirms a simulated payment " +
      "record only. No bank transfer occurred.";

    doc.body.appendChild(note);

    popup.focus();
    popup.print();
  }

  return (
    <button
      type="button"
      className="btn outline"
      onClick={printReceipt}
    >
      Print Demo Receipt
    </button>
  );
}
