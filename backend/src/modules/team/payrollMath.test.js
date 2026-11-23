import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayrollPreview } from './payrollMath.js';

const employee = { id: 'employee-1', basicSalary: 10000 };
const now = new Date('2026-11-23T12:00:00Z');
const row = (day, status) => ({workDate:new Date(`2026-11-${day}T00:00:00Z`), status});

test('recorded paid days: one PRESENT earns 1/30 basic, missing days are unclassified', () => {
  const p = calculatePayrollPreview(employee, '2026-11', [row('01','PRESENT')], 0, 0, now, 'RECORDED_PAID_DAYS');
  assert.equal(p.netPayable, 333);
  assert.equal(p.payableDays, 1);
  assert.equal(p.unrecordedElapsedDays, 22);
});

test('fixed monthly: missing days do not cause implicit deductions', () => {
  const p = calculatePayrollPreview(employee, '2026-11', [row('01','PRESENT')], 0, 0, now, 'FIXED_MONTHLY');
  assert.equal(p.netPayable, 10000);
});

test('recorded mode handles half day, paid leave and absence', () => {
  const a=[row('01','PRESENT'),row('02','HALF_DAY'),row('03','PAID_LEAVE'),row('04','ABSENT'),row('05','HOLIDAY')];
  const p=calculatePayrollPreview(employee,'2026-11',a,0,0,now,'RECORDED_PAID_DAYS');
  assert.equal(p.payableDays,3.5);
  assert.equal(p.netPayable,1167);
});

test('adjustments apply on top of prorated salary', () => {
  const p=calculatePayrollPreview(employee,'2026-11',[row('01','PRESENT')],100,50,now,'RECORDED_PAID_DAYS');
  assert.equal(p.netPayable,383);
});
