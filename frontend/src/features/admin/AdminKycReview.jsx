import { useLocation } from "react-router-dom";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import "./AdminPolish.css";

const readable = (value) => String(value || "UNKNOWN").replaceAll("_", " ");

export default function AdminKycReview() {
  const routeLocation = useLocation();
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("PENDING");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lastFocus = useRef(null);
  const closeButton = useRef(null);
  const dialogBody = useRef(null);
  const urlRef = useRef("");

  const revokePreview = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    setPreviewUrl("");
    setPreviewType("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api("/admin-operations/kyc");
      setDocuments(data.documents || []);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load KYC documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Deep link from Dashboard Action Center / Quick Actions to the actual KYC review queue.
  // Keep verification itself behind the existing authenticated review dialog.
  useEffect(() => {
    if (routeLocation.hash !== "#gn-kyc-review") return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("gn-kyc-review");
      if (!target) return;
      target.scrollIntoView({ block: "start", behavior: "smooth" });
      target.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [routeLocation.pathname, routeLocation.hash]);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  // Keep background page stationary while the secure identity dialog is open.
  useEffect(() => {
    if (!selected) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected]);

  const close = useCallback(() => {
    if (busy) return;
    revokePreview();
    setSelected(null);
    setReason("");
    setPreviewError("");
    lastFocus.current?.focus?.();
  }, [busy, revokePreview]);

  useEffect(() => {
    if (!selected) return undefined;
    closeButton.current?.focus();
    const keyHandler = (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const nodes = Array.from(document.querySelectorAll("#gn-kyc-review-modal button:not([disabled]), #gn-kyc-review-modal textarea:not([disabled])"));
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  }, [selected, close]);

  async function preview(doc) {
    lastFocus.current = document.activeElement;
    revokePreview();
    setSelected(doc);
    setPreviewLoading(true);
    window.requestAnimationFrame(() => { if (dialogBody.current) dialogBody.current.scrollTop = 0; });
    setPreviewError("");
    setReason("");
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/admin-kyc/${encodeURIComponent(doc.id)}/preview`, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Document preview failed (${res.status}).`);
      }
      const blob = await res.blob();
      const type = String(blob.type || "").split(";")[0];
      if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(type)) {
        throw new Error("This file type cannot be previewed securely.");
      }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setPreviewUrl(url);
      setPreviewType(type);
    } catch (err) {
      setPreviewError(err.message || "Unable to load document preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function review(status) {
    if (!selected || !previewUrl || busy || selected.status !== "PENDING") return;
    if (status === "REJECTED" && reason.trim().length < 10) {
      setPreviewError("Provide at least 10 characters explaining the rejection.");
      return;
    }
    if (!window.confirm(`${status === "VERIFIED" ? "Verify" : "Reject"} KYC for ${selected.user?.name || "this tenant"}?`)) return;
    setBusy(true);
    setPreviewError("");
    try {
      const result = await api(`/admin-operations/kyc/${selected.id}/review`, {
        method: "PATCH", body: { status, reason: reason.trim() },
      });
      setMessage(result.message || `KYC ${status.toLowerCase()} successfully.`);
      revokePreview();
      setSelected(null);
      setReason("");
      await load();
    } catch (err) {
      setPreviewError(err.message || "Unable to save KYC review.");
    } finally { setBusy(false); }
  }

  const pendingCount = documents.filter(doc => doc.status === "PENDING").length;
  const visible = documents.filter(doc => filter === "ALL" || doc.status === filter);

  return <section id="gn-kyc-review" tabIndex={-1} style={{ scrollMarginTop: "24px" }} className="gn-admin-polish gn-kyc-workspace card" aria-label="Secure Tenant KYC Review">
    <header className="gn-admin-section-head">
      <div><div className="gn-admin-eyebrow">IDENTITY GOVERNANCE</div><h2>Tenant KYC review</h2><p>Inspect each document securely before making an identity verification decision.</p></div>
      <div className="gn-admin-toolbar"><span className="gn-admin-count">{pendingCount} awaiting review</span><button type="button" className="btn outline" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    </header>
    <div className="gn-admin-toolbar gn-admin-filter-row">
      <label htmlFor="gn-kyc-status">Document status</label>
      <select id="gn-kyc-status" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="PENDING">Pending review</option><option value="ALL">All documents</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option>
      </select>
      <span className="gn-admin-helper">Showing {visible.length} of {documents.length} records</span>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="gn-admin-success" role="status">{message}</p>}
    <div className="gn-admin-table-wrap" role="region" aria-label="Tenant KYC documents" tabIndex="0">
      <table className="gn-admin-table"><thead><tr><th>Tenant</th><th>Document</th><th>Status</th><th>Reviewed</th><th>Next action</th></tr></thead>
        <tbody>{visible.map(doc => <tr key={doc.id}>
          <td data-label="Tenant"><strong>{doc.user?.name || "Unknown tenant"}</strong></td>
          <td data-label="Document"><span className="gn-admin-file" title={doc.fileName || ""}>{doc.fileName || doc.type || "Document"}</span><small>{doc.type || "KYC"}</small></td>
          <td data-label="Status"><span className={`gn-admin-pill gn-admin-pill--${String(doc.status || "unknown").toLowerCase()}`}>{readable(doc.status)}</span></td>
          <td data-label="Reviewed">{doc.reviewedAt ? new Date(doc.reviewedAt).toLocaleString("en-IN") : "Not reviewed"}</td>
          <td data-label="Action"><button type="button" className={doc.status === "PENDING" ? "btn primary" : "btn outline"} onClick={() => preview(doc)}>{doc.status === "PENDING" ? "Review & decide" : "View review"}</button></td>
        </tr>)}
        {!loading && visible.length === 0 && <tr><td colSpan={5} className="gn-admin-empty">{filter === "PENDING" ? "No pending KYC documents." : "No documents match this filter."}</td></tr>}
        </tbody></table>
    </div>
    {selected && <div className="gn-admin-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <section id="gn-kyc-review-modal" role="dialog" aria-modal="true" aria-labelledby="gn-kyc-modal-title" className="gn-admin-modal">
        <header className="gn-admin-modal-head"><div><div className="gn-admin-eyebrow">SECURE IDENTITY REVIEW</div><h2 id="gn-kyc-modal-title">{selected.user?.name || "Tenant"}</h2><p>{selected.fileName || selected.type} · <span className={`gn-admin-pill gn-admin-pill--${String(selected.status || "unknown").toLowerCase()}`}>{readable(selected.status)}</span></p></div><button type="button" className="btn outline" ref={closeButton} disabled={busy} onClick={close} aria-label="Close KYC review">Close ×</button></header>
        <div className="gn-admin-modal-body" ref={dialogBody} tabIndex={0} aria-label="KYC document and verification actions">
          <p className="gn-admin-helper">Review the original document carefully before approving or rejecting. Do not distribute document copies.</p>
          {previewLoading && <div className="gn-admin-preview-empty" role="status">Loading secure document preview…</div>}
          {previewError && <p className="error" role="alert">{previewError}</p>}
          {previewUrl && (previewType.startsWith("image/")
            ? <img className="gn-admin-kyc-image" src={previewUrl} alt={`KYC document submitted by ${selected.user?.name || "tenant"}`} />
            : <iframe title="Secure KYC PDF Preview" src={previewUrl} className="gn-admin-kyc-pdf" sandbox="allow-same-origin" />)}
          {selected.status === "PENDING" && previewUrl && <div className="gn-admin-decision-panel">
            <label htmlFor="gn-kyc-reason">Rejection reason <span className="gn-admin-helper">(required only if rejecting)</span></label>
            <textarea id="gn-kyc-reason" rows={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the issue clearly so the tenant knows what to correct" />
            <div className="gn-admin-toolbar"><button type="button" className="btn primary" disabled={busy} onClick={() => review("VERIFIED")}>{busy ? "Saving…" : "✓ Verify KYC"}</button><button type="button" className="btn outline" disabled={busy || reason.trim().length < 10} onClick={() => review("REJECTED")}>Reject with reason</button></div>
          </div>}
          {selected.status !== "PENDING" && <p className="gn-admin-helper">Already reviewed; this document is read-only.</p>}
        </div>
      </section>
    </div>}
  </section>;
}
