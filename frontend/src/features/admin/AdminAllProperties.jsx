import "./AdminManagementFixes.css";
import "./AdminProfessionalWorkspace.css";

import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminAllProperties() {
  const [properties, setProperties] = useState([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await api(
          `/admin-operations/properties?page=${page}` +
          `&status=${encodeURIComponent(status)}` +
          `&search=${encodeURIComponent(query)}`
        );

        if (cancelled) return;

        setProperties(data.properties || []);
        setTotal(data.total || 0);
        setTotalPages(Math.max(1, data.totalPages || 1));
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [page, status, query]);

  return (
    <div className="gn-admin-pro gn-property-workspace">
      <section className="gn-pro-card">
        <div className="gn-pro-eyebrow">INVENTORY / GOVERNANCE</div><h2>All Properties</h2>
        <p className="muted">
          Monitor property listings, ownership and approval status across the platform.
        </p>

        <div className="gn-pro-inventory-overview"><div><small>PROPERTY RECORDS</small><strong>{total}</strong><span>Matching current filters</span></div><div><small>PAGE</small><strong>{page} / {totalPages}</strong><span>Use filters to narrow results</span></div><div><small>LISTING GOVERNANCE</small><strong>Read-only</strong><span>Use Listing Approvals for decisions</span></div></div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search property, city, locality"
            style={{ flex: "1 1 240px", padding: 12 }}
          />

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            style={{ padding: 12 }}
          >
            <option value="">All Statuses</option>
            {[
              "DRAFT",
              "PENDING",
              "PUBLISHED",
              "REJECTED",
              "SUSPENDED",
            ].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <button className="btn primary" type="submit">
            Search
          </button>

          <button
            className="btn outline"
            type="button"
            onClick={() => {
              setSearch("");
              setQuery("");
              setStatus("");
              setPage(1);
            }}
          >
            Reset
          </button>
        </form>

        {error && <p className="error">{error}</p>}
        {loading && <p>Loading properties...</p>}

        <div className="gn-pro-table-meta"><strong>{total} properties</strong><span>Owner, location, units and publication status</span></div>

        <div className="gn-pro-table-wrap">
          <table className="gn-pro-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Owner</th>
                <th>City</th>
                <th>Units</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.title}</strong><small>{p.locality || "Location not specified"}</small></td>
                  <td><strong>{p.owner?.name || "Unknown"}</strong><small>{p.owner?.email || "Owner email unavailable"}</small></td>
                  <td>{p.city}</td>
                  <td>{p.unitCount}</td>
                  <td><span className={`gn-pro-status gn-pro-${String(p.status||"").toLowerCase()}`}>{p.status || "Unknown"}</span></td>
                  <td>
                    <button
                      className="gn-pro-view"
                      type="button"
                      onClick={() => setSelected(p)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && properties.length === 0 && (
          <p className="muted">No properties found.</p>
        )}

        <div style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginTop: 20,
        }}>
          <button
            className="btn outline"
            disabled={loading || page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            className="btn outline"
            disabled={loading || page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
        </div>
      </section>

      {selected && (
        <div className="gn-admin-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}>
          <section className="gn-admin-modal" role="dialog" aria-modal="true" aria-labelledby="gn-property-detail-title">
            <header className="gn-admin-modal-header"><div><span className="gn-admin-eyebrow">Property overview</span><h2 id="gn-property-detail-title">{selected.title}</h2></div><button className="btn outline" type="button" onClick={()=>setSelected(null)}>Close ×</button></header>
            <div className="gn-admin-detail-grid">
              <div><small>Status</small><strong>{selected.status || "Unknown"}</strong></div>
              <div><small>Property category</small><strong>{selected.type || "Not specified"}</strong></div>
              <div><small>Units</small><strong>{selected.unitCount ?? 0}</strong></div>
              <div><small>City / locality</small><strong>{[selected.locality,selected.city].filter(Boolean).join(", ") || "Not specified"}</strong></div>
            </div>
            <div className="gn-admin-detail-section"><h3>Property address</h3><p>{selected.address || "Not specified"}</p></div>
            <div className="gn-admin-detail-section"><h3>Owner</h3><p><strong>{selected.owner?.name || "Unknown"}</strong></p><p>{selected.owner?.email || "Email unavailable"}</p><p>Account: {selected.owner?.active ? "Active" : "Inactive"}</p></div>
            <p className="muted">Review listing decisions under Super Admin → Listing Approvals.</p>
          </section>
        </div>
      )}
    </div>
  );
}
