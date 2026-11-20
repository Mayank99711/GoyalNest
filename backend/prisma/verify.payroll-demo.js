/* Read-only verifier. Never changes database records. */
import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {demoEmail,demoAttendance,demoPeriod,demoSalary} from './payroll-demo-fixture.js';
import {calculatePayrollPreview} from '../src/modules/team/payrollMath.js';
const prisma=new PrismaClient();
try{
 const user=await prisma.user.findUnique({where:{email:demoEmail}});
 if(!user)throw new Error('Demo employee not seeded');
 const employee=await prisma.ownerEmployee.findFirst({where:{managerUserId:user.id}});
 if(!employee)throw new Error('Demo OwnerEmployee not found');
 const rows=await prisma.employeeAttendance.findMany({where:{employeeId:employee.id,workDate:{gte:new Date('2026-11-01T00:00:00.000Z'),lt:new Date('2026-12-01T00:00:00.000Z')}},orderBy:{workDate:'asc'}});
 const expected=demoAttendance();
 if(rows.length!==expected.length)throw new Error(`Expected 19 demo attendance days; found ${rows.length}`);
 const match=rows.every((r,i)=>r.workDate.toISOString().slice(0,10)===expected[i].workDate.toISOString().slice(0,10)&&r.status===expected[i].status);
 if(!match)throw new Error('Some demo attendance dates/statuses differ; existing data NOT modified');
 if(employee.basicSalary!==demoSalary)throw new Error('Unexpected demo salary');
 // A fixed current clock makes test output independent of real month.
 const preview=calculatePayrollPreview({...employee,basicSalary:demoSalary},demoPeriod,rows,0,0,new Date('2026-11-19T12:00:00Z'));
 console.log(JSON.stringify({employee:demoEmail,period:demoPeriod,records:rows.length,unpaidDays:preview.unpaidDays,attendanceDeduction:preview.attendanceDeduction,estimatedNet:preview.netPayable,payrollRecords:await prisma.salaryRecord.count({where:{employeeId:employee.id,period:demoPeriod}})},null,2));
 if(preview.unpaidDays!==2.5||preview.attendanceDeduction!==1667||preview.netPayable!==18333)throw new Error('Preview did not match expected fixture calculation');
 console.log('PAYROLL DEMO VERIFICATION PASSED (read-only)');
}catch(e){console.error('PAYROLL DEMO VERIFICATION FAILED:',e.message);process.exitCode=1}finally{await prisma.$disconnect()}
