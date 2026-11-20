
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminOperations() {
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      try {
        const [summary, userData] = await Promise.all([
          api("/admin-operations/overview"),
          api(
            `/admin-operations/users?page=${page}&role=${role}`
          ),
        ]);

        if (!active) return;

        setOverview(summary);
        setUsers(userData.users || []);
        setTotalPages(userData.totalPages || 1);
        setError("");
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [page, role]);

  const stats = overview
    ? [
        ["Total Users", overview.users.total],
        ["Owners", overview.users.owners],
        ["Tenants", overview.users.tenants],
        ["Managers", overview.users.managers],
        ["Total Properties", overview.properties.total],
        ["Pending Approvals", overview.properties.pending],
        ["Published Properties", overview.properties.published],
        ["Total Bookings", overview.bookings.total],
        ["Total Tenancies", overview.tenancies.total],
        ["Active Tenancies", overview.tenancies.active],
        ["Rent Invoices", overview.invoices.total],
        ["Paid Invoices", overview.invoices.paid],
      ]
    : [];

  return (
    <div className="dashboard-grid">
      <section className="card" style={{ padding: 24 }}>
        <h2>Platform Operations Overview</h2>

        {error && <p className="error">{error}</p>}
        {loading && <p>Loading admin data...</p>}

        {overview && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(155px, 1fr))",
              gap: 14,
              marginTop: 20,
            }}
          >
            {stats.map(([label, value]) => (
              <div
                key={label}
                style={{
                  padding: 16,
                  border: "1px solid #ddd",
                  borderRadius: 12,
                }}
              >
                <p className="muted">{label}</p>
                <h2>{value}</h2>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ padding: 24 }}>
        <h2>User Management</h2>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="admin-role-filter">
            Filter by Role
          </label>

          <select
            id="admin-role-filter"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            style={{ marginLeft: 12, padding: 10 }}
          >
            <option value="">All Users</option>
            <option value="OWNER">Owners</option>
            <option value="TENANT">Tenants</option>
            <option value="MANAGER">Managers</option>
            <option value="ADMIN">Admins</option>
          </select>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>
                    {new Date(user.createdAt)
                      .toLocaleDateString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            marginTop: 18,
          }}
        >
          <button
            className="btn outline"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>

          <span>
            Page {page} of {totalPages}
          </span>

          <button
            className="btn outline"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
