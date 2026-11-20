import React,{useState} from 'react';import {Card,Form,DataList,Action,Pill,useRemote} from '../../components/UI';
import PropertyImageUploader from "./PropertyImageUploader";
import "../marketplace/PublicHome.css";
const types=['PG','HOSTEL','APARTMENT','FLAT','COMMERCIAL','SHARED'];
export default function OwnerDashboard(){const [selected,setSelected]=useState(null);const {data:properties,reload}=useRemote('/properties/mine'),{data:plans}=useRemote('/subscriptions/plans'),{data:sub,reload:reloadSub}=useRemote('/subscriptions/mine'),{data:bookings,reload:reloadBookings}=useRemote('/bookings/mine'),{data:team,reload:reloadTeam}=useRemote('/team'),{data:tenancies,reload:reloadTenancies}=useRemote('/tenancies/mine');return <div className="dashboard-grid"><div className="stats"><div><span>Properties</span><strong>{properties?.length||0}</strong></div><div><span>Pending bookings</span><strong>{bookings?.filter(x=>x.status==='PENDING').length||0}</strong></div><div><span>Active tenancies</span><strong>{tenancies?.filter(x=>x.status==='ACTIVE').length||0}</strong></div><div><span>Subscription</span><strong className="small-stat">{sub?.plan||'Inactive'}</strong></div></div><Card title="Your subscription" desc="Current subscription and property listing entitlement.">
  <div className="plan-row" style={{ gap: 16 }}>
    <div className="plan" style={{ flex: '1 1 240px' }}>
      <strong>Current Plan</strong>
      <h2>{sub?.plan || 'No active subscription'}</h2>
      <p>{sub ? `Listing limit: ${sub.listingLimit}` : 'You need an active subscription to submit listings for approval.'}</p>
      <p>{sub?.expiresAt ? `Valid until: ${new Date(sub.expiresAt).toLocaleDateString('en-IN')}` : 'Subscription expiry not available'}</p>
      <a className="btn outline" href="/dashboard/subscriptions">Manage subscription</a>
    </div>
    <div className="plan" style={{ flex: '2 1 350px' }}>
      <strong>Available Plans</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
        {Object.entries(plans || {}).map(([key, plan]) => (
          <div key={key} style={{ flex: '1 1 110px' }}>
            <b>{key}</b>
            <p>₹{Number(plan.price).toLocaleString('en-IN')}/mo</p>
            <p>{plan.limit} listing slots</p>
          </div>
        ))}
      </div>
      <small className="warning">Plan purchase and renewal require a configured payment provider or an authorized Admin update. No money is charged from this screen.</small>
    </div>
  </div>
</Card><div className="two-col"><Card title="Add a property" desc="Create a draft, add a rentable unit, then submit for approval."><Form endpoint="/properties" after={reload} fields={[{name:'title',label:'Property name',required:true},{name:'type',label:'Property type',options:types,required:true},{name:'city',label:'City',required:true},{name:'locality',label:'Locality'},{name:'address',label:'Full address',required:true},{name:'description',label:'Description'},{name:'amenities',label:'Amenities (comma-separated)'},{name:'imageUrl',label:'Image URL (https://)'}]} submit="Create draft"/></Card><Card title="My properties" desc="Select a property to manage rooms and publish it."><DataList items={properties} render={p=><><div><b>{p.title}</b><p className="muted">{p.city} · {p.units.length} units</p><Pill>{p.status}</Pill></div><button className="btn outline" onClick={()=>setSelected(p)}>Manage</button></>}/>{selected&&<div className="nested"><h3>{selected.title} · units</h3><Form endpoint={`/properties/${selected.id}/units`} fields={[{name:'label',label:'Room / Flat number',required:true},{name:'bhk',label:'BHK (flat only)',type:'number'},{name:'capacity',label:'Capacity',type:'number',required:true,min:1},{name:'rent',label:'Monthly rent (INR)',type:'number',required:true,min:1},{name:'depositAmount',label:'Optional deposit amount',type:'number',min:0}]} after={reload} submit="Add unit"/><Action path={`/properties/${selected.id}/submit`} onDone={reload}>Submit for Admin review</Action></div>}
{selected?.id && (
  <PropertyImageUploader
    property={
      (Array.isArray(properties) ? properties : []).find(
        p => p.id === selected.id
      ) || selected
    }
    onUpdated={reload}
  />
)}</Card></div><Card title="Booking requests" desc="Only the Property Owner can approve or reject booking requests."><DataList items={bookings} render={b=><><div><b>{b.tenant?.name} — {b.unit?.property?.title}</b><p className="muted">{b.unit?.label} · Move-in {new Date(b.moveIn).toLocaleDateString()} · {b.wantsDeposit?'With deposit':'Without deposit'}</p><Pill>{b.status}</Pill></div>{b.status==='PENDING'&&<div className="button-group"><Action path={`/bookings/${b.id}/decision`} body={{approve:true}} onDone={reloadBookings} variant="primary">Approve</Action><Action path={`/bookings/${b.id}/decision`} body={{approve:false}} onDone={reloadBookings}>Reject</Action></div>}</>}/></Card><div className="two-col"><Card title="Appoint Property Manager" desc="Only owners may create staff accounts and assign properties."><Form endpoint="/team/appoint" fields={[{name:'propertyId',label:'Assign property',options:(properties||[]).map(p=>({value:p.id,label:p.title})),required:true},{name:'name',label:'Manager full name',required:true},{name:'email',label:'Manager email',type:'email',required:true},{name:'phone',label:'Phone'},{name:'password',label:'Temporary password (10+ chars)',type:'password',required:true}]} after={reloadTeam} submit="Appoint manager"/><DataList items={team} render={x=><><div><b>{x.manager.name}</b><p className="muted">{x.property.title}</p></div><Pill>Assigned</Pill></>}/></Card><Card title="Rent & occupancy" desc="Generate monthly invoices after tenant tenancy activation."><Form endpoint="/rent/generate-month" fields={[{name:'period',label:'Billing period (YYYY-MM)',required:true,placeholder:'2026-12'}]} submit="Generate monthly invoices" after={reloadTenancies}/><h3>Tenancies</h3><DataList items={tenancies} render={t=><><div><b>{t.tenant.name}</b><p className="muted">{t.unit.label} · ₹{t.rent}/mo</p></div><Pill>{t.status}</Pill></>}/></Card></div><Card title="Move-out settlement" desc="Owner approves deposit deductions after inspection."><DataList items={(tenancies||[]).filter(t=>t.moveOut&&t.status==='VACATING')} render={t=><><div><b>{t.tenant.name}</b><p className="muted">Deposit paid: ₹{t.depositPaid} · Inspection: {t.moveOut.inspectionNotes||'Pending'}</p></div><Form endpoint={`/tenancies/${t.id}/settle`} fields={[{name:'deduction',label:'Valid deduction INR',type:'number',min:0,required:true}]} submit="Approve settlement" after={reloadTenancies}/></>}/></Card></div>}
