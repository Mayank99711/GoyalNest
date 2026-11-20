
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import "./ManagerDailyOperations.css";

const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const dateText = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
      })
    : "—";

function SummaryCard({ title, value }) {
  return (
    <div className="mdo-stat">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function ManagerDailyOperations({
  page = "tenants",
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  async function load() {
    setLoading(true);

    try {
      const result = await api(
        "/manager-portal/operations"
      );

      setData(result);
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

  const tenants = data?.tenants || [];
  const invoices = data?.invoices || [];

  const active = tenants.filter(
    (t) => t.status === "ACTIVE"
  ).length;

  const vacating = tenants.filter(
    (t) => t.status === "VACATING"
  ).length;

  const pending = tenants.filter(
    (t) => t.status === "PENDING_PAYMENT"
  ).length;

  const outstanding = invoices.reduce(
    (sum, i) => sum + i.remaining,
    0
  );

  const collected = invoices.reduce(
    (sum, i) => sum + i.paid,
    0
  );

  const filteredTenants = useMemo(
    () =>
      tenants.filter((t) => {
        const q = search.toLowerCase().trim();

        const matchesSearch = [
          t.tenant.name,
          t.tenant.email,
          t.property,
          t.room,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(q)
        );

        const matchesStatus =
          statusFilter === "ALL" ||
          t.status === statusFilter;

        return matchesSearch && matchesStatus;
      }),
    [tenants, search, statusFilter]
  );

  const filteredInvoices = invoices.filter((i) => {
    const q = search.toLowerCase().trim();

    const matchesSearch = [
      i.tenant,
      i.property,
      i.room,
      i.period,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(q)
    );

    const matchesStatus =
      statusFilter === "ALL" ||
      i.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const pageTitle = {
    tenants: "Tenant Records",
    checkin: "Check-in / Check-out",
    rent: "Rent Collection",
  };

  return (
    <div className="mdo-page">
      <div className="mdo-header">
        <div>
          <h2>{pageTitle[page] || "Manager Operations"}</h2>
          <p className="muted">
            Data from your assigned properties only.
          </p>
        </div>

        <button
          type="button"
          className="btn outline"
          disabled={loading}
          onClick={load}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}

      {loading && <p>Loading records...</p>}

      {!loading && data && (
        <>
          <div className="mdo-stats">
            {page === "rent" ? (
              <>
                <SummaryCard
                  title="Demo Collected"
                  value={money(collected)}
                />
                <SummaryCard
                  title="Outstanding"
                  value={money(outstanding)}
                />
                <SummaryCard
                  title="Total Invoices"
                  value={invoices.length}
                />
              </>
            ) : (
              <>
                <SummaryCard
                  title="Active Tenancies"
                  value={active}
                />
                <SummaryCard
                  title="Pending Activation"
                  value={pending}
                />
                <SummaryCard
                  title="Vacating"
                  value={vacating}
                />
              </>
            )}
          </div>

          <section className="mdo-panel">
            <div className="mdo-filters">
              <input
                type="search"
                placeholder="Search tenant, room or property..."
                value={search}
                onChange={(e) =>
                  setSearch(e.target.value)
                }
              />

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value)
                }
              >
                <option value="ALL">All Statuses</option>

                {(page === "rent"
                  ? [
                      "PENDING",
                      "PARTIALLY_PAID",
                      "OVERDUE",
                      "PAID",
                    ]
                  : [
                      "PENDING_PAYMENT",
                      "ACTIVE",
                      "VACATING",
                      "VACATED",
                      "CANCELLED",
                    ]
                ).map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            {page === "tenants" && (
              <>
                <h3>Assigned Tenant Records</h3>

                {filteredTenants.length === 0 && (
                  <p className="muted">
                    No matching tenants found.
                  </p>
                )}

                {filteredTenants.map((t) => (
                  <article
                    className="mdo-record"
                    key={t.tenancyId}
                  >
                    <div className="mdo-record-top">
                      <h4>{t.tenant.name}</h4>
                      <span className="mdo-status">
                        {t.status}
                      </span>
                    </div>

                    <p>
                      {t.property} — {t.room}
                    </p>

                    <p>Email: {t.tenant.email}</p>
                    <p>
                      Phone: {t.tenant.phone || "Not provided"}
                    </p>
                    <p>Start date: {dateText(t.startDate)}</p>
                    <p>
                      Security deposit recorded:{" "}
                      {money(t.depositPaid)}
                    </p>
                  </article>
                ))}
              </>
            )}

            {page === "checkin" && (
              <>
                <h3>Check-in & Check-out Tracking</h3>

                <p className="muted">
                  Monitor tenancy readiness and move-out
                  requests. Activation and final settlement
                  remain Owner-controlled.
                </p>

                {filteredTenants.length === 0 && (
                  <p className="muted">
                    No matching check-in or check-out records.
                  </p>
                )}

                {filteredTenants.map((t) => (
                  <article
                    className="mdo-record"
                    key={t.tenancyId}
                  >
                    <div className="mdo-record-top">
                      <h4>{t.tenant.name}</h4>
                      <span className="mdo-status">
                        {t.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <p>{t.property} — {t.room}</p>

                    <p>
                      Scheduled move-in: {dateText(t.moveIn)}
                    </p>

                    <p>
                      Tenancy start: {dateText(t.startDate)}
                    </p>

                    {t.moveOut && (
                      <>
                        <p>
                          Requested vacating date:{" "}
                          {dateText(t.moveOut.requestedDate)}
                        </p>

                        <p>
                          Inspection:{" "}
                          {t.moveOut.inspectionNotes ||
                            "Pending"}
                        </p>

                        <p>
                          Settlement approved:{" "}
                          {t.moveOut.approved ? "Yes" : "No"}
                        </p>
                      </>
                    )}

                    <p className="muted">
                      {t.status === "PENDING_PAYMENT"
                        ? "Awaiting Owner tenancy activation."
                        : t.status === "VACATING"
                          ? "Inspection and handover coordination required."
                          : t.status === "VACATED"
                            ? "Tenancy closed; room readiness must be confirmed."
                            : "Tracking record"}
                    </p>
                  </article>
                ))}
              </>
            )}

            {page === "rent" && (
              <>
                <h3>Rent Invoices & Balances</h3>

                {filteredInvoices.length === 0 && (
                  <p className="muted">
                    No matching invoices found.
                  </p>
                )}

                <div className="mdo-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Tenant / Property</th>
                        <th>Month</th>
                        <th>Total</th>
                        <th>Demo Paid</th>
                        <th>Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredInvoices.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <strong>{i.tenant}</strong>
                            <small>
                              {i.property} — {i.room}
                            </small>
                          </td>

                          <td>{i.period}</td>
                          <td>{money(i.total)}</td>
                          <td>{money(i.paid)}</td>
                          <td>{money(i.remaining)}</td>
                          <td>
                            <span className="mdo-status">
                              {i.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="muted">
                  Read-only demo collection report. Manager
                  cannot confirm payments or refunds.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
