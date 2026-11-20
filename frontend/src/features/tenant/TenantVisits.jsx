import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Clock3, CheckCircle2, MapPin, ArrowUpRight, Home, BellRing, Search, RefreshCw, CalendarCheck2, Building2, MessageSquareText, ShieldCheck, AlertCircle } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import "./TenantVisitsPro.css";

const ACTIVE = ["REQUESTED", "CONFIRMED"];
const normalize = value => String(value || "").toUpperCase();
const formatDate = value => value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const formatTime = value => value ? new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—";
const formatLocation = p => [p?.locality, p?.city].filter(Boolean).join(", ") || "Location unavailable";
const label = status => ({ REQUESTED: "Pending confirmation", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled", DECLINED: "Declined" }[normalize(status)] || String(status || "Unknown").replaceAll("_", " "));
const dateString = date => { const y = date.getFullYear(); const m = String(date.getMonth()+1).padStart(2,"0"); const d = String(date.getDate()).padStart(2,"0"); return `${y}-${m}-${d}`; };
const times = Array.from({ length: 20 }, (_, index) => { const hour = 9 + Math.floor(index / 2); const minute = index % 2 ? "30" : "00"; const value = `${String(hour).padStart(2, "0")}:${minute}`; return { value, label: new Date(`2026-01-01T${value}:00`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) }; });

function Stat({ icon: Icon, title, value, tone }) {
  return <article className="tvp-stat"><span className={`tvp-stat-icon ${tone}`}><Icon size={22}/></span><div><small>{title}</small><strong>{value}</strong></div></article>;
}

function VisitCard({ visit, owner, busy, onDecision, onCancel, navigate, propertyInfo }) {
  const property = { ...(propertyInfo || {}), ...(visit.property || {}) };
  const status = normalize(visit.status);
  const isFuture = new Date(visit.scheduledAt).getTime() > Date.now();
  const canCancel = !owner && ACTIVE.includes(status) && isFuture;
  const cover = propertyInfo?.imageUrl || propertyInfo?.images?.[0]?.imageUrl;
  return <article className="tvp-visit-card">
    <div className="tvp-property-picture">
      {cover ? <img src={cover} alt={`${property.title || "Property"} exterior`} loading="lazy"/> : <div className="tvp-no-photo"><Building2 size={34}/><span>Property visit</span></div>}
    </div>
    <div className="tvp-visit-main">
      <div className="tvp-visit-name"><h4>{property.title || "Property"}</h4><span className={`tvp-status status-${status.toLowerCase()}`}>{label(status)}</span></div>
      <p className="tvp-muted tvp-location"><MapPin size={14}/>{formatLocation(property)}</p>
      {owner && <p className="tvp-tenant-name">Requested by: <strong>{visit.tenantName || "Tenant"}</strong></p>}
      <div className="tvp-date-row"><span><CalendarDays size={15}/>{formatDate(visit.scheduledAt)}</span><span><Clock3 size={15}/>{formatTime(visit.scheduledAt)}</span></div>
      {visit.note && <p className="tvp-note"><MessageSquareText size={14}/> {visit.note}</p>}
      {!owner && status === "CONFIRMED" && isFuture && <p className="tvp-tip"><CheckCircle2 size={14}/> Your visit is confirmed. Please arrive at the scheduled time.</p>}
    </div>
    <div className="tvp-visit-actions">
      {!owner && <button type="button" className="tvp-btn tvp-btn-solid" onClick={() => navigate(`/properties/${encodeURIComponent(visit.propertyId || property.id)}`)}>View property <ArrowUpRight size={15}/></button>}
      {canCancel && <button type="button" className="tvp-btn tvp-btn-outline" disabled={busy} onClick={() => onCancel(visit)}>Cancel request</button>}
      {owner && status === "REQUESTED" && <><button type="button" className="tvp-btn tvp-btn-solid" disabled={busy} onClick={() => onDecision(visit, "CONFIRMED")}>Confirm</button><button type="button" className="tvp-btn tvp-btn-outline" disabled={busy} onClick={() => onDecision(visit, "DECLINED")}>Decline</button></>}
      {owner && status === "CONFIRMED" && !isFuture && <button type="button" className="tvp-btn tvp-btn-outline" disabled={busy} onClick={() => onDecision(visit, "COMPLETED")}>Mark completed</button>}
    </div>
  </article>;
}

export default function TenantVisits() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const owner = user?.role === "OWNER";
  const [properties, setProperties] = useState([]);
  const [visits, setVisits] = useState([]);
  const [form, setForm] = useState({ propertyId: "", date: "", time: "", note: "" });
  const [tab, setTab] = useState("upcoming");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const [visitData, propertyData] = await Promise.all([
        api("/tenant-portal/visits"),
        owner ? Promise.resolve([]) : api("/properties/public"),
      ]);
      setVisits(Array.isArray(visitData.visits) ? visitData.visits : []);
      setProperties(Array.isArray(propertyData) ? propertyData : Array.isArray(propertyData?.properties) ? propertyData.properties : []);
      setError("");
    } catch (e) { setError(e.message || "Could not load property visits."); }
    finally { if (!quiet) setLoading(false); }
  }, [owner]);
  useEffect(() => { reload(); }, [reload]);

  const now = Date.now();
  const upcoming = useMemo(() => visits.filter(v => ACTIVE.includes(normalize(v.status)) && new Date(v.scheduledAt).getTime() > now), [visits, now]);
  const pending = useMemo(() => visits.filter(v => normalize(v.status) === "REQUESTED"), [visits]);
  const completed = useMemo(() => visits.filter(v => normalize(v.status) === "COMPLETED"), [visits]);
  const past = useMemo(() => visits.filter(v => ["COMPLETED", "DECLINED"].includes(normalize(v.status)) || (ACTIVE.includes(normalize(v.status)) && new Date(v.scheduledAt).getTime() <= now)), [visits, now]);
  const cancelled = useMemo(() => visits.filter(v => normalize(v.status) === "CANCELLED"), [visits]);
  const filtered = tab === "upcoming" ? upcoming : tab === "past" ? past : cancelled;
  const propertyById = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties]);

  async function submit(event) {
    event.preventDefault();
    const scheduledAt = new Date(`${form.date}T${form.time}:00`);
    if (!form.propertyId || !form.date || !form.time || !Number.isFinite(scheduledAt.getTime())) { setError("Select a property, date and time."); return; }
    const at = scheduledAt.getTime();
    if (at < Date.now() + 3600000 || at > Date.now() + 60*86400000) { setError("Choose a slot at least one hour ahead, within the next 60 days."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/tenant-portal/visits", { method: "POST", body: { propertyId: form.propertyId, scheduledAt: scheduledAt.toISOString(), note: form.note.trim() } });
      setNotice(result.message || "Visit requested. Waiting for owner confirmation.");
      setForm({ propertyId: "", date: "", time: "", note: "" });
      setTab("upcoming");
      await reload({ quiet: true });
    } catch (e) { setError(e.message || "Visit request failed."); }
    finally { setBusy(false); }
  }
  async function decide(visit, status) {
    if (status === "CANCELLED" && !window.confirm(`Cancel your visit to ${visit.property?.title || "this property"}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const endpoint = owner ? `/tenant-portal/visits/${encodeURIComponent(visit.id)}/decision` : `/tenant-portal/visits/${encodeURIComponent(visit.id)}/cancel`;
      const result = await api(endpoint, { method: "PATCH", body: owner ? { status } : {} });
      setNotice(result.message || "Visit updated.");
      await reload({ quiet: true });
    } catch (e) { setError(e.message || "Could not update visit."); }
    finally { setBusy(false); }
  }

  return <main className="tvp-page">
    <header className="tvp-header"><div><span className="tvp-eyebrow">{owner ? "OWNER PORTAL / VISIT MANAGEMENT" : "TENANT PORTAL / PROPERTY DISCOVERY"}</span><h2>{owner ? "Property Visit Requests" : "Property Visits"}</h2><p>{owner ? "Confirm requests and manage scheduled property viewings." : "Find a place you love. Schedule a visit and track confirmation in one place."}</p></div><button className="tvp-refresh" type="button" disabled={loading || busy} onClick={() => reload()}><RefreshCw size={16}/> Refresh</button></header>
    {error && <div className="tvp-alert tvp-error" role="alert"><AlertCircle size={18}/>{error}</div>}
    {notice && <div className="tvp-alert tvp-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
    <div className="tvp-stats"><Stat icon={CalendarDays} title="Upcoming visits" value={upcoming.length} tone="green"/><Stat icon={Clock3} title="Pending confirmation" value={pending.length} tone="gold"/><Stat icon={CheckCircle2} title="Completed visits" value={completed.length} tone="green"/></div>
    {!owner && <div className="tvp-compose-grid"><section className="tvp-panel tvp-schedule"><div className="tvp-section-title"><div><span className="tvp-eyebrow">PLAN YOUR VISIT</span><h3>Schedule a Property Visit</h3><p>Request a viewing and get confirmation from the property owner.</p></div></div><form onSubmit={submit} className="tvp-form"><div className="tvp-two-col"><label>Property <span aria-hidden="true">*</span><select required value={form.propertyId} onChange={e=>setForm(p=>({...p, propertyId: e.target.value}))}><option value="">Select a published property</option>{properties.map(p=><option key={p.id} value={p.id}>{p.title} — {p.city}</option>)}</select></label><label>Preferred date <span aria-hidden="true">*</span><input type="date" required min={dateString(new Date())} max={dateString(new Date(Date.now()+60*86400000))} value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></label></div><label>Preferred time <span aria-hidden="true">*</span><select required value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))}><option value="">Select a time slot</option>{times.map(t=><option value={t.value} key={t.value}>{t.label}</option>)}</select></label><label>Message <small>(optional)</small><textarea rows={3} maxLength={500} value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} placeholder="Any specific instructions or questions for the owner..."/></label><p className="tvp-form-hint"><ShieldCheck size={15}/> Request at least 1 hour in advance, within 60 days. The owner must confirm your appointment.</p><button className="tvp-btn tvp-btn-solid tvp-submit" type="submit" disabled={busy || !properties.length}><CalendarCheck2 size={18}/>{busy ? "Submitting request…" : "Request Property Visit"}</button>{!properties.length && !loading && <p className="tvp-muted">No published properties available for visits yet.</p>}</form></section><aside className="tvp-panel tvp-guide"><span className="tvp-eyebrow">SIMPLE & CONVENIENT</span><h3>How visits work</h3><ol><li><span><CalendarDays size={21}/></span><div><strong>1. Request a visit</strong><p>Choose a property and preferred date and time.</p></div></li><li><span><BellRing size={21}/></span><div><strong>2. Get confirmation</strong><p>The Owner reviews your request and confirms availability.</p></div></li><li><span><Home size={21}/></span><div><strong>3. Visit the property</strong><p>Arrive at the scheduled time and explore your future home.</p></div></li></ol><div className="tvp-guide-bottom"><Building2 size={26}/><p>Your next home is worth seeing in person.</p></div></aside></div>}
    <section className="tvp-panel tvp-history"><div className="tvp-section-title"><div><span className="tvp-eyebrow">YOUR APPOINTMENTS</span><h3>{owner ? "Property Visit Requests" : "My Visit Requests"}</h3><p>{owner ? "Track and respond to visit requests." : "Manage upcoming visits and review your past requests."}</p></div></div><div className="tvp-tabs" role="group" aria-label="Filter property visits"><button type="button" className={tab==="upcoming"?"active":""} onClick={()=>setTab("upcoming")}>Upcoming ({upcoming.length})</button><button type="button" className={tab==="past"?"active":""} onClick={()=>setTab("past")}>Past ({past.length})</button><button type="button" className={tab==="cancelled"?"active":""} onClick={()=>setTab("cancelled")}>Cancelled ({cancelled.length})</button></div>{loading ? <div className="tvp-empty" role="status">Loading your property visits…</div> : !filtered.length ? <div className="tvp-empty"><Search size={28}/><strong>{tab==="upcoming"?"No upcoming visits":"No visits in this category"}</strong><p>{tab==="upcoming"?"Your scheduled viewing requests will appear here.":"Visit records will appear here once available."}</p></div> : <div className="tvp-list">{[...filtered].sort((a,b)=>new Date(b.scheduledAt)-new Date(a.scheduledAt)).map(v=><VisitCard key={v.id} visit={v} owner={owner} busy={busy} propertyInfo={propertyById.get(v.propertyId)} onCancel={item=>decide(item,"CANCELLED")} onDecision={decide} navigate={navigate}/>)}</div>}</section>
  </main>;
}
