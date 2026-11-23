import React, {useCallback, useEffect, useState} from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import { downloadPayslipPdf } from "../owner/downloadPayslipPdf";
import "../owner/ProfessionalWorkbench.css";
import "../owner/PayrollDetails.css";

const tz = "Asia/Kolkata";
const localDay = () => new Intl.DateTimeFormat("en-CA", {timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const money = value => `₹${Number(value || 0).toLocaleString("en-IN", {minimumFractionDigits:2,maximumFractionDigits:2})}`;
const net = p => Number(p.basic || 0) + Number(p.allowance || 0) - Number(p.deduction || 0);
const human = text => String(text || "").replaceAll("_", " ");
const notes = note => {
  const match = String(note || "").match(/Payroll snapshot:\s*(\d+)\/(\d+)\s+elapsed calendar days recorded/i);
  return match ? {recorded:Number(match[1]),elapsed:Number(match[2])} : {};
};
export default function EmployeeHR({section}) {
  const { user } = useAuth();
  const [month,setMonth] = useState(localDay().slice(0,7));
  const [state,setState] = useState({rows:[],loading:true,error:""});
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const [selected,setSelected] = useState(null);
  const isAttendance = section === "attendance";
  const load = useCallback(async()=>{
    setState(s=>({...s,loading:true,error:""}));
    try {
      const result = await api(isAttendance?`/staff-workspace/me/attendance?period=${month}`:"/staff-workspace/me/payroll");
      setState({rows:result.rows||[],loading:false,error:""});
    } catch(e){setState({rows:[],loading:false,error:e.message});}
  },[isAttendance,month]);
  useEffect(()=>{load();},[load]);
  async function checkIn(){
    if(saving)return;
    setSaving(true);setMessage("");
    try {await api("/staff-workspace/me/attendance",{method:"POST",body:{workDate:localDay()}});
      setMessage("Today's check-in saved. Project Owner can see it in Attendance.");await load();
    }catch(e){setMessage(e.message);}finally{setSaving(false);}
  }
  const today = localDay();
  const checkedToday = state.rows.some(row=>String(row.workDate).slice(0,10)===today);
  const formatDate = v => v ? String(v).slice(0,10) : "—";
  return <div className="gn-workbench"><section className="gn-surface">
    <header className="gn-work-head"><div><h2>{isAttendance?"My Attendance":"My Salary & Payslips"}</h2>
      <p>{isAttendance?`Self-attested attendance · ${tz} · Project Owner can review and correct records.`:"Owner-generated salary records · draft does not mean paid."}</p></div>
      <button className="btn outline" type="button" onClick={load}>Refresh</button></header>
    {state.error&&<p role="alert" className="gn-work-alert">{state.error}</p>}
    {message&&<p role="status" className="gn-safe-note">{message}</p>}
    {isAttendance ? <>
      <div className="gn-toolbar"><label>Attendance month <input type="month" value={month} onChange={e=>setMonth(e.target.value)} /></label>
      <button className="btn primary" disabled={saving||checkedToday||state.loading||month!==today.slice(0,7)} onClick={checkIn}>
        {saving?"Saving...":checkedToday?"Today's attendance recorded":"Mark present today"}</button></div>
      <p className="gn-safe-note">You can only mark yourself PRESENT for today's India date. Unmarked days are not automatically absences. For leave, half-day or corrections, contact Project Owner.</p>
      {state.loading?<p>Loading attendance...</p>:<div className="gn-table-scroll"><table className="gn-table"><thead><tr><th>Date</th><th>Status</th><th>Record source / note</th></tr></thead><tbody>
      {state.rows.map(r=><tr key={r.id}><td>{formatDate(r.workDate)}</td><td>{human(r.status)}</td><td>{r.note||"—"}</td></tr>)}
      {!state.rows.length&&<tr><td colSpan="3" className="gn-empty">No attendance recorded for this month.</td></tr>}</tbody></table></div>}
    </> : <>
      <p className="gn-safe-note">Payslips appear once Project Owner generates a monthly salary draft. Payment recorded means Owner entered a payment reference; it is not bank verification.</p>
      {state.loading?<p>Loading payroll...</p>:<div className="gn-table-scroll"><table className="gn-table"><thead><tr><th>Pay period</th><th>Basic</th><th>Allowances</th><th>Deductions</th><th>Net payable</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {state.rows.map(p=><tr key={p.id}><td>{p.period}</td><td>{money(p.basic)}</td><td>{money(p.allowance)}</td><td>{money(p.deduction)}</td><td><strong>{money(net(p))}</strong></td><td>{p.status==="PAID"?"Payment recorded":"Draft · Not paid"}</td><td><button type="button" className="btn outline" onClick={()=>setSelected(p)}>View details</button> <button type="button" className="btn outline" onClick={()=>downloadPayslipPdf({payroll:p,employeeName:user?.name||"Employee",attendanceInfo:notes(p.note)})}>Download PDF</button></td></tr>)}
      {!state.rows.length&&<tr><td colSpan="7" className="gn-empty">No payroll generated yet. Ask Project Owner to review attendance and generate the monthly salary draft.</td></tr>}</tbody></table></div>}
      {selected&&<div className="gn-modal-overlay" onMouseDown={e=>e.target===e.currentTarget&&setSelected(null)}><section className="gn-work-modal gn-payroll-payslip" role="dialog" aria-modal="true" aria-label="My payslip details"><header className="gn-work-head"><div><h2>Salary details</h2><p>{selected.period} · {user?.name}</p></div><button className="gn-icon-button" aria-label="Close" onClick={()=>setSelected(null)}>×</button></header><dl className="gn-payroll-breakdown"><div><dt>Basic salary</dt><dd>{money(selected.basic)}</dd></div><div><dt>Allowances</dt><dd>+{money(selected.allowance)}</dd></div><div><dt>Deductions</dt><dd>-{money(selected.deduction)}</dd></div><div><dt>Net payable</dt><dd>{money(net(selected))}</dd></div><div><dt>Status</dt><dd>{selected.status==="PAID"?"Payment recorded":"Draft · Not paid"}</dd></div></dl><p className="gn-safe-note">{selected.status==="PAID"?"Project Owner recorded payment manually. This does not prove bank settlement.":"This salary record is a draft and payment has not been recorded."}</p><p>{selected.note||"No notes recorded"}</p><footer className="gn-modal-footer"><button type="button" className="btn outline" onClick={()=>downloadPayslipPdf({payroll:selected,employeeName:user?.name||"Employee",attendanceInfo:notes(selected.note)})}>Download PDF</button><button type="button" className="btn primary" onClick={()=>setSelected(null)}>Close</button></footer></section></div>}
    </>}
  </section></div>;
}
