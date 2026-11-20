/* Synthetic calendar-day attendance for November 2026; intentionally no real employee data. */
export const demoPeriod = '2026-11';
export const demoEmail = 'payroll-nov-2026-demo@goyalnest.invalid';
export const demoSalary = 20000;
export function demoAttendance(){
  return Array.from({length:19},(_,i)=>{
    const day=i+1;
    const status=day===3?'ABSENT':day===8?'HALF_DAY':day===13?'UNPAID_LEAVE':day===16?'PAID_LEAVE':day===18?'HOLIDAY':'PRESENT';
    return {workDate:new Date(`2026-11-${String(day).padStart(2,'0')}T00:00:00.000Z`),status,note:'GoyalNest synthetic payroll fixture - November 2026'};
  });
}
