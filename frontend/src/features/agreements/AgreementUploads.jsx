
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";

export default function AgreementUploads() {
  const { user } = useAuth();
  const [tenancies, setTenancies] = useState([]);
  const [tenancyId, setTenancyId] = useState("");
  const [file, setFile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isOwner = user?.role === "OWNER";

  async function load() {
    try {
      const requests = [
        api("/agreement-uploads/mine"),
      ];

      if (isOwner) {
        requests.push(api("/agreement-uploads/eligible-tenancies"));
      }

      const [docs, tenancyList] = await Promise.all(requests);

      setDocuments(Array.isArray(docs) ? docs : []);
      if (isOwner) {
        const list = Array.isArray(tenancyList) ? tenancyList : [];
        setTenancies(list);
        setTenancyId((previous) =>
          list.some((t) => t.id === previous)
            ? previous
            : list[0]?.id || ""
        );
      }

      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [isOwner]);

  async function submit(event) {
    event.preventDefault();

    if (!file || !tenancyId) return;

    if (
      file.type !== "application/pdf" ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Select a PDF of 5 MB or smaller.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const body = new FormData();
      body.append("document", file);

      const response = await fetch(
        `/api/agreement-uploads/${encodeURIComponent(tenancyId)}`,
        {
          method: "POST",
          credentials: "include",
          body,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      setMessage(result.message);
      setFile(null);

      const input = document.getElementById(
        "goyalnest-agreement-file"
      );
      if (input) input.value = "";

      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download(doc) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/agreement-uploads/${encodeURIComponent(doc.id)}/download`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = doc.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ padding: 24 }}>
      <h2>Uploaded Agreement Documents</h2>
      <p className="muted">
        Private PDF documents linked to rental tenancies.
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      {isOwner && (
        <form
          onSubmit={submit}
          style={{ display: "grid", gap: 14, marginBottom: 24 }}
        >
          <label>
            Select Tenancy
            <select
              required
              value={tenancyId}
              onChange={(e) => setTenancyId(e.target.value)}
              style={{ display: "block", width: "100%", padding: 12 }}
            >
              {tenancies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tenant.name} — {t.unit.property.title}
                  {" — "}{t.unit.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Upload PDF
            <input
              id="goyalnest-agreement-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) =>
                setFile(e.target.files?.[0] || null)
              }
              required
            />
          </label>

          <button
            type="submit"
            className="btn primary"
            disabled={busy || !tenancyId || !file}
          >
            {busy ? "Uploading..." : "Upload Agreement"}
          </button>
        </form>
      )}

      <div className="record-list">
        {documents.length === 0 && (
          <p className="muted">No uploaded agreements yet.</p>
        )}

        {documents.map((doc) => (
          <div className="record" key={doc.id}>
            <div>
              <strong>{doc.filename}</strong>
              <p className="muted">
                {doc.property} — {doc.room}
              </p>
              <p className="muted">
                Tenant: {doc.tenant}
              </p>
              <small>
                Uploaded document; signature not independently verified
              </small>
            </div>

            <button
              type="button"
              className="btn outline"
              disabled={busy}
              onClick={() => download(doc)}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
