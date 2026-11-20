import AdminKycReview from "./AdminKycReview";
import "./AdminPolish.css";
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminAgreementsKYC() {
  const [agreements, setAgreements] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const data = await api(
          `/admin-operations/agreements?page=${page}`
        );

        if (!active) return;

        setAgreements(data.agreements || []);
        setTotal(data.total || 0);
        setTotalPages(Math.max(1, data.totalPages || 1));
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [page]);

  const filtered = agreements.filter(
    item => !status || item.status === status
  );

  const formatDate = value =>
    value
      ? new Date(value).toLocaleString("en-IN")
      : "—";
  const [kycDocuments, setKycDocuments] = useState([]);
const [kycError, setKycError] = useState("");

useEffect(() => {
  let active = true;

  api("/admin-operations/kyc")
    .then(data => {
      if (active) setKycDocuments(data.documents || []);
    })
    .catch(err => {
      if (active) setKycError(err.message);
    });

  return () => {
    active = false;
  };
}, []);
  return (
    <div className="dashboard-grid gn-admin-polish">
      <section className="card" style={{ padding: 24 }}>
        <h2>Agreements & KYC</h2>
        <p className="muted">
          Rental agreement monitoring and consent verification.
        </p>

        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 20,
        }}>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            style={{ padding: 12 }}
          >
            <option value="">All Agreement Statuses</option>
            {[
              "DRAFT",
              "PENDING_ACCEPTANCE",
              "ACTIVE",
              "SUPERSEDED",
              "CANCELLED",
            ].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <span>Total versions: {total}</span>
        </div>

        {error && <p className="error">{error}</p>}
        {loading && <p>Loading agreements...</p>}

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            textAlign: "left",
          }}>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Property</th>
                <th>Version</th>
                <th>Status</th>
                <th>Consent</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td>{a.tenant}</td>
                  <td>{a.property}</td>
                  <td>V{a.version}</td>
                  <td><span className={`gn-admin-pill gn-admin-pill--${String(a.status || "").toLowerCase()}`}>{String(a.status || "UNKNOWN").replaceAll("_", " ")}</span></td>
                  <td>
                    {a.consentEvidence
                      ? "Recorded"
                      : a.acceptedAt
                        ? "Evidence missing"
                        : "Not accepted"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn outline"
                      onClick={() => setSelected(a)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length === 0 && (
          <p className="muted">
            No matching agreement versions on this page.
          </p>
        )}

        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 20,
        }}>
          <button
            type="button"
            className="btn outline"
            disabled={loading || page <= 1}
            onClick={() => {
              setPage(p => p - 1);
              setSelected(null);
            }}
          >
            Previous
          </button>

          <span>Page {page} of {totalPages}</span>

          <button
            type="button"
            className="btn outline"
            disabled={loading || page >= totalPages}
            onClick={() => {
              setPage(p => p + 1);
              setSelected(null);
            }}
          >
            Next
          </button>
        </div>
      </section>

      {selected && (
        <section className="card" style={{ padding: 24 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}>
            <h2>Agreement V{selected.version}</h2>

            <button
              type="button"
              className="btn outline"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>

          <p>Tenant: {selected.tenant}</p>
          <p>Email: {selected.tenantEmail}</p>
          <p>Property: {selected.property}</p>
          <p>Room: {selected.room}</p>
          <p>Tenancy Status: {selected.tenancyStatus}</p>
          <p>Agreement Status: {selected.status}</p>
          <p>File: {selected.filename}</p>
          <p>Published: {formatDate(selected.publishedAt)}</p>
          <p>Accepted: {formatDate(selected.acceptedAt)}</p>

          <h3>Consent Evidence</h3>

          {selected.consentEvidence ? (
            <>
              <p>
                Source: {selected.consentEvidence.source}
              </p>
              <p>
                SHA-256 Recorded:{" "}
                {selected.consentEvidence.hashRecorded
                  ? "Yes"
                  : "No"}
              </p>
              <p className="muted">
                Consent evidence is not a certified
                electronic signature.
              </p>
            </>
          ) : (
            <p className="muted">
              No consent evidence record available.
            </p>
          )}

          <h3>KYC Review</h3>
          <p className="muted">
            KYC verification will be connected to the
            existing tenant document records. Agreement
            acceptance does not mean KYC is verified.
          </p>
        </section>
      )}

<section className="gn-admin-kyc-intro" aria-label="KYC review summary">
  <div><div className="gn-admin-eyebrow">COMPLIANCE QUEUE</div><h3>Identity verification</h3><p>Agreement acceptance and identity verification are separate decisions. Use the dedicated review table below to inspect each file.</p></div>
  <div className="gn-admin-toolbar"><span className="gn-admin-count">{kycDocuments.filter(d => d.status === "PENDING").length} pending KYC</span><a className="btn primary" href="#gn-kyc-review">Review KYC documents ↓</a></div>
  {kycError && <p className="error" role="alert">{kycError}</p>}
</section>
  <AdminKycReview />
    </div>
  );
}
