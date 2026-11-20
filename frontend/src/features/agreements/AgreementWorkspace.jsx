import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import AgreementDownloads from "./AgreementDownloads";
import AgreementUploads from "./AgreementUploads";
import AgreementVersions from "./AgreementVersions";
import AgreementEvidence from "./AgreementEvidence";
import AdminAgreementsKYC from "../admin/AdminAgreementsKYC";
import "./AgreementWorkspace.css";

const currency = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const date = value => value ? new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
const closedTenancies = new Set(["VACATED", "CANCELLED", "TERMINATED"]);

function derive(t) {
  const agreements = [...(t.agreements || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latest = agreements[0];
  const signed = agreements.find(a => Boolean(a.signedAt));
  if (!latest) return { status: "DRAFT_REQUIRED", label: "Agreement needed", latest: null, signed: null };
  if (signed) return { status: "SIGNED", label: "Signed", latest, signed };
  return { status: "AWAITING", label: "Awaiting signature", latest, signed: null };
}

function Status({ status, children }) {
  return <span className={`gaw-status gaw-status-${status.toLowerCase()}`}>{children}</span>;
}

function Metric({ label, value, hint }) {
  return <div className="gaw-metric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function AdminView() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({ agreements: [], total: 0 });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api(`/admin-operations/agreements?page=${page}`);
      setData(result || { agreements: [], total: 0 });
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { load(); }, [load]);
  const records = data.agreements || [];
  const shown = records.filter(a => (!filter || a.status === filter) && [a.property, a.tenant, a.status, a.owner].some(v => String(v || "").toLowerCase().includes(search.toLowerCase())));
  return <section className="gaw-root">
    <div className="gaw-hero"><div><span className="gaw-eyebrow">GOYALNEST / ADMINISTRATIVE OVERSIGHT</span><h2>Agreement Oversight</h2><p>Monitor rental agreements, tenant consent and document governance across the platform.</p></div><button className="gaw-hero-button" type="button" onClick={load}>Refresh records</button></div>
    <div className="gaw-metrics"><Metric label="Versions on this page" value={records.length} hint="Current results" /><Metric label="Awaiting acceptance" value={records.filter(a => a.status === "PENDING_ACCEPTANCE").length} hint="Follow up required" /><Metric label="Active versions" value={records.filter(a => a.status === "ACTIVE").length} hint="Accepted/published" /><Metric label="Total versions" value={data.total || 0} hint="Across all pages" /></div>
    <div className="gaw-tabs"><button type="button" className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Agreement register</button><button type="button" className={tab === "compliance" ? "active" : ""} onClick={() => setTab("compliance")}>Compliance & KYC</button></div>
    {tab === "overview" ? <div className="gaw-panel">
      <div className="gaw-tools"><input aria-label="Search agreements" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenant or property"/><select aria-label="Agreement status" value={filter} onChange={e => setFilter(e.target.value)}><option value="">All statuses</option>{["DRAFT","PENDING_ACCEPTANCE","ACTIVE","SUPERSEDED","CANCELLED"].map(x => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select></div>
      {error && <p role="alert" className="gaw-alert">{error}</p>}{loading ? <p className="gaw-muted">Loading agreements...</p> : shown.length ? <div className="gaw-table-scroll"><table className="gaw-table"><thead><tr><th>Property</th><th>Tenant</th><th>Version</th><th>Status</th><th>Consent evidence</th><th>Action</th></tr></thead><tbody>{shown.map(a => <tr key={a.id}><td><strong>{a.property || "—"}</strong></td><td>{a.tenant || "—"}</td><td>V{a.version}</td><td><Status status={a.status}>{String(a.status).replaceAll("_", " ")}</Status></td><td>{a.consentEvidence ? "Recorded" : a.acceptedAt ? "Not attached" : "Not yet"}</td><td><button className="gaw-button secondary" onClick={() => setSelected(a)} type="button">Review</button></td></tr>)}</tbody></table></div> : <p className="gaw-empty">No agreement versions match these filters.</p>}
      <div className="gaw-pagination"><button disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}>Previous</button><span>Page {page} of {Math.max(1, data.totalPages || 1)}</span><button disabled={loading || page >= (data.totalPages || 1)} onClick={() => setPage(v => v + 1)}>Next</button></div>
      <p className="gaw-footnote">Administrative view is read-only. Signing remains with the tenant; creation remains with the authorized owner.</p>
    </div> : <div className="gaw-legacy"><AdminAgreementsKYC /></div>}
    {selected && <div className="gaw-overlay" onMouseDown={e => {if(e.target === e.currentTarget) setSelected(null)}}><section className="gaw-dialog" role="dialog" aria-modal="true" aria-label="Agreement review"><button className="gaw-close" type="button" onClick={() => setSelected(null)} aria-label="Close">×</button><span className="gaw-eyebrow">AGREEMENT VERSION</span><h3>{selected.property || "Agreement"}</h3><div className="gaw-detail-grid"><div><small>Tenant</small><strong>{selected.tenant || "—"}</strong></div><div><small>Status</small><strong>{selected.status}</strong></div><div><small>Version</small><strong>V{selected.version}</strong></div><div><small>Consent evidence</small><strong>{selected.consentEvidence ? "Recorded" : "Not recorded"}</strong></div></div><p className="gaw-footnote">Use Compliance & KYC for the existing detailed audit and verification information.</p></section></div>}
  </section>;
}

export default function AgreementWorkspace() {
  const { user } = useAuth();
  const role = user?.role;
  const [tab, setTab] = useState("agreements");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [consent, setConsent] = useState(false);
  const isOwner = role === "OWNER";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api("/tenancies/mine");
      setItems(Array.isArray(response) ? response : []);
      setError("");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (role && role !== "ADMIN") load(); }, [load, role]);
  const rows = useMemo(() => items.map(t => ({ ...t, state: derive(t) })), [items]);
  const filtered = rows.filter(t => (filter === "ALL" || t.state.status === filter) && [t.unit?.property?.title, t.unit?.label, t.tenant?.name].some(v => String(v || "").toLowerCase().includes(search.toLowerCase())));
  if (role === "ADMIN") return <AdminView />;
  if (!["OWNER", "TENANT"].includes(role)) return <p>Agreement workspace is not available for your role.</p>;

  async function perform(path, body, success) {
    setBusy(true); setError(""); setMessage("");
    try {
      await api(path, { method: "POST", body });
      setMessage(success);
      setSelected(null); setConsent(false);
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const open = t => { setSelected(t); setConsent(false); setError(""); };
  return <section className="gaw-root">
    <div className="gaw-hero"><div><span className="gaw-eyebrow">GOYALNEST / {isOwner ? "OWNER" : "TENANT"} PORTAL</span><h2>{isOwner ? "Rental Agreements" : "My Agreements"}</h2><p>{isOwner ? "Create and track agreements from existing approved bookings—without searching for tenants again." : "Review agreements, record consent and access your documents in one place."}</p></div><button type="button" className="gaw-hero-button" onClick={load} disabled={loading}>Refresh</button></div>
    <div className="gaw-metrics"><Metric label="Total tenancies" value={rows.length} hint="Linked to your account"/><Metric label={isOwner ? "Needs agreement" : "Not yet received"} value={rows.filter(t => t.state.status === "DRAFT_REQUIRED").length} hint="No agreement on record"/><Metric label="Awaiting signature" value={rows.filter(t => t.state.status === "AWAITING").length} hint="Action pending"/><Metric label="Signed" value={rows.filter(t => t.state.status === "SIGNED").length} hint="Consent recorded"/></div>
    <div className="gaw-tabs"><button type="button" className={tab === "agreements" ? "active" : ""} onClick={() => setTab("agreements")}>Agreement register</button><button type="button" className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>Documents & PDF</button><button type="button" className={tab === "versions" ? "active" : ""} onClick={() => setTab("versions")}>Version management</button><button type="button" className={tab === "evidence" ? "active" : ""} onClick={() => setTab("evidence")}>Audit & evidence</button></div>
    {error && <p className="gaw-alert" role="alert">{error}</p>}{message && <p className="gaw-notice" role="status">{message}</p>}
    {tab === "agreements" && <div className="gaw-panel"><div className="gaw-tools"><input aria-label="Search tenancies" placeholder="Search property, unit or tenant" value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter agreement status" value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">All agreement statuses</option><option value="DRAFT_REQUIRED">Agreement needed</option><option value="AWAITING">Awaiting signature</option><option value="SIGNED">Signed</option></select></div>
      {loading ? <p className="gaw-muted">Loading your agreements...</p> : filtered.length === 0 ? <p className="gaw-empty">No linked agreements found. {isOwner ? "Approved bookings with tenancy records appear here automatically." : "Your owner will issue an agreement for an approved booking."}</p> : <div className="gaw-table-scroll"><table className="gaw-table"><thead><tr><th>Property / Unit</th><th>{isOwner ? "Tenant" : "Monthly rent"}</th><th>Tenancy</th><th>Agreement</th><th>Next action</th></tr></thead><tbody>{filtered.map(t => <tr key={t.id}><td><strong>{t.unit?.property?.title || "Rental property"}</strong><small>{t.unit?.label || "Unit not specified"}</small></td><td>{isOwner ? t.tenant?.name || "—" : currency(t.rent)}</td><td><span className="gaw-tenancy-status">{String(t.status || "—").replaceAll("_", " ")}</span></td><td><Status status={t.state.status}>{t.state.label}</Status></td><td><button className="gaw-button" type="button" onClick={() => open(t)}>{isOwner && t.state.status === "DRAFT_REQUIRED" && t.status === "PENDING_PAYMENT" ? "Create agreement" : !isOwner && t.state.status === "AWAITING" && !closedTenancies.has(t.status) ? "Review & sign" : "View details"}</button></td></tr>)}</tbody></table></div>}
      <p className="gaw-footnote">Agreement creation is based on a linked tenancy; only eligible unsigned agreements can be accepted. Completed tenancies remain in history.</p>
    </div>}
    {tab === "documents" && <div className="gaw-subpanel"><AgreementDownloads />{isOwner && <AgreementUploads />}</div>}
    {tab === "versions" && <div className="gaw-subpanel"><AgreementVersions /></div>}
    {tab === "evidence" && <div className="gaw-subpanel"><AgreementEvidence /></div>}
    {selected && <div className="gaw-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setSelected(null); }}><section className="gaw-dialog" role="dialog" aria-modal="true" aria-label="Agreement details"><button className="gaw-close" type="button" aria-label="Close" disabled={busy} onClick={() => setSelected(null)}>×</button><span className="gaw-eyebrow">RENTAL AGREEMENT / TENANCY DETAILS</span><h3>{selected.unit?.property?.title || "Rental property"}</h3><p className="gaw-muted">All details are linked to the existing booking and tenancy records.</p><div className="gaw-detail-grid"><div><small>Tenant</small><strong>{selected.tenant?.name || user?.name || "—"}</strong></div><div><small>Unit</small><strong>{selected.unit?.label || "—"}</strong></div><div><small>Monthly rent</small><strong>{currency(selected.rent)}</strong></div><div><small>Start date</small><strong>{date(selected.startDate)}</strong></div><div><small>Tenancy status</small><strong>{selected.status}</strong></div><div><small>Agreement status</small><strong>{selected.state.label}</strong></div></div>
      {selected.state.latest ? <div className="gaw-document-preview"><h4>Agreement terms</h4><p>{selected.state.latest.content || "Agreement content not available."}</p><span>{selected.state.signed ? `Consent recorded on ${date(selected.state.signed.signedAt)}` : "Awaiting tenant consent"}</span></div> : <div className="gaw-document-preview"><h4>No agreement generated</h4><p>An eligible tenancy can be used to generate the existing draft agreement text. The owner must review its legal adequacy before use.</p></div>}
      {isOwner && !selected.state.latest && selected.status === "PENDING_PAYMENT" && <div className="gaw-dialog-actions"><button type="button" disabled={busy} className="gaw-button" onClick={() => perform(`/agreements/${selected.id}`, { type: "GENERATED_TEXT" }, "Agreement generated. Tenant can review it in My Agreements.")}>{busy ? "Creating..." : "Generate draft agreement"}</button></div>}
      {!isOwner && selected.state.latest && !selected.state.signed && !closedTenancies.has(selected.status) && <div className="gaw-consent"><label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> I have read the agreement text and consent to the terms displayed above.</label><p className="gaw-footnote">This records application consent; it is not a government-certified digital signature.</p><button className="gaw-button" type="button" disabled={!consent || busy} onClick={() => perform(`/agreements/${selected.state.latest.id}/consent`, { signerName: user.name }, "Your agreement consent has been recorded.")}>{busy ? "Saving..." : "Record my consent"}</button></div>}
      {isOwner && selected.state.signed && selected.status === "PENDING_PAYMENT" && <div className="gaw-consent"><p className="gaw-footnote">Activate tenancy only after all required checks and payments are confirmed by your established workflow.</p><button className="gaw-button secondary" type="button" disabled={busy} onClick={() => perform(`/tenancies/${selected.id}/activate`, {}, "Tenancy activation request processed.")}>{busy ? "Processing..." : "Activate tenancy (existing workflow)"}</button></div>}
      {closedTenancies.has(selected.status) && <p className="gaw-notice">This is a historical tenancy. Agreement actions are read-only.</p>}
    </section></div>}
  </section>;
}
