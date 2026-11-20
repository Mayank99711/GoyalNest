
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";

export default function AgreementEvidence() {
  const { user } = useAuth();
  const [evidence, setEvidence] = useState([]);
  const [versions, setVersions] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isOwner = user?.role === "OWNER";

  async function load() {
    try {
      const [records, history] = await Promise.all([
        api("/agreement-evidence"),
        api("/agreement-versions"),
      ]);

      setEvidence(Array.isArray(records) ? records : []);
      setVersions(Array.isArray(history) ? history : []);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function reconcile(versionId) {
    setBusy(versionId);
    setError("");
    setMessage("");

    try {
      const result = await api(
        `/agreement-evidence/${versionId}/reconcile`,
        { method: "POST" }
      );

      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  const missing = versions.filter(v =>
    ["ACTIVE", "SUPERSEDED"].includes(v.status) &&
    v.acceptedAt &&
    !evidence.some(e => e.versionId === v.id)
  );

  return (
    <section className="card" style={{ padding: 24 }}>
      <h2>Agreement Consent Evidence</h2>

      <p className="muted">
        Acceptance history and document integrity records.
      </p>

      {error && <p className="error">{error}</p>}
      {message && <p role="status">{message}</p>}

      {isOwner && missing.map(v => (
        <div className="record" key={v.id}>
          <div>
            <strong>V{v.version} — Evidence Pending</strong>
            <p className="muted">{v.filename}</p>
          </div>
          <button
            className="btn primary"
            disabled={Boolean(busy)}
            onClick={() => reconcile(v.id)}
          >
            {busy === v.id
              ? "Reconciling..."
              : "Reconcile Historical Evidence"}
          </button>
        </div>
      ))}

      {evidence.length === 0 && (
        <p className="muted">No consent evidence recorded yet.</p>
      )}

      {evidence.map(e => (
        <div className="record" key={e.id}>
          <div>
            <strong>Agreement V{e.versionNumber}</strong>

            <p>{e.filename}</p>

            <p className="muted">
              Accepted:{" "}
              {new Date(e.acceptedAt).toLocaleString("en-IN")}
            </p>

            <p className="muted">
              Source: {e.source}
            </p>

            <small style={{ overflowWrap: "anywhere" }}>
              SHA-256: {e.documentSha256}
            </small>
          </div>
        </div>
      ))}
    </section>
  );
}
