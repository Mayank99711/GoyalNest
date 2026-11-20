import "./AdminManagementFixes.css";

import React, { useState } from "react";
import {
  Card,
  Form,
  Pill,
  Empty,
  useRemote,
} from "../../components/UI";
import { api } from "../../lib/api";

export default function PropertyOwners() {
  const {
    data: owners,
    error,
    busy,
    reload,
  } = useRemote("/admin/owners");

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState("");

  const ownerList = Array.isArray(owners) ? owners : [];

  const filteredOwners = ownerList.filter((owner) => {
    const term = search.trim().toLowerCase();

    return (
      owner.name.toLowerCase().includes(term) ||
      owner.email.toLowerCase().includes(term)
    );
  });

  const activeOwners = ownerList.filter(
    (owner) => owner.active
  ).length;

  async function updateOwnerStatus(owner) {
    const nextStatus = !owner.active;

    const confirmed = window.confirm(
      `Are you sure you want to ${
        nextStatus ? "activate" : "deactivate"
      } ${owner.name}?`
    );

    if (!confirmed) return;

    setUpdatingId(owner.id);
    setActionError("");

    try {
      await api(`/admin/owners/${owner.id}/status`, {
        method: "PATCH",
        body: {
          active: nextStatus,
        },
      });

      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="dashboard-grid">
      <div className="stats">
        <div>
          <span>Total Property Owners</span>
          <strong>{ownerList.length}</strong>
        </div>

        <div>
          <span>Active Owners</span>
          <strong>{activeOwners}</strong>
        </div>

        <div>
          <span>Inactive Owners</span>
          <strong>{ownerList.length - activeOwners}</strong>
        </div>
      </div>

      <div className="gn-admin-action-bar"><div><h2>Property Owners</h2><p className="muted">Manage owners and create accounts when needed.</p></div><button type="button" className="btn primary" onClick={()=>setCreateOpen(true)}>+ Create Owner</button></div>
      {createOpen && <div className="gn-admin-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}>
        <section role="dialog" aria-modal="true" aria-labelledby="gn-create-owner-title" className="gn-admin-modal">
          <header className="gn-admin-modal-header"><div><span className="gn-admin-eyebrow">Super Admin</span><h2 id="gn-create-owner-title">Create Property Owner</h2><p className="muted">Email OTP is not required for Super Admin provisioning.</p></div><button type="button" className="btn outline" onClick={()=>setCreateOpen(false)}>Close ×</button></header>
          <Form endpoint="/admin/owners" submit="Create Owner Account" after={()=>{reload();setCreateOpen(false)}} fields={[
            {name:"name",label:"Owner Full Name",required:true},
            {name:"email",label:"Owner Email",type:"email",required:true},
            {name:"phone",label:"Phone Number (Optional)",type:"tel"},
            {name:"password",label:"Temporary Password (Minimum 12 Characters)",type:"password",required:true,minLength:12}
          ]}/>
        </section>
      </div>}

      <Card
        title="Property Owner Directory"
        desc="View, search and manage registered Property Owners."
      >
        <div style={{ marginBottom: "20px" }}>
          <input
            type="search"
            placeholder="Search by owner name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "8px",
            }}
          />
        </div>

        {busy && <p>Loading owners...</p>}

        {error && (
          <p className="error">
            Failed to load owners: {error}
          </p>
        )}

        {actionError && (
          <p className="error">{actionError}</p>
        )}

        {!busy && !error && filteredOwners.length === 0 && (
          <Empty
            text={
              search
                ? "No matching Property Owners found."
                : "No Property Owners registered yet."
            }
          />
        )}

        {!busy && !error && filteredOwners.length > 0 && (
          <div className="record-list">
            {filteredOwners.map((owner) => (
              <div className="record" key={owner.id}>
                <div>
                  <b>{owner.name}</b>

                  <p className="muted">
                    {owner.email}
                  </p>

                  <Pill
                    tone={owner.active ? "success" : "neutral"}
                  >
                    {owner.active ? "Active" : "Inactive"}
                  </Pill>
                </div>

                <div className="button-group">
                  <button
                    type="button"
                    className={
                      "btn " +
                      (owner.active ? "outline" : "primary")
                    }
                    disabled={updatingId === owner.id}
                    onClick={() => updateOwnerStatus(owner)}
                  >
                    {updatingId === owner.id
                      ? "Updating..."
                      : owner.active
                        ? "Deactivate"
                        : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
