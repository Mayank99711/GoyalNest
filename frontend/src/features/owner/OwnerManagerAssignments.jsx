import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

/** Assignment management uses the existing owner-guarded /team API. */
export default function OwnerManagerAssignments() {
  const [properties, setProperties] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([api("/properties/mine"), api("/team")]);
      setProperties(Array.isArray(p) ? p : []);
      setAssignments(Array.isArray(a) ? a : []);
      setError("");
    } catch (e) { setError(e.message || "Unable to load assignments"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  const managers = useMemo(() => [...new Map(assignments.map(a => [a.managerId, a.manager]).filter(([id,m]) => id && m)).entries()].map(([id, manager]) => ({id, ...manager})), [assignments]);
  const selected = managers.find(m => m.id === managerId);
  const alreadyAssigned = Boolean(assignments.find(a => a.managerId === managerId && a.propertyId === propertyId));
  async function add(e) {
    e.preventDefault();
    if (!selected || !propertyId || alreadyAssigned || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/team/appoint", { method: "POST", body: {propertyId, name: selected.name, email: selected.email} });
      setNotice(`${selected.name} assigned successfully. Manager can now access the property.`);
      setPropertyId(""); await refresh();
    } catch(e) { setError(e.message || "Assignment failed"); }
    finally { setBusy(false); }
  }
  async function revoke(a) {
    if (!window.confirm(`Remove ${a.manager?.name || "manager"} from ${a.property?.title || "this property"}?`)) return;
    setBusy(true); setNotice(""); setError("");
    try { await api(`/team/assignment/${a.id}`, { method: "DELETE" }); setNotice("Property access revoked."); await refresh(); }
    catch(e) { setError(e.message || "Unable to revoke assignment"); }
    finally { setBusy(false); }
  }
  return <section className="gn-surface" style={{marginBottom:20}} aria-label="Manager property assignments">
    <header className="gn-work-head"><div><h2>Manager Property Assignments</h2><p>Give an existing manager access to another owned property. For new staff, use Create Employee below.</p></div><button className="btn outline" type="button" onClick={refresh} disabled={loading || busy}>Refresh</button></header>
    {notice && <p role="status" style={{color:"#176345"}}>{notice}</p>}
    {error && <p role="alert" className="gn-work-alert">{error}</p>}
    {loading ? <p>Loading property assignments...</p> : <>
      {managers.length === 0 ? <p>No managers assigned yet. Create an employee, select at least one property and save. The manager will then appear here.</p> :
        <form onSubmit={add} style={{display:"flex",gap:12,alignItems:"end",flexWrap:"wrap",margin:"18px 0"}}>
          <label>Existing manager<br/><select required value={managerId} onChange={e=>setManagerId(e.target.value)}><option value="">Select manager</option>{managers.map(m=><option value={m.id} key={m.id}>{m.name} ({m.email})</option>)}</select></label>
          <label>Property to assign<br/><select required value={propertyId} onChange={e=>setPropertyId(e.target.value)}><option value="">Select property</option>{properties.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select></label>
          <button className="btn primary" disabled={!selected || !propertyId || alreadyAssigned || busy}>{busy?"Saving...":alreadyAssigned?"Already assigned":"Assign property"}</button>
        </form>}
      <div className="gn-table-scroll"><table className="gn-table"><thead><tr><th>Manager</th><th>Property</th><th>Action</th></tr></thead><tbody>
        {assignments.map(a=><tr key={a.id}><td>{a.manager?.name}<small>{a.manager?.email}</small></td><td>{a.property?.title}</td><td><button type="button" className="btn outline" disabled={busy} onClick={()=>revoke(a)}>Revoke access</button></td></tr>)}
        {!assignments.length && <tr><td colSpan="3">No manager/property assignments found.</td></tr>}
      </tbody></table></div>
    </>}
  </section>;
}
