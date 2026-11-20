
import React, { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import "./RentAlerts.css";
export default function RentAlerts() {
  const [notices, setNotices] = useState([]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("active");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  async function load() {
    try {
      const result = await api(
        "/rent-automation/notifications"
      );
      setNotices(Array.isArray(result) ? result : []);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();

    const interval = setInterval(load, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClick(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const active = notices.filter((n) => {
    if (n.invoice?.status === "PAID") return false;

    if (n.kind === "ADVANCE_REMINDER") {
      return n.invoice?.status === "PENDING";
    }

    if (n.kind === "LATE_FEE") {
      return n.invoice?.status === "OVERDUE";
    }

    return true;
  });

  const history = notices.filter(
    (n) => !active.some((a) => a.id === n.id)
  );

  const unread = active.filter((n) => !n.readAt).length;

  const visible = tab === "active" ? active : history;

  async function readNotice(notice) {
    setSelected(notice.id);

    if (notice.readAt) return;

    try {
      await api(
        `/rent-automation/notifications/${notice.id}/read`,
        { method: "PATCH" }
      );

      setNotices((previous) =>
        previous.map((n) =>
          n.id === notice.id
            ? { ...n, readAt: new Date().toISOString() }
            : n
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  const chosen = notices.find((n) => n.id === selected);

  return (
    <div
      ref={containerRef}
      className="gn-notifications"
    >
      <button
        type="button"
        className="gn-bell"
        onClick={() => {
          setOpen((previous) => !previous);
          setSelected(null);
          load();
        }}
        aria-label={`Notifications, ${unread} unread`}
        aria-expanded={open}
      >
        <svg
          width="21"
          height="21"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>

        {unread > 0 && (
          <span className="gn-bell-count">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="gn-notification-panel">
          <div className="gn-notification-heading">
            <strong>Notifications</strong>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
            >
              ✕
            </button>
          </div>

          <div className="gn-notification-tabs">
            <button
              type="button"
              className={tab === "active" ? "selected" : ""}
              onClick={() => {
                setTab("active");
                setSelected(null);
              }}
            >
              Active ({active.length})
            </button>

            <button
              type="button"
              className={tab === "history" ? "selected" : ""}
              onClick={() => {
                setTab("history");
                setSelected(null);
              }}
            >
              History ({history.length})
            </button>
          </div>

          {error && <p role="alert">{error}</p>}

          <div className="gn-notification-list">
            {visible.length === 0 && (
              <div className="gn-notification-empty">
                {tab === "active"
                  ? "You're all caught up!"
                  : "No archived notifications yet."}
              </div>
            )}

            {visible.map((notice) => (
              <button
                type="button"
                className={`gn-notification-item ${
                  notice.readAt ? "" : "unread"
                }`}
                key={notice.id}
                onClick={() => readNotice(notice)}
              >
                <span className="gn-notification-icon">
                  {notice.kind === "LATE_FEE"
                    ? "!"
                    : "₹"}
                </span>

                <span className="gn-notification-copy">
                  <strong>
                    {notice.kind === "LATE_FEE"
                      ? "Rent overdue"
                      : "Rent reminder"}
                    {" — "}
                    {notice.invoice?.period}
                  </strong>

                  <small>
                    ₹{(
                      (notice.invoice?.amount || 0) +
                      (notice.invoice?.penalty || 0)
                    ).toLocaleString("en-IN")}
                    {" · "}
                    {notice.invoice?.status}
                  </small>

                  <small>
                    {new Date(
                      notice.createdAt
                    ).toLocaleDateString("en-IN")}
                  </small>
                </span>

                {!notice.readAt && (
                  <span className="gn-unread-dot" />
                )}
              </button>
            ))}
          </div>

          {chosen && (
            <div className="gn-notification-detail">
              <strong>{chosen.title}</strong>

              <p>
                {chosen.kind === "ADVANCE_REMINDER"
                  ? `Your rent of ₹${Number(
                      chosen.invoice?.amount || 0
                    ).toLocaleString("en-IN")} for ${
                      chosen.invoice?.period
                    } is payable from the 1st to the 6th. Late fees may apply from the 7th.`
                  : chosen.message}
              </p>

              <button
                type="button"
                className="btn outline"
                onClick={() => setSelected(null)}
              >
                Back
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
