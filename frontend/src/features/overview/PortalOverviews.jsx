import React,{useEffect,useState,useRef} from "react";
import {getSessionActivity,subscribeActivity} from "../../lib/activityFeedback";
import { Link } from "react-router-dom";
import { getRentalStage } from "../tenant/TenantJourney";
import "./TenantDashboardV6.css";

import { useNavigate } from "react-router-dom";
import { useRemote } from "../../components/UI";
import "./PortalOverviews.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not set";
const array = (value) => Array.isArray(value) ? value : [];

function Tile({ label, value, note, to }) {
  const content = <><span>{label}</span><strong>{value ?? "—"}</strong>{note && <small>{note}</small>}</>;
  return to ? <Link className="gnov-tile gnov-tile-link" to={`/dashboard/${to}`}>{content}</Link> : <div className="gnov-tile">{content}</div>;
}
function Panel({ heading, subtitle, children }) {
  return <section className="gnov-panel"><h3>{heading}</h3>{subtitle && <p className="gnov-hint">{subtitle}</p>}{children}</section>;
}
function LinkItem({ to, title, description, navigate }) {
  return <button type="button" className="gnov-action" onClick={() => navigate(`/dashboard/${to}`)}><span><strong>{title}</strong><small>{description}</small></span><span aria-hidden="true">↗</span></button>;
}
function OverviewShell({ title, description, tiles, tasks, links, loading, error, notices=[], noticesLoading=false, onRefresh, journey }) {
  const navigate = useNavigate();
  const refreshRef=useRef(onRefresh);
  useEffect(()=>{refreshRef.current=onRefresh;},[onRefresh]);
  useEffect(()=>{const id=window.setInterval(()=>{if(!document.hidden)refreshRef.current?.();},60000);return ()=>window.clearInterval(id);},[]);
  const [recent,setRecent]=useState(getSessionActivity);
  useEffect(()=>subscribeActivity(()=>setRecent(getSessionActivity())),[]);
  const actionable = tasks.filter(Boolean).slice(0,8);
  const unread = notices.filter(n=>!n.readAt);
  return <main className="gnov-root">{journey}
    <header className="gnov-hero">
      <div><span className="gnov-kicker">GOYALNEST / WORKSPACE</span><h2>{title}</h2><p>{description}</p></div>
      <button type="button" className="gnov-refresh" disabled={loading} onClick={onRefresh} aria-label="Refresh dashboard data">{loading?"Refreshing…":"↻ Refresh dashboard"}</button>
    </header>
    {error && <div className="gnov-error" role="alert">Some data could not be loaded: {error}. Items may be incomplete; check the relevant module.</div>}
    <section className="gnov-tiles" aria-label="Live workspace metrics">{tiles.map(tile=><Tile key={tile.label} {...tile} />)}</section>
    <div className="gnov-attention-bar" role="status"><span className="gnov-attention-icon" aria-hidden="true">{actionable.length?"!":"✓"}</span><div><strong>{loading?"Checking your workspace":actionable.length?`${actionable.length} item${actionable.length===1?"":"s"} to review`:"No pending items found"}</strong><small>{actionable.length?"Review pending work below. Counts are from available records, not a complete organization audit.":error?"Some module data failed to load. This status may be incomplete.":"No pending items in the dashboard modules checked; other workflows may still need attention."}</small></div><span className="gnov-live-dot">API DATA</span></div>
    <div className="gnov-layout">
      <Panel heading="Action center" subtitle="Approvals, renewals and work requiring attention">
        {actionable.length > 0 && <button type="button" className="gnov-inline-link" onClick={() => navigate(`/dashboard/${actionable[0].to}`)} aria-label="Open first pending action">Open first pending action ↗</button>}
        {loading ? <p className="gnov-muted">Loading current records…</p> : actionable.length ? <div className="gnov-tasklist">{actionable.map((task,i)=><button key={`${task.to}-${task.title}-${i}`} type="button" onClick={()=>navigate(`/dashboard/${task.to}`)} className="gnov-task"><span className="gnov-task-mark" aria-hidden="true">{i+1}</span><span className="gnov-task-copy"><strong>{task.title}</strong><small>{task.note}</small></span><span className="gnov-status">{task.status||"Review"}</span><span className="gnov-chevron" aria-hidden="true">›</span></button>)}</div> : <div className="gnov-empty">No actionable work from the available records.</div>}
      </Panel>
      <div className="gnov-side-stack">
        <Panel heading="Notifications" subtitle="Personal messages saved by the platform">
          {noticesLoading?<p className="gnov-muted">Loading notifications…</p>:notices.length?<div className="gnov-notice-list">{notices.slice(0,4).map(n=><div key={n.id} className={`gnov-notice ${!n.readAt?"is-unread":""}`}><strong>{n.title||"Notification"}</strong><p>{n.message||"View your notifications for details."}</p><small>{date(n.createdAt)}</small></div>)}</div>:<div className="gnov-empty">No personal notifications recorded.</div>}
          <button type="button" className="gnov-inline-link" onClick={()=>navigate('/dashboard/notifications')}>View notification inbox {unread.length?`(${unread.length} unread shown)`:""} ↗</button>
        </Panel>
        <Panel heading="Quick actions" subtitle="Jump to your workspace tools"><div className="gnov-actions">{links.slice(0,6).map(link=><LinkItem key={link.to} {...link} navigate={navigate}/>)}</div></Panel>
      </div>
    </div>
    <section className="gnov-panel gnov-session-activity" aria-label="Recent actions this browser session">
      <div className="gnov-session-heading"><div><h3>Recent actions</h3><p className="gnov-hint">Only actions captured in this browser session. This is not the permanent audit log.</p></div><span className="gnov-session-label">THIS SESSION</span></div>
      {recent.length?<ul>{recent.slice(0,5).map(x=><li key={x.id}><span className={x.type==="error"?"gnov-activity-error":"gnov-activity-success"}>{x.type==="error"?"!":"✓"}</span><span>{x.message}</span><time dateTime={x.at}>{new Date(x.at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</time></li>)}</ul>:<div className="gnov-empty">No completed actions captured in this session.</div>}
    </section>
  </main>;
}
function AdminOverview() {
  const summary=useRemote('/admin/summary');
  const properties=useRemote('/admin/properties');
  const subscriptions=useRemote('/admin-subscriptions?page=1');
  const notifications=useRemote('/user-notifications');
  const kyc=useRemote('/admin-operations/kyc/pending-summary');
  const pendingKyc=Number(kyc.data?.pending||0);
  const s=summary.data||{};
  const waiting=array(properties.data).filter(p=>p.status==='PENDING');
  const records=array(subscriptions.data?.subscriptions);
  const now=Date.now();
  const expiring=records.filter(r=>r.status==='ACTIVE' && r.expiresAt && new Date(r.expiresAt).getTime()-now<=7*86400000);
  const expired=records.filter(r=>r.status==='EXPIRED');
  const tasks=[...(pendingKyc?[{title:`${pendingKyc} tenant KYC document${pendingKyc===1?'':'s'} awaiting verification`,note:'Review identity documents and take a decision',status:'KYC review',to:'agreements#gn-kyc-review'}]:[]),...waiting.map(p=>({title:p.title||'Property listing needs approval',note:`${p.city||'Location unavailable'} · Listing awaiting review`,status:'Approval',to:'approvals'})),
    ...expiring.map(r=>({title:`${r.owner?.name||'Owner'} · subscription expiring`,note:`${r.plan} · expires ${date(r.expiresAt)}`,status:'Renewal',to:'subscriptions'})),
    ...expired.map(r=>({title:`${r.owner?.name||'Owner'} · subscription expired`,note:`${r.plan} · expired ${date(r.expiresAt)}`,status:'Expired',to:'subscriptions'}))];
  const refresh=()=>[summary,properties,subscriptions,notifications,kyc].forEach(x=>x.reload());
  return <OverviewShell title="Platform command center" description="Monitor listing approvals, owner subscriptions and platform operations from one place." loading={summary.busy||properties.busy||subscriptions.busy||kyc.busy} error={summary.error||properties.error||subscriptions.error||kyc.error} onRefresh={refresh} notices={array(notifications.data?.notifications)} noticesLoading={notifications.busy}
    tiles={[{label:'Property owners',value:s.owners,to:'owners',note:'Registered owner accounts'},{label:'Properties',value:s.properties,to:'properties',note:'Platform-wide inventory'},{label:'Pending KYC',value:kyc.busy?'—':pendingKyc,to:'agreements#gn-kyc-review',note:'Identity verification required'},{label:'Subscriptions',value:subscriptions.data?.total??'—',to:'subscriptions',note:'Total records; not confirmed payments'}]}
    tasks={tasks} links={[{to:'agreements#gn-kyc-review',title:'Review tenant KYC',description:'Verify or reject pending identity documents'},{to:'approvals',title:'Listing approvals',description:'Review pending property submissions'},{to:'subscriptions',title:'Subscriptions & plans',description:'Check owner plan records and expiry'},{to:'owners',title:'Property owners',description:'Create and manage owner accounts'},{to:'properties',title:'All properties',description:'Inspect platform inventory'},{to:'payments',title:'Payments & transactions',description:'Verify actual gateway outcomes'},{to:'reports',title:'Reports & analytics',description:'View operational reporting'}]}/>;
}
function OwnerOverview() {
  const props=useRemote('/properties/mine');
  const bookings=useRemote('/bookings/mine');
  const tenancies=useRemote('/tenancies/mine');
  const subscription=useRemote('/subscriptions/mine');
  const notifications=useRemote('/user-notifications');
  const pending=array(bookings.data).filter(b=>b.status==='PENDING');
  const active=array(tenancies.data).filter(t=>t.status==='ACTIVE');
  const pendingListings=array(props.data).filter(p=>['PENDING','PENDING_APPROVAL'].includes(p.status));
  const sub=subscription.data;
  const subscriptionExpired=Boolean(sub?.expiresAt&&new Date(sub.expiresAt).getTime()<Date.now());
  const subscriptionSoon=Boolean(sub?.expiresAt&&!subscriptionExpired&&new Date(sub.expiresAt).getTime()-Date.now()<7*86400000);
  const items=[...pending.map(b=>({title:`${b.tenant?.name||'Tenant'} · booking request`,note:`${b.unit?.property?.title||'Property'} · ${b.unit?.label||'Unit'}`,status:'Approve',to:'bookings'})),
    ...pendingListings.map(p=>({title:p.title||'Property awaiting review',note:'Listing has not been published yet',status:'Pending',to:'properties'}))];
  if(!sub||subscriptionExpired||subscriptionSoon)items.push({title:subscriptionExpired?'Subscription expired':subscriptionSoon?'Subscription renewal approaching':'Subscription needs review',note:sub?.expiresAt?`Plan ${sub.plan||'—'} · expires ${date(sub.expiresAt)}`:'No current plan found. Verify subscription and checkout status.',status:'Review',to:'subscriptions'});
  const refresh=()=>[props,bookings,tenancies,subscription,notifications].forEach(x=>x.reload());
  return <OverviewShell title="Property owner workspace" description="Bookings, property approvals, renewals and tenant operations in one clear view." loading={props.busy||bookings.busy||tenancies.busy||subscription.busy} error={props.error||bookings.error||tenancies.error||subscription.error} onRefresh={refresh} notices={array(notifications.data?.notifications)} noticesLoading={notifications.busy}
    tiles={[{label:'My properties',value:array(props.data).length,to:'properties',note:'Manage listings and rooms'},{label:'Pending bookings',value:pending.length,to:'bookings',note:'Awaiting your decision'},{label:'Active tenancies',value:active.length,to:'tenants',note:'Recorded active stays'},{label:'My subscription',value:sub?.plan||'Not found',to:'subscriptions',note:sub?.expiresAt?`Expires ${date(sub.expiresAt)}`:'Check plan status'}]}
    tasks={items} links={[{to:'bookings',title:'Booking approvals',description:'Review and decide tenant requests'},{to:'properties',title:'Manage properties',description:'Update listing details and photos'},{to:'employees',title:'Manager assignments',description:'Assign properties and employee access'},{to:'tenants',title:'Tenant management',description:'Review active tenancies'},{to:'subscriptions',title:'Subscriptions',description:'View plan and checkout history'},{to:'rent',title:'Rent & invoices',description:'Review outstanding collections'}]}/>;
}
function TenantOverview() {
  const bookings = useRemote("/bookings/mine");
  const tenancies = useRemote("/tenancies/mine");
  const maintenance = useRemote("/maintenance");
  const billing = useRemote("/payment-center/overview");
  const notifications = useRemote("/user-notifications");
  const stays = array(tenancies.data);
  const allBookings = [...array(bookings.data)].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  const current = allBookings.find(b => b.tenancy?.status === "ACTIVE" || b.tenancy?.status === "VACATING" || (b.tenancy?.checkInAt && !b.tenancy?.checkOutAt))
    || allBookings.find(b => ["PENDING", "APPROVED"].includes(b.status) && !["VACATED", "CANCELLED"].includes(b.tenancy?.status))
    || allBookings[0];
  const stage = current ? getRentalStage(current) : null;
  const duesFromTenancy = stays.flatMap(t => array(t.invoices).filter(i => ["PENDING","OVERDUE"].includes(i.status)).map(i=>({...i,propertyName:t.unit?.property?.title||"Your property"})));
  const due = Array.isArray(billing.data?.invoices)
    ? billing.data.invoices.filter(i => ["PENDING","OVERDUE"].includes(i.status) && Number(i.outstanding) > 0).map(i=>({...i,propertyName:i.property||"Your property"}))
    : duesFromTenancy;
  const openTickets = array(maintenance.data).filter(t=>!["RESOLVED", "CLOSED"].includes(t.status));
  const noticeItems = array(notifications.data?.notifications).slice(0,3);
  const loading = bookings.busy || tenancies.busy || maintenance.busy;
  const problem = bookings.error || tenancies.error || maintenance.error;
  const tiles = [
    {label:"My bookings",value:allBookings.length,to:"bookings",icon:"▣"},
    {label:"Active stays",value:stays.filter(t=>t.status==="ACTIVE").length,to:"tenancy",icon:"⌂"},
    {label:"Unpaid invoices",value:due.length,to:"rent",icon:"₹"},
    {label:"Open maintenance",value:openTickets.length,to:"maintenance",icon:"⚒"}
  ];
  return <main className="gntv-root">
    <header className="gntv-head"><div><span className="gntv-kicker">GOYALNEST / TENANT PORTAL</span><h2>Your living dashboard</h2><p>Booking progress, payments and everything you need for your stay.</p></div><Link className="gntv-primary" to="/dashboard/explore">Find a property ↗</Link></header>
    {problem && <p className="gntv-error" role="alert">Some dashboard records could not load: {problem}</p>}
    <section className="gntv-highlight" aria-label="Current booking status">
      <div className="gntv-highlight-main"><span className="gntv-kicker">YOUR BOOKING STATUS</span><h3>{current ? (current.unit?.property?.title || "Your property") : "Ready to find your place?"}</h3><p>{current ? `${current.unit?.label||"Room"} · Move-in ${date(current.moveIn)}` : "Browse verified listings and submit a booking request from the property details page."}</p></div>
      {stage ? <div className="gntv-highlight-stage"><span className={`gntv-stage gntv-${stage.tone}`}>{stage.label}</span><strong>{stage.title}</strong><p>{stage.description}</p><Link className="gntv-primary" to={`/dashboard/${stage.to}`}>{stage.action} →</Link></div> : <Link className="gntv-primary" to="/dashboard/explore">Explore available homes →</Link>}
    </section>
    <section className="gntv-statgrid" aria-label="Tenant summary">{tiles.map(tile=><Link key={tile.label} className="gntv-stat" to={`/dashboard/${tile.to}`}><span>{tile.label}</span><strong>{loading?"—":tile.value}</strong><small>View details ↗</small></Link>)}</section>
    <div className="gntv-columns"><section className="gntv-panel"><header><div><h3>Booking updates</h3><p>Latest requests and owner decisions</p></div><Link to="/dashboard/bookings">View all</Link></header>
      {bookings.busy ? <p>Loading your bookings…</p> : !allBookings.length ? <div className="gntv-empty">No booking activity yet. <Link to="/dashboard/explore">Explore properties</Link></div> : <ul className="gntv-updates">{allBookings.slice(0,4).map(b=>{const info=getRentalStage(b);return <li key={b.id}><div><strong>{b.unit?.property?.title||"Property"}</strong><span>{b.unit?.label||"Unit"} · {date(b.createdAt)}</span></div><div><span className={`gntv-stage gntv-${info.tone}`}>{info.label}</span><Link to="/dashboard/bookings">View booking →</Link></div></li>})}</ul>}
    </section><section className="gntv-panel"><header><div><h3>Payments requiring attention</h3><p>Open invoices from your current stays</p></div><Link to="/dashboard/rent">All payments</Link></header>
      {!due.length?<div className="gntv-empty">No outstanding invoices from your stays.</div>:<ul className="gntv-dues">{due.slice(0,3).map(i=><li key={i.id}><div><strong>{i.propertyName}</strong><span>{i.period||"Rent invoice"} · {i.status}</span></div><div><b>{money(i.outstanding !== undefined ? i.outstanding : Number(i.amount||0)+Number(i.penalty||0))}</b><Link to="/dashboard/rent">Review invoice →</Link></div></li>)}</ul>}
      <div className="gntv-notices"><h4>Recent notifications</h4>{noticeItems.length?noticeItems.map(n=><div key={n.id}><strong>{n.title}</strong><span>{n.message}</span></div>):<p>{notifications.busy?"Loading notifications…":"No recent personal notifications."}</p>}<Link to="/dashboard/notifications">Notification inbox →</Link></div>
    </section></div>
    <section className="gntv-panel"><header><div><h3>Quick access</h3><p>Jump directly to an existing workspace</p></div></header><div className="gntv-shortcuts">{[["Explore properties","explore"],["My bookings","bookings"],["Rent & payments","rent"],["KYC & documents","kyc"],["Property visits","visits"],["Maintenance","maintenance"]].map(([label,to])=><Link key={to} to={`/dashboard/${to}`}>{label}<span>↗</span></Link>)}</div></section>
  </main>;
}
function ManagerOverview() {
  const properties=useRemote('/manager-portal/summary');
  const checkins=useRemote('/manager-portal/checkins');
  const maintenance=useRemote('/maintenance');
  const notifications=useRemote('/user-notifications');
  const checkinRecords=array(checkins.data);
  const waiting=checkinRecords.filter(t=>t.status==='ACTIVE'&&!t.checkInAt);
  const checkedIn=checkinRecords.filter(t=>Boolean(t.checkInAt)&&!t.checkOutAt);
  const open=array(maintenance.data).filter(t=>!['RESOLVED','CLOSED'].includes(t.status));
  const tasks=[...waiting.map(t=>({title:`${t.tenant?.name||'Tenant'} · arrival verification`,note:`${t.unit?.property?.title||'Property'} · ${t.unit?.label||'Room'}`,status:'Check-in',to:'checkin'})),
    ...open.map(t=>({title:t.title||'Maintenance requires attention',note:t.tenancy?.unit?.property?.title||t.description||'Open service ticket',status:t.status||'Open',to:'maintenance'}))];
  const refresh=()=>[properties,checkins,maintenance,notifications].forEach(x=>x.reload());
  return <OverviewShell title="Property operations hub" description="Physical move-ins, assigned properties and maintenance work—all in one place." loading={properties.busy||checkins.busy||maintenance.busy} error={properties.error||checkins.error||maintenance.error} onRefresh={refresh} notices={array(notifications.data?.notifications)} noticesLoading={notifications.busy}
    tiles={[{label:'Assigned properties',value:properties.data?.summary?.assignedProperties??'—',to:'properties',note:'Your authorized locations'},{label:'Awaiting check-in',value:waiting.length,to:'checkin',note:'Arrival verification required'},{label:'Checked-in tenants',value:checkedIn.length,to:'checkin',note:'Physically confirmed'},{label:'Open maintenance',value:open.length,to:'maintenance',note:'Requires operational action'}]}
    tasks={tasks} links={[{to:'checkin',title:'Check-in / check-out',description:'Verify tenant arrivals and departures'},{to:'properties',title:'Assigned properties',description:'View permitted property locations'},{to:'occupancy',title:'Rooms & occupancy',description:'Monitor unit utilization'},{to:'maintenance',title:'Maintenance tickets',description:'Track repairs and service updates'},{to:'tenants',title:'Tenant records',description:'Review on-site tenants'},{to:'reports',title:'Daily reports',description:'Review operational records'}]}/>;
}

function StaffOverview({designation}) {
  const properties = useRemote('/staff-workspace');
  const notifications = useRemote('/user-notifications');
  return <OverviewShell
    title={`${designation} workspace`}
    description="Access the read-only modules your Project Owner has assigned to you."
    loading={properties.busy}
    error={properties.error}
    onRefresh={()=>{properties.reload();notifications.reload();}}
    notices={array(notifications.data?.notifications)}
    noticesLoading={notifications.busy}
    tiles={[{label:'Assigned properties',value:properties.data?.assignedProperties??'—',note:'Assigned locations only'}]}
    tasks={[]}
    links={[]}
  />;
}

export default function PortalOverviews({ role, limitedStaff=false, designation="Staff" }) {
  if (role === "ADMIN") return <AdminOverview />;
  if (role === "OWNER") return <OwnerOverview />;
  if (role === "TENANT") return <TenantOverview />;
  if (role === "MANAGER") return limitedStaff ? <StaffOverview designation={designation} /> : <ManagerOverview />;
  return null;
}
