
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./DisputeConversation.css";

export default function DisputeConversation({
  disputeId,
  status,
}) {
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const closed = ["RESOLVED", "REJECTED"].includes(status);

  async function load() {
    try {
      const data = await api(
        `/dispute-cases/${encodeURIComponent(disputeId)}/messages`
      );
      setMessages(data.messages || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMessages([]);
    setLoading(true);
    load();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);

    return () => clearInterval(interval);
  }, [disputeId]);

  async function send(event) {
    event.preventDefault();

    if (busy || closed || body.trim().length < 2) return;

    setBusy(true);
    setError("");

    try {
      await api(
        `/dispute-cases/${encodeURIComponent(disputeId)}/messages`,
        {
          method: "POST",
          body: { body: body.trim() },
        }
      );

      setBody("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dc-panel">
      <div className="dc-heading">
        <div>
          <h4>Case Conversation</h4>
          <p>Messages are visible to authorized case parties.</p>
        </div>

        <button
          type="button"
          className="dc-refresh"
          onClick={load}
        >
          Refresh
        </button>
      </div>

      <div className="dc-messages" aria-live="polite">
        {loading && <p>Loading messages...</p>}

        {!loading && messages.length === 0 && (
          <p className="dc-empty">
            No messages yet. Start the conversation below.
          </p>
        )}

        {messages.map(message => (
          <article className="dc-message" key={message.id}>
            <div className="dc-message-meta">
              <strong>{message.authorName}</strong>
              <span className="dc-role">
                {message.authorRole}
              </span>
              <time>
                {new Date(message.createdAt)
                  .toLocaleString("en-IN")}
              </time>
            </div>

            <p>{message.body}</p>
          </article>
        ))}
      </div>

      {error && (
        <p className="dc-error" role="alert">
          {error}
        </p>
      )}

      {closed ? (
        <p className="dc-closed">
          This case is closed. Conversation is read-only.
        </p>
      ) : (
        <form onSubmit={send} className="dc-compose">
          <label htmlFor={`dispute-reply-${disputeId}`}>
            Add a reply
          </label>

          <textarea
            id={`dispute-reply-${disputeId}`}
            rows={3}
            maxLength={3000}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your response or clarification..."
          />

          <div className="dc-compose-footer">
            <small>{body.length}/3000</small>

            <button
              type="submit"
              disabled={busy || body.trim().length < 2}
            >
              {busy ? "Sending..." : "Send Reply"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
