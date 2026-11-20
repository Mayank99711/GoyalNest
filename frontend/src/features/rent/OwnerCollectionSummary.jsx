
import React from "react";

const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);

export default function OwnerCollectionSummary({
  invoices = [],
}) {
  const summary = Object.values(
    invoices.reduce((acc, invoice) => {
      const key = invoice.property || "Property";

      if (!acc[key]) {
        acc[key] = {
          property: key,
          collected: 0,
          outstanding: 0,
          overdue: 0,
        };
      }

      const total = invoice.amount + invoice.penalty;

      if (invoice.status === "PAID") {
        acc[key].collected += total;
      } else {
        acc[key].outstanding += total;

        if (invoice.status === "OVERDUE") {
          acc[key].overdue += 1;
        }
      }

      return acc;
    }, {})
  );

  return (
    <section
      className="card"
      style={{ padding: 22, marginBottom: 22 }}
    >
      <h3>Property-wise Rent Collections</h3>

      {summary.length === 0 ? (
        <p className="muted">
          No collection records available.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th>Property</th>
                <th>Collected</th>
                <th>Outstanding</th>
                <th>Overdue</th>
              </tr>
            </thead>

            <tbody>
              {summary.map((item) => (
                <tr key={item.property}>
                  <td>{item.property}</td>
                  <td>{money(item.collected)}</td>
                  <td>{money(item.outstanding)}</td>
                  <td>{item.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
