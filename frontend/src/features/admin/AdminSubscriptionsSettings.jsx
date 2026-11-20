import "./AdminPolish.css";
import AdminSubscriptionControls from "./AdminSubscriptionControls";
import AdminSubscriptionCheckoutHistory from "./AdminSubscriptionCheckoutHistory";
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminSubscriptionsSettings({
  page = "subscriptions",
}) {
  const isSubscriptions = page === "subscriptions";

  const [subscriptions, setSubscriptions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [plan, setPlan] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        if (isSubscriptions) {
          const result = await api(
            `/admin-operations/subscriptions?page=${currentPage}` +
            `&plan=${encodeURIComponent(plan)}`
          );

          if (!cancelled) {
            setSubscriptions(result.subscriptions || []);
            setTotalPages(result.totalPages || 1);
            setTotal(result.total || 0);
          }
        } else {
          const result = await api(
            "/admin-operations/settings"
          );
          if (!cancelled) setSettings(result);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [isSubscriptions, currentPage, plan]);

  function formatDate(value) {
    return value
      ? new Date(value).toLocaleDateString("en-IN")
      : "—";
  }

  if (isSubscriptions) {
    return <div className="gn-admin-subscriptions-workspace">
      <AdminSubscriptionControls />
      <AdminSubscriptionCheckoutHistory />
    </div>;
  }

  return (
    <section className="gn-admin-polish gn-admin-settings">
      <header className="gn-admin-settings-header">
        <div className="gn-admin-eyebrow">SYSTEM / CONFIGURATION</div>
        <h2>Platform settings</h2>
        <p>Read-only configuration and operational overview. No settings are editable from this screen.</p>
      </header>
      {error && <p role="alert" className="error">{error}</p>}
      {loading && <p role="status">Loading platform settings…</p>}
      {settings && <>
        <div className="gn-admin-settings-summary">
          <article><span>Registered users</span><strong>{settings.platform.users}</strong><small>Across the platform</small></article>
          <article><span>Properties</span><strong>{settings.platform.properties}</strong><small>All property records</small></article>
          <article><span>Pending approvals</span><strong>{settings.platform.pendingApprovals}</strong><small>Listings awaiting moderation</small></article>
        </div>
        <div className="gn-admin-settings-grid">
          <section className="gn-admin-settings-card"><div className="gn-admin-eyebrow">APPLICATION</div><h3>General configuration</h3><dl>
            <div><dt>Platform name</dt><dd>{settings.application.name}</dd></div>
            <div><dt>Settings access</dt><dd><span className="gn-admin-pill gn-admin-pill--active">{settings.application.settingsMode}</span></dd></div>
          </dl></section>
          <section className="gn-admin-settings-card"><div className="gn-admin-eyebrow">AUTHENTICATION</div><h3>Security controls</h3><dl>
            <div><dt>Authentication</dt><dd>{settings.security.authentication}</dd></div>
            <div><dt>Account suspension</dt><dd>{settings.security.accountSuspensionCheck}</dd></div>
          </dl></section>
          <section className="gn-admin-settings-card"><div className="gn-admin-eyebrow">ACCESS</div><h3>Supported roles</h3><div className="gn-admin-chip-list">{(settings.supportedRoles || []).map(role => <span className="gn-admin-chip" key={role}>{role}</span>)}</div></section>
          <section className="gn-admin-settings-card"><div className="gn-admin-eyebrow">BILLING</div><h3>Available subscription plans</h3><div className="gn-admin-chip-list">{(settings.subscriptionPlans || []).map(plan => <span className="gn-admin-chip" key={plan}>{plan}</span>)}</div></section>
        </div>
        {settings.message && <p className="gn-admin-helper">{settings.message}</p>}
      </>}
    </section>
  );
}
