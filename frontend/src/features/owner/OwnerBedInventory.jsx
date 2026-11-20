import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import './OwnerBedInventory.css';

export default function OwnerBedInventory({ unit, onClose }) {
  const [data, setData] = useState(null);
  const [label, setLabel] = useState('');
  const [selections, setSelections] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const endpoint = `/owner-beds/units/${encodeURIComponent(unit.id)}/beds`;
  async function load() {
    try {
      const result = await api(endpoint);
      setData(result);
      setError('');
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, [unit.id]);
  async function act(path, method = 'POST', body) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await api(path, { method, ...(body ? { body } : {}) });
      setNotice('Changes saved.');
      setLabel('');
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const beds = data?.beds || [];
  const tenants = data?.unassignedTenancies || [];
  return (
    <div className="obi-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <section className="obi-panel" role="dialog" aria-modal="true" aria-label={`Manage beds for ${unit.label}`}>
        <header className="obi-header">
          <div><h3>Bed Inventory — {unit.label}</h3><p>Physical beds and allocations for this unit (capacity: {unit.capacity})</p></div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="obi-body">
          {error && <p className="obi-error" role="alert">{error}</p>}
          {notice && <p className="obi-success" role="status">{notice}</p>}
          <form onSubmit={e => { e.preventDefault(); act(endpoint, 'POST', { label: label.trim() }); }} className="obi-create">
            <label htmlFor="obi-new-bed">New bed label</label>
            <input id="obi-new-bed" value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder="e.g., Bed A" required />
            <button disabled={busy || !label.trim() || beds.filter(b => b.active).length >= unit.capacity}>+ Add Bed</button>
          </form>
          <p className="obi-note">Existing tenants are not automatically assigned. Select a tenancy for each physical bed; this does not alter rent or booking status.</p>
          {!data && !error && <p>Loading beds...</p>}
          {!beds.length && data && <p>No beds configured yet.</p>}
          {beds.map(bed => (
            <article key={bed.id} className="obi-bed">
              <div><strong>{bed.label}</strong><small>{bed.active ? 'Active' : 'Inactive'} · {bed.tenancy ? `Assigned: ${bed.tenancy.tenant.name}` : 'Unassigned'}</small></div>
              {bed.tenancy ? (
                <button type="button" disabled={busy} onClick={() => act(`/owner-beds/beds/${bed.id}/unassign`)}>Unassign</button>
              ) : (
                <div className="obi-assign">
                  {bed.active && <><select aria-label={`Assign ${bed.label}`} value={selections[bed.id] || ''} onChange={e => setSelections(x => ({...x, [bed.id]:e.target.value}))}>
                    <option value="">Select tenant tenancy</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.tenant.name} ({t.status})</option>)}
                  </select>
                  <button type="button" disabled={busy || !selections[bed.id]} onClick={() => act(`/owner-beds/beds/${bed.id}/assign`, 'POST', { tenancyId: selections[bed.id] })}>Assign</button></>}
                  <button type="button" disabled={busy} onClick={() => act(`/owner-beds/beds/${bed.id}`, 'PATCH', { active: !bed.active })}>{bed.active ? 'Deactivate' : 'Activate'}</button>
                </div>
              )}
            </article>
          ))}
        </div>
        <footer className="obi-footer"><button onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}
