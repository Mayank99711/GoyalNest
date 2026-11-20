
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";

export default function AgreementVersions() {
  const { user } = useAuth();
  const [versions, setVersions] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [uploadId, setUploadId] = useState("");
  const [accepted, setAccepted] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isOwner = user?.role === "OWNER";
  const isTenant = user?.role === "TENANT";

  async function load() {
    try {
      const [v, u] = await Promise.all([
        api("/agreement-versions"),
        isOwner
          ? api("/agreement-uploads/mine")
          : Promise.resolve([]),
      ]);

      setVersions(Array.isArray(v) ? v : []);

      const available = (Array.isArray(u) ? u : [])
        .filter(doc =>
          !v.some(version => version.uploadId === doc.id)
        );

      setUploads(available);
      setUploadId(old =>
        available.some(doc => doc.id === old)
          ? old
          : available[0]?.id || ""
      );

      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function perform(path, body) {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api(path, {
        method: "POST",
        body,
      });

      setMessage(result.message || "Updated");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download(version) {
    try {
      const res = await fetch(
        `/api/agreement-uploads/${version.uploadId}/download`,
        { credentials: "include" }
      );

      if (!res.ok) {
        throw new Error(`Download failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download =
        `GoyalNest-Agreement-V${version.version}.pdf`;

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card" style={{ padding: 24 }}>
      <h2>Agreement Version History</h2>
      <p className="muted">
        Draft, publish and track tenant acceptance
        without replacing previous documents.
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      {isOwner && (
        <div style={{
          display: "grid",
          gap: 12,
          marginBottom: 24,
        }}>
          <h3>Create Agreement Version</h3>

          <select
            value={uploadId}
            onChange={e => setUploadId(e.target.value)}
            style={{ width: "100%", padding: 12 }}
          >
            {uploads.length === 0 && (
              <option value="">Upload a new PDF first</option>
            )}
            {uploads.map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.property} — {doc.tenant} — {doc.filename}
              </option>
            ))}
          </select>

          <button
            className="btn primary"
            disabled={!uploadId || busy}
            onClick={() =>
              perform("/agreement-versions/from-upload", {
                uploadId,
              })
            }
          >
            Create Draft Version
          </button>
        </div>
      )}

      <div className="record-list">
        {versions.length === 0 && (
          <p className="muted">
            No registered agreement versions yet.
          </p>
        )}

        {versions.map(v => (
          <article
            className="record"
            key={v.id}
            style={{ display: "block" }}
          >
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}>
              <div>
                <h3>
  Version {v.version} —{" "}
  {v.status === "CANCELLED"
    ? "Cancelled (Archived)"
    : v.status.replaceAll("_", " ")}
</h3>
                <strong>{v.property}</strong>

                <p className="muted">
                  {v.tenant} · {v.room}
                </p>
                <p className="muted">
                  {v.filename}
                </p>
              </div>

              <button
                className="btn outline"
                onClick={() => download(v)}
              >
                Download PDF
              </button>
            </div>
            {isOwner && v.status === "DRAFT" && (
  <button
    type="button"
    className="btn outline"
    disabled={busy}
    onClick={() => {
      if (
        window.confirm(
          `Cancel agreement V${v.version} draft? ` +
          "The uploaded PDF will be retained."
        )
      ) {
        perform(
          `/agreement-versions/${v.id}/cancel-draft`
        );
      }
    }}
  >
    Cancel Draft
  </button>
)}

{isOwner && v.status === "DRAFT" && (
  <button
    type="button"
    className="btn primary"
    disabled={busy || !v.sha256}
    onClick={() => {
      const confirmed = window.confirm(
        `Publish Agreement V${v.version}?\n\n` +
        `Tenant: ${v.tenant}\n` +
        `Property: ${v.property}\n` +
        `File: ${v.filename}\n` +
        `SHA-256: ${v.sha256}\n\n` +
        "Confirm you reviewed the exact PDF and " +
        "it is the intended rental agreement.\n\n" +
        "The tenant must accept it separately."
      );

      if (!confirmed) return;

      perform(
        `/agreement-versions/${v.id}/publish`,
        {
          confirmed: true,
          expectedSha256: v.sha256,
          expectedFilename: v.filename,
        }
      );
    }}
  >
    Review & Publish Agreement
  </button>
)}


            {isTenant &&
              v.status === "PENDING_ACCEPTANCE" && (
                <div style={{
                  display: "grid",
                  gap: 12,
                  marginTop: 16,
                }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(accepted[v.id])}
                      onChange={e =>
                        setAccepted(old => ({
                          ...old,
                          [v.id]: e.target.checked,
                        }))
                      }
                    />
                    {" "}I have reviewed the downloaded
                    agreement and accept this version.
                  </label>

                  <button
                    className="btn primary"
                    disabled={!accepted[v.id] || busy}
                    onClick={() => {
                      if (window.confirm(
                        `Accept agreement V${v.version}?`
                      )) {
                        perform(
                          `/agreement-versions/${v.id}/accept`,
                          { accepted: true }
                        );
                      }
                    }}
                  >
                    Accept Version {v.version}
                  </button>
                </div>
              )}

            {v.acceptedAt && (
              <p className="muted">
                Accepted:{" "}
                {new Date(v.acceptedAt)
                  .toLocaleString("en-IN")}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
