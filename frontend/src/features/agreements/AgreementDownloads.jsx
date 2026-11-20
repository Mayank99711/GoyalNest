
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AgreementDownloads() {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const result = await api("/agreement-documents/mine");
      setAgreements(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function downloadPdf(agreement) {
    setBusyId(agreement.id);
    setError("");

    try {
      const response = await fetch(
        `/api/agreement-documents/${encodeURIComponent(
          agreement.id
        )}/pdf`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.error || `Download failed (${response.status})`
        );
      }

      const blob = await response.blob();

      if (blob.type !== "application/pdf") {
        throw new Error("Server did not return a PDF");
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `GoyalNest-Agreement-${agreement.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="card" style={{ padding: 24 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}>
        <div>
          <h2>Agreement Documents</h2>
          <p className="muted">
            Secure downloads of signed rental agreements.
          </p>
        </div>

        <button
          className="btn outline"
          type="button"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p>Loading agreements...</p>}

      {!loading && agreements.length === 0 && (
        <p className="muted">No agreements found.</p>
      )}

      <div className="record-list">
        {agreements.map((agreement) => (
          <div className="record" key={agreement.id}>
            <div>
              <strong>{agreement.property}</strong>
              <p className="muted">
                {agreement.room} — {agreement.tenant}
              </p>
              <p className="muted">
                {agreement.signedAt
                  ? "Signed"
                  : "Awaiting signature"}
              </p>
            </div>

            <button
              type="button"
              className="btn primary"
              disabled={
                !agreement.canDownload ||
                Boolean(busyId)
              }
              onClick={() => downloadPdf(agreement)}
            >
              {busyId === agreement.id
                ? "Downloading..."
                : agreement.canDownload
                  ? "Download PDF"
                  : "PDF Unavailable"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
