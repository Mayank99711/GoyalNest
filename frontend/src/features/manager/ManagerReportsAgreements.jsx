
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
      })
    : "Not signed";

const card = {
  background: "#fff",
  border: "1px solid #e1e8e3",
  borderRadius: 14,
  padding: 22,
  minWidth: 0,
};

function Stat({ label, value }) {
  return (
    <div style={card}>
      <p className="muted">{label}</p>
      <h2 style={{ color: "#173f34" }}>{value}</h2>
    </div>
  );
}

export default function ManagerReportsAgreements({
  page = "agreements",
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const isReports = page === "reports";

  async function load() {
    setLoading(true);
    setError("");

    try {
      if (isReports) {
        const [summary, operations] = await Promise.all([
          api("/manager-portal/summary"),
          api("/manager-portal/operations"),
        ]);

        setData({ summary, operations });
      } else {
        const agreements = await api(
          "/manager-portal/agreements"
        );

        setData(Array.isArray(agreements) ? agreements : []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [page]);

  const agreements = !isReports && Array.isArray(data)
    ? data
    : [];

  const filtered = agreements.filter((a) =>
    [a.tenant, a.property, a.room, a.status]
      .some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(search.trim().toLowerCase())
      )
  );

  const summary = data?.summary?.summary || {};
  const properties = data?.summary?.properties || [];
  const invoices = data?.operations?.invoices || [];
  const tenants = data?.operations?.tenants || [];

  const billed = invoices.reduce(
    (sum, i) => sum + i.total, 0
  );

  const collected = invoices.reduce(
    (sum, i) => sum + i.paid, 0
  );

  const outstanding = invoices.reduce(
    (sum, i) => sum + i.remaining, 0
  );

  const overdueCount = invoices.filter(
    (i) => i.status === "OVERDUE"
  ).length;

  const activeCount = tenants.filter(
    (t) => t.status === "ACTIVE"
  ).length;

  const vacatingCount = tenants.filter(
    (t) => t.status === "VACATING"
  ).length;

  function exportCsv() {
    const headers = [
      "Period", "Property", "Tenant",
      "Total", "Demo Paid", "Outstanding", "Status",
    ];

    const rows = invoices.map((i) => [
      i.period, i.property, i.tenant,
      i.total, i.paid, i.remaining, i.status,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((value) =>
          `"${String(value ?? "").replaceAll('"', '""')}"`
        ).join(",")
      )
      .join("\r\n");

    const blob = new Blob(
      ["\uFEFF", csv],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "goyalnest-manager-rent-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{
      display: "grid",
      gap: 22,
      width: "100%",
      maxWidth: 1250,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <h2>
            {isReports
              ? "Daily Operations Report"
              : "Rental Agreements"}
          </h2>
          <p className="muted">
            {isReports
              ? "Current operational snapshot of assigned properties."
              : "View agreement and tenant signing status."}
          </p>
        </div>

        <button
          type="button"
          className="btn outline"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}

      {loading && <p>Loading records...</p>}

      {!loading && data && !isReports && (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 14,
          }}>
            <Stat
              label="Total Agreements"
              value={agreements.length}
            />
            <Stat
              label="Signed"
              value={
                agreements.filter(
                  (a) => a.status === "SIGNED"
                ).length
              }
            />
            <Stat
              label="Pending Signature"
              value={
                agreements.filter(
                  (a) => a.status === "PENDING_SIGNATURE"
                ).length
              }
            />
          </div>

          <section style={card}>
            <input
              type="search"
              placeholder="Search tenant, property, room..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 12,
                marginBottom: 18,
              }}
            />

            {filtered.length === 0 && (
              <p className="muted">
                No matching agreements.
              </p>
            )}

            {filtered.map((a) => (
              <article
                key={a.id}
                style={{
                  borderBottom: "1px solid #e5ece7",
                  padding: "16px 0",
                }}
              >
                <strong>{a.tenant}</strong>
                <p>{a.property} — {a.room}</p>
                <p>
                  Monthly Rent: {money(a.monthlyRent)}
                </p>
                <p>
                  Status: <strong>{a.status}</strong>
                </p>
                <p>
                  Signed: {formatDate(a.signedAt)}
                </p>

                <button
                  className="btn outline"
                  type="button"
                  onClick={() =>
                    setSelected(
                      selected === a.id ? null : a.id
                    )
                  }
                >
                  {selected === a.id
                    ? "Hide Details"
                    : "View Agreement"}
                </button>

                {selected === a.id && (
                  <div style={{
                    background: "#f5f8f5",
                    padding: 16,
                    borderRadius: 10,
                    marginTop: 14,
                  }}>
                    <strong>Agreement Content</strong>

                    {a.type === "GENERATED_TEXT" ? (
                      <p style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}>
                        {a.content}
                      </p>
                    ) : (
                      <p className="muted">
                        Uploaded/link-based agreement.
                        Secure document viewing is not
                        available yet.
                      </p>
                    )}

                    <p>
                      Signer: {a.signerName || "Not signed"}
                    </p>
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      )}

      {!loading && data && isReports && (
        <>
          <p className="muted">
            Snapshot generated at{" "}
            {new Date().toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
            . This is not a historical daily event log.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(175px, 1fr))",
            gap: 14,
          }}>
            <Stat
              label="Assigned Properties"
              value={summary.assignedProperties || 0}
            />
            <Stat
              label="Active Tenancies"
              value={activeCount}
            />
            <Stat
              label="Vacating"
              value={vacatingCount}
            />
            <Stat
              label="Occupied Capacity (Estimated)"
              value={summary.occupied || 0}
            />
            <Stat
              label="Open Maintenance"
              value={summary.openMaintenance || 0}
            />
            <Stat
              label="Overdue Invoices"
              value={overdueCount}
            />
            <Stat
              label="Total Billed (All Periods)"
              value={money(billed)}
            />
            <Stat
              label="Demo Collected (All Periods)"
              value={money(collected)}
            />
            <Stat
              label="Outstanding (All Periods)"
              value={money(outstanding)}
            />
          </div>

          <section style={card}>
            <h3>Assigned Properties</h3>

            {properties.length === 0 && (
              <p className="muted">
                No assigned properties.
              </p>
            )}

            {properties.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: "13px 0",
                  borderBottom: "1px solid #edf1ed",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>{p.title}</span>
                <strong>
                  {p.occupancyRate}% estimated occupancy
                </strong>
              </div>
            ))}
          </section>

          <section style={card}>
            <h3>Rent Collection Report</h3>

            <button
              type="button"
              className="btn outline"
              onClick={exportCsv}
              disabled={invoices.length === 0}
            >
              Export CSV
            </button>

            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={{
                width: "100%",
                minWidth: 650,
                borderCollapse: "collapse",
              }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Tenant</th>
                    <th>Total</th>
                    <th>Demo Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>{i.period}</td>
                      <td>{i.tenant}</td>
                      <td>{money(i.total)}</td>
                      <td>{money(i.paid)}</td>
                      <td>{money(i.remaining)}</td>
                      <td>{i.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="muted">
            Financial data reflects demo records only.
            No actual bank settlements are confirmed.
          </p>
        </>
      )}
    </div>
  );
}
