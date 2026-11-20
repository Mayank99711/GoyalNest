
import React, { useState } from "react";
import { Pill, useRemote } from "../../components/UI";

export default function BookingKYCReview({ bookingId }) {
  const { data, busy, error, reload } = useRemote(
    `/kyc/bookings/${bookingId}`,
    [bookingId]
  );

  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const documents = Array.isArray(data) ? data : [];

  async function review(documentId, status) {
    if (!window.confirm(`Mark document as ${status}?`)) {
      return;
    }

    setProcessing(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/kyc/${documentId}/review`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, status })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Review failed");
      }

      setMessage(`KYC marked ${status}.`);
      reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="kyc-review">
      <h4>Tenant KYC Review</h4>

      {busy && <p>Loading KYC documents...</p>}
      {error && <p className="error">{error}</p>}

      {!busy && documents.length === 0 && (
        <p className="muted">
          No private KYC documents available.
        </p>
      )}

      {documents.map(doc => (
        <div className="record" key={doc.id}>
          <div>
            <strong>{doc.fileName}</strong>
            <p><Pill>{doc.status}</Pill></p>

            <a
              href={`/api/kyc/${doc.id}/download`}
              className="btn outline"
            >
              Download for review
            </a>
          </div>

          {doc.status === "PENDING" && (
            <div className="button-group">
              <button
                type="button"
                className="btn primary"
                disabled={processing}
                onClick={() => review(doc.id, "VERIFIED")}
              >
                Verify
              </button>

              <button
                type="button"
                className="btn outline"
                disabled={processing}
                onClick={() => review(doc.id, "REJECTED")}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}

      {message && <p role="status">{message}</p>}
    </div>
  );
}
