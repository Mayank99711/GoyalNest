import "./AdminPolish.css";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminTransactions() {
  const [data, setData] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tab, setTab] = useState("payments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refundError, setRefundError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      try {
        const transactions = await api(
          `/admin-operations/transactions?page=${page}`
        );

        if (!active) return;

        setData(transactions);
        setTotalPages(
          Math.max(1, transactions.totalPages || 1)
        );
        setError("");
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }

      try {
        const result = await api("/admin-operations/refunds");
        if (active) {
          setRefunds(result.refunds || []);
          setRefundError("");
        }
      } catch (err) {
        if (active) setRefundError(err.message);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [page]);

  const money = n =>
    n == null
      ? "—"
      : `₹${Number(n).toLocaleString("en-IN")}`;

  const date = value =>
    value
      ? new Date(value).toLocaleString("en-IN")
      : "—";

  return (
    <div className="dashboard-grid gn-admin-polish gn-admin-transactions">
      <section className="card" style={{ padding: 24 }}>
        <h2>Payments & Transactions</h2>

        <p className="muted">
          Read-only payment, invoice and refund monitoring.
          Demo payments are not real cash settlements.
        </p>

        {error && <p className="error">{error}</p>}
        {loading && <p>Loading transactions...</p>}

        {data && (
          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 20,
          }}>
            {[
              ["Payment Records", data.summary.totalPaymentRecords],
              ["Demo Payments on Page",
                data.summary.demoPaymentRecordsOnPage],
              ["Demo Amount on Page",
                money(data.summary.demoAmountOnPage)],
              ["Invoice Snapshot",
                data.summary.invoiceRecordsInSnapshot],
            ].map(([label, value]) => (
              <div key={label} style={{
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
              }}>
                <p className="muted">{label}</p>
                <h3>{value}</h3>
              </div>
            ))}
          </div>
        )}

        <div style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 18,
        }}>
          {[
            ["payments", "Payments"],
            ["invoices", "Rent Invoices"],
            ["refunds", "Refunds"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={
                tab === key ? "btn primary" : "btn outline"
              }
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ overflowX: "auto" }}>
          {tab === "payments" && (
            <table style={{ width: "100%", textAlign: "left" }}>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Property</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {(data?.payments || []).map(p => (
                  <tr key={p.id}>
                    <td>{p.tenant}</td>
                    <td>{p.property}</td>
                    <td>{money(p.amount)}</td>
                    <td><span className={`gn-admin-pill gn-admin-pill--${String(p.status || "unknown").toLowerCase()}`}>{String(p.status || "UNKNOWN").replaceAll("_", " ")}</span></td>
                    <td>{date(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "invoices" && (
            <table style={{ width: "100%", textAlign: "left" }}>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Property</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.invoices || []).map(i => (
                  <tr key={i.id}>
                    <td>{i.tenant}</td>
                    <td>{i.property}</td>
                    <td>{i.period}</td>
                    <td>{money(i.total)}</td>
                    <td><span className={`gn-admin-pill gn-admin-pill--${String(i.status || "unknown").toLowerCase()}`}>{String(i.status || "UNKNOWN").replaceAll("_", " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "refunds" && (
            <>
              {refundError && (
                <p className="error">{refundError}</p>
              )}
              <table style={{ width: "100%", textAlign: "left" }}>
                <thead>
                  <tr>
                    <th>Refund ID</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map(r => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td>{money(r.amount)}</td>
                      <td><span className={`gn-admin-pill gn-admin-pill--${String(r.status || "unknown").toLowerCase()}`}>{String(r.status || "UNKNOWN").replaceAll("_", " ")}</span></td>
                      <td>{date(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {tab === "payments" && (
          <div style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginTop: 20,
          }}>
            <button
              className="btn outline"
              disabled={loading || page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>

            <span>Page {page} of {totalPages}</span>

            <button
              className="btn outline"
              disabled={loading || page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
