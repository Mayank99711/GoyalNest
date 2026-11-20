import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePayrollPreview} from '../backend/src/modules/team/payrollMath.js';
import {demoAttendance,demoSalary,demoPeriod} from '../backend/prisma/payroll-demo-fixture.js';
const clock=new Date('2026-11-19T12:00:00.000Z');
test('fixture includes 19 unique days, explicit absence, half-day and unpaid leave',()=>{
 const records=demoAttendance();
 assert.equal(records.length,19);
 assert.equal(new Set(records.map(x=>x.workDate.toISOString())).size,19);
 assert.equal(records.filter(x=>x.status==='ABSENT').length,1);
 assert.equal(records.filter(x=>x.status==='UNPAID_LEAVE').length,1);
 assert.equal(records.filter(x=>x.status==='HALF_DAY').length,1);
});
test('payroll preview applies only explicitly recorded unpaid equivalents',()=>{
 const r=calculatePayrollPreview({id:'demo',basicSalary:demoSalary},demoPeriod,demoAttendance(),0,0,clock);
 assert.equal(r.daysRecorded,19); assert.equal(r.daysElapsed,19); assert.equal(r.unrecordedElapsedDays,0);
 assert.equal(r.unpaidDays,2.5); assert.equal(r.attendanceDeduction,1667); assert.equal(r.netPayable,18333);
});
test('unrecorded attendance remains a warning, never automatically absent',()=>{
 const r=calculatePayrollPreview({id:'demo',basicSalary:demoSalary},demoPeriod,demoAttendance().slice(0,1),0,0,clock);
 assert.equal(r.daysRecorded,1);assert.equal(r.unrecordedElapsedDays,18);
 assert.equal(r.unpaidDays,0);assert.equal(r.netPayable,demoSalary);
});
test('allowances and explicit manual deductions reconcile correctly',()=>{
 const r=calculatePayrollPreview({id:'demo',basicSalary:demoSalary},demoPeriod,demoAttendance(),500,250,clock);
 assert.equal(r.deduction,1917);assert.equal(r.netPayable,18583);
});
