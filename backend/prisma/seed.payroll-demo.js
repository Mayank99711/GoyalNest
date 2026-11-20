/**
 * Explicitly opted-in synthetic payroll fixture. NEVER edits Amit Verma or any
 * historical salary record. Localhost Postgres + non-production only.
 * Seed a new demo manager under an existing owner with at least one property.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {PrismaClient} from '@prisma/client';
import {demoAttendance,demoEmail,demoSalary} from './payroll-demo-fixture.js';
const prisma=new PrismaClient();
async function main(){
 if(process.env.PAYROLL_DEMO_CONFIRM!=='YES')throw new Error('Set PAYROLL_DEMO_CONFIRM=YES explicitly');
 if(process.env.NODE_ENV==='production')throw new Error('Payroll demo seed is forbidden in production');
 const url=process.env.DATABASE_URL;
 if(!url)throw new Error('DATABASE_URL is not configured');
 const host=new URL(url).hostname.toLowerCase();
 if(!['localhost','127.0.0.1','::1'].includes(host))throw new Error(`Refusing non-local database host: ${host}`);
 const ownerEmail=(process.env.PAYROLL_DEMO_OWNER_EMAIL||'').trim().toLowerCase();
 if(!ownerEmail)throw new Error('Set PAYROLL_DEMO_OWNER_EMAIL to an existing local owner login');
 const password=process.env.PAYROLL_DEMO_PASSWORD||'';
 if(password.length<12)throw new Error('Set a 12+ character PAYROLL_DEMO_PASSWORD for synthetic manager');
 const owner=await prisma.user.findUnique({where:{email:ownerEmail}});
 if(!owner||owner.role!=='OWNER')throw new Error('Owner login not found or not OWNER');
 const property=await prisma.property.findFirst({where:{ownerId:owner.id},orderBy:{createdAt:'asc'}});
 if(!property)throw new Error('Owner needs one existing property for demo manager assignment');
 const current=await prisma.user.findUnique({where:{email:demoEmail}});
 if(current&&current.role!=='MANAGER')throw new Error('Demo email already belongs to different role; aborting');
 if(current){
  const emp=await prisma.ownerEmployee.findUnique({where:{ownerId_managerUserId:{ownerId:owner.id,managerUserId:current.id}}});
  if(!emp)throw new Error('Demo account exists but is not attached to this owner; aborting');
 }
 const result=await prisma.$transaction(async tx=>{
  const user=current||await tx.user.create({data:{email:demoEmail,name:'GoyalNest Payroll Demo Employee',passwordHash:await bcrypt.hash(password,12),role:'MANAGER',verified:true,active:true}});
  await tx.managerAssignment.upsert({where:{managerId_propertyId:{managerId:user.id,propertyId:property.id}},update:{},create:{managerId:user.id,propertyId:property.id}});
  const emp=await tx.ownerEmployee.upsert({where:{ownerId_managerUserId:{ownerId:owner.id,managerUserId:user.id}},update:{},create:{ownerId:owner.id,managerUserId:user.id,designation:'Payroll QA (Demo)',permissions:[],basicSalary:demoSalary,active:true}});
  if(emp.basicSalary!==demoSalary)throw new Error('Existing demo salary differs from fixture; do not overwrite it');
  const rows=demoAttendance();
  const inserted=await tx.employeeAttendance.createMany({data:rows.map(r=>({...r,ownerId:owner.id,employeeId:emp.id})),skipDuplicates:true});
  return {employeeId:emp.id,created:inserted.count};
 });
 console.log(`Payroll QA fixture ready: ${demoEmail}. Inserted ${result.created} attendance rows (existing rows preserved).`);
 console.log('Expected attendance: 19/19 days. Explicit unpaid equivalent: 2.5 days; salary preview deduction about INR 1667, net about INR 18333.');
 console.log('No SalaryRecord created; use Owner > Monthly Payroll to test draft generation.');
}
try { await main(); } catch(e){console.error('Payroll demo seed stopped:',e.message);process.exitCode=1;}finally{await prisma.$disconnect()}
