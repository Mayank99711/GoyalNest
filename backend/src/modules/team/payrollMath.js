/* Deterministic preview only; never assume unrecorded attendance is absent. */
export function calculatePayrollPreview(employee, period, attendance, allowance=0, manualDeduction=0, now=new Date(), mode="FIXED_MONTHLY"){
 const y=Number(period.slice(0,4)),m=Number(period.slice(5,7));
 const calendarDays=new Date(Date.UTC(y,m,0)).getUTCDate();
 const unpaidDays=attendance.reduce((n,a)=>n+(a.status==="ABSENT"||a.status==="UNPAID_LEAVE"?1:a.status==="HALF_DAY"?0.5:0),0);
 // Payable-day proration is opt-in per payroll draft. Unrecorded days are not
 // classified as absent; they are simply not credited in this selected mode.
 const payableDays=attendance.reduce((n,a)=>n+(["PRESENT","PAID_LEAVE","HOLIDAY"].includes(a.status)?1:a.status==="HALF_DAY"?0.5:0),0);
 const recordedDayDeduction=Math.round(employee.basicSalary*(calendarDays-payableDays)/calendarDays);
 const attendanceDeduction=mode==="RECORDED_PAID_DAYS"?recordedDayDeduction:Math.round(employee.basicSalary*unpaidDays/calendarDays);
 const daysRecorded=new Set(attendance.map(a=>new Date(a.workDate).toISOString().slice(0,10))).size;
 const through=now.getUTCFullYear()<y||(now.getUTCFullYear()===y&&now.getUTCMonth()+1<m)?0:now.getUTCFullYear()===y&&now.getUTCMonth()+1===m?Math.min(calendarDays,now.getUTCDate()):calendarDays;
 return {employeeId:employee.id,period,basic:employee.basicSalary,allowance,manualDeduction,attendanceDeduction,deduction:manualDeduction+attendanceDeduction,netPayable:employee.basicSalary+allowance-manualDeduction-attendanceDeduction,unpaidDays,payableDays,mode,daysRecorded,daysElapsed:through,calendarDays,unrecordedElapsedDays:Math.max(0,through-daysRecorded),attendanceComplete:daysRecorded>=through,calculationBasis:mode==="RECORDED_PAID_DAYS"?"Owner-selected recorded paid days / calendar days. Unrecorded days are excluded from credited days, not marked ABSENT. Confirm policy and paid weekly-off/holiday records.":"Fixed monthly basic less explicitly recorded unpaid days only; missing days are not automatically deducted."};
}
