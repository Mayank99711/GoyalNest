import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./AdminProfessionalWorkspace.css";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateTime = (value) => value ? new Date(value).toLocaleString("en-IN") : "—";

export default function AdminManagement({ roleFilter = "", initialTab = "users" }) {
  const [users, setUsers] = useState([]);
  const [userPage, setUserPage] = useState(1);
  const [totalUserPages, setTotalUserPages] = useState(1);
  const [finance, setFinance] = useState(null);
  const [logs, setLogs] = useState([]);
  const [tab, setTab] = useState(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => setUserPage(1), [roleFilter]);

  const load = useCallback(async () => {
    setBusy(true);
    const [userResult, financeResult, auditResult] = await Promise.allSettled([
      api(`/admin-operations/users?page=${userPage}&role=${encodeURIComponent(roleFilter)}`),
      api("/admin-operations/finance"),
      api("/admin-operations/audit"),
    ]);
    const errors = [];
    if (userResult.status === "fulfilled") {
      setUsers(userResult.value.users || []);
      setTotalUserPages(Math.max(1, userResult.value.totalPages || 1));
    } else { errors.push(`Users: ${userResult.reason?.message || "Unavailable"}`); }
    if (financeResult.status === "fulfilled") setFinance(financeResult.value);
    else errors.push(`Finance: ${financeResult.reason?.message || "Unavailable"}`);
    if (auditResult.status === "fulfilled") setLogs(auditResult.value.logs || []);
    else errors.push(`Audit: ${auditResult.reason?.message || "Unavailable"}`);
    setError(errors.join(" · "));
    setBusy(false);
  }, [roleFilter, userPage]);
  useEffect(() => { load(); }, [load]);

  async function updateStatus(user) {
    const nextActive = !user.active;
    const reason = window.prompt(`Reason for ${nextActive ? "reactivating" : "suspending"} ${user.name}:`);
    if (reason === null) return;
    if (reason.trim().length < 10) { setError("Reason must contain at least 10 characters."); return; }
    if (!window.confirm(`${nextActive ? "Reactivate" : "Suspend"} ${user.name}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api(`/admin-operations/users/${user.id}/status`, { method: "PATCH", body: { active: nextActive, reason: reason.trim() } });
      setMessage(result.message || "User status updated successfully.");
      await load();
    } catch (err) { setError(err.message || "Unable to change user status."); }
    finally { setBusy(false); }
  }

  const metrics = finance?.summary ? [
    ["Total billed", inr(finance.summary.billed), "Invoice face value; not settled cash"],
    ["Invoices", finance.summary.invoiceCount ?? "—", "All invoice records"],
    ["Paid invoices", finance.summary.paidInvoiceCount ?? "—", "Recorded invoice state"],
    ["Unsettled face value", inr(finance.summary.unsettledFaceValue), "Review payment reconciliation"],
    ["Overdue invoices", finance.summary.overdueInvoiceCount ?? "—", "Follow-up required"],
  ] : [];

  return <section className="gn-admin-pro gn-report-workspace">
    <header className="gn-pro-header">
      <div className="gn-pro-eyebrow">{initialTab === "finance" ? "REPORTS / FINANCIAL OPERATIONS" : "PLATFORM / ACCESS GOVERNANCE"}</div>
      <h2>{roleFilter === "TENANT" ? "Tenant Management" : initialTab === "finance" ? "Reports & Analytics" : "Admin Management Center"}</h2>
      <p className="gn-pro-lede">Operational reporting, account access and audit history from the existing system of record. No graphs, projections or invented totals.</p>
    </header>
    <nav className="gn-pro-tabs" aria-label="Admin management sections">
      {[["finance", "Financial oversight"], ["users", "Users & access"], ["audit", "Audit logs"]].map(([key, label]) =>
        <button type="button" key={key} className={tab === key ? "btn primary" : "btn outline"} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}
      <button className="btn outline" type="button" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "↻ Refresh"}</button>
    </nav>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}

    {tab === "finance" && <div className="gn-pro-section">
      <div className="gn-pro-section-head"><div><h3>Financial overview</h3><p>Invoice-based figures, not a statement of actual gateway settlements.</p></div></div>
      {finance ? <>
        <div className="gn-pro-finance-stats">{metrics.map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
        <div className="gn-pro-section-head"><h3>Recent invoices</h3><p>Showing records provided by the finance API</p></div>
        <div className="gn-pro-table-wrap"><table><thead><tr><th>Tenant</th><th>Property</th><th>Period</th><th>Invoice amount</th><th>Status</th></tr></thead><tbody>
        {(finance.invoices || []).map(i => <tr key={i.id}><td>{i.tenant || "—"}</td><td>{i.property || "—"}</td><td>{i.period || "—"}</td><td><strong>{inr(Number(i.amount || 0) + Number(i.penalty || 0))}</strong></td><td><span className={`gn-pro-status gn-pro-${String(i.status || "").toLowerCase()}`}>{i.status || "Unknown"}</span></td></tr>)}
        {!(finance.invoices || []).length && <tr><td colSpan={5}>No invoice records returned.</td></tr>}
        </tbody></table></div>
      </> : <p className="muted">Financial records are unavailable. Refresh or review the API error above.</p>}
    </div>}

    {tab === "users" && <div className="gn-pro-section">
      <div className="gn-pro-section-head"><h3>User access management</h3><p>Changes require a reason and confirmation.</p></div>
      <div className="gn-pro-table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Access status</th><th>Action</th></tr></thead><tbody>
      {users.filter(u => !roleFilter || u.role === roleFilter).map(u => <tr key={u.id}><td><strong>{u.name}</strong></td><td>{u.role}</td><td>{u.email}</td><td><span className={`gn-pro-status ${u.active ? "gn-pro-active" : "gn-pro-suspended"}`}>{u.active ? "Active" : "Suspended"}</span></td><td>{u.role !== "ADMIN" && <button type="button" className="gn-pro-view" disabled={busy} onClick={() => updateStatus(u)}>{u.active ? "Suspend" : "Reactivate"}</button>}</td></tr>)}
      {!users.length && <tr><td colSpan={5}>No users found on this page.</td></tr>}
      </tbody></table></div>
      <div className="gn-pro-pagination"><button className="btn outline" disabled={busy || userPage <= 1} onClick={() => setUserPage(p => p - 1)}>Previous</button><span>Page {userPage} of {totalUserPages}</span><button className="btn outline" disabled={busy || userPage >= totalUserPages} onClick={() => setUserPage(p => p + 1)}>Next</button></div>
    </div>}

    {tab === "audit" && <div className="gn-pro-section">
      <div className="gn-pro-section-head"><h3>Recent platform audit events</h3><p>Recorded actions from the audit API; timestamps shown in your browser timezone.</p></div>
      <div className="gn-pro-table-wrap"><table><thead><tr><th>Timestamp</th><th>Action</th><th>Entity</th><th>Actor ID</th></tr></thead><tbody>
      {logs.map(log => <tr key={log.id}><td>{dateTime(log.createdAt)}</td><td><strong>{log.action}</strong></td><td>{log.entityType}</td><td>{log.actorId || "—"}</td></tr>)}
      {!logs.length && <tr><td colSpan={4}>No audit records returned.</td></tr>}
      </tbody></table></div>
    </div>}
  </section>;
}
