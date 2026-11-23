import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

const sections = {
  properties: "Assigned Properties", rooms: "Rooms & Occupancy", bookings: "Bookings",
  tenants: "Tenant Records", maintenance: "Maintenance Tickets",
  payments: "Payments", reports: "Reports",
};
const pretty = text => String(text).replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
const value = item => item === null || item === undefined ? "—" : typeof item === "object" ? Object.values(item).map(value).join(" / ") : String(item);
export default function StaffWorkspace({ section }) {
  const [state, setState] = useState({ rows: [], loading: true, error: "" });
  useEffect(() => {
    let alive = true;
    setState({ rows: [], loading: true, error: "" });
    api(`/staff-workspace/${section}`).then(data => {
      if (alive) setState({ rows: data.rows || [], loading: false, error: "" });
    }).catch(error => {
      if (alive) setState({ rows: [], loading: false, error: error.message });
    });
    return () => { alive = false; };
  }, [section]);
  const rows = state.rows;
  // Display server-selected columns only; no mutation controls for .view rights.
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return <main className="gnov-root">
    <h2>{sections[section] || "Employee workspace"}</h2>
    <p>Assigned-property records · View-only access</p>
    {state.loading ? <p>Loading records…</p> : state.error ?
      <p role="alert" style={{ color: "#bb4433" }}>{state.error}</p> :
      !rows.length ? <p>No records found for your assigned properties.</p> :
      <div style={{ overflowX: "auto", background: "white", padding: "1rem", borderRadius: 12 }}>
        <table className="gn-table"><thead><tr>{columns.map(c => <th key={c}>{pretty(c)}</th>)}</tr></thead>
          <tbody>{rows.map((row, i) => <tr key={row.id || i}>{columns.map(c => <td key={c}>{value(row[c])}</td>)}</tr>)}</tbody>
        </table>
      </div>}
  </main>;
}
