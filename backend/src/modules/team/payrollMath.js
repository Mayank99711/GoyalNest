/* Deterministic preview only; never assume unrecorded attendance is absent. */
export function calculatePayrollPreview(employee, period, attendance, allowance=0, manualDeduction=0, now=new Date()){
 const y=Number(period.slice(0,4)),m=Number(period.slice(5,7));
 const calendarDays=new Date(Date.UTC(y,m,0)).getUTCDate();
 const unpaidDays=attendance.reduce((n,a)=>n+(a.status==="ABSENT"||a.status==="UNPAID_LEAVE"?1:a.status==="HALF_DAY"?0.5:0),0);
 const attendanceDeduction=Math.round(employee.basicSalary*unpaidDays/calendarDays);
 const daysRecorded=new Set(attendance.map(a=>new Date(a.workDate).toISOString().slice(0,10))).size;
 const through=now.getUTCFullYear()<y||(now.getUTCFullYear()===y&&now.getUTCMonth()+1<m)?0:now.getUTCFullYear()===y&&now.getUTCMonth()+1===m?Math.min(calendarDays,now.getUTCDate()):calendarDays;
 return {employeeId:employee.id,period,basic:employee.basicSalary,allowance,manualDeduction,attendanceDeduction,deduction:manualDeduction+attendanceDeduction,netPayable:employee.basicSalary+allowance-manualDeduction-attendanceDeduction,unpaidDays,daysRecorded,daysElapsed:through,calendarDays,unrecordedElapsedDays:Math.max(0,through-daysRecorded),attendanceComplete:daysRecorded>=through,calculationBasis:"Calendar-day proration of explicitly recorded ABSENT, UNPAID_LEAVE and HALF_DAY only. Unrecorded days have no automatic deduction; work schedule is not configured."};
}
