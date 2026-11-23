import {Router} from "express";
import bcrypt from "bcryptjs";
import {z} from "zod";
import {prisma} from "../../config/prisma.js";
import {authenticate,roles} from "../../middleware/auth.js";
import {asyncRoute,required} from "../../lib/errors.js";
import {calculatePayrollPreview} from "./payrollMath.js";
import { notifyUsers } from "../notifications/notify.service.js";
const r=Router();r.use(authenticate,roles("OWNER"));
const PERMISSIONS=["properties.view","rooms.view","bookings.view","tenants.view","maintenance.view","payments.view","reports.view"];
const parse=(schema,v)=>{const p=schema.safeParse(v);required(p.success,p.success?"":"Invalid request data",400);return p.data};
const empData=z.object({designation:z.string().trim().min(2).max(80),permissions:z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),basicSalary:z.number().int().min(0).max(10000000),active:z.boolean()}).strict();
r.get("/",asyncRoute(async(req,res)=>{
 const assignments=await prisma.managerAssignment.findMany({where:{property:{ownerId:req.user.id}},include:{manager:{select:{id:true,name:true,email:true,phone:true,active:true}},property:{select:{id:true,title:true}}}});
 const users=[...new Set(assignments.map(a=>a.managerId))];
 const staff=await prisma.ownerEmployee.findMany({where:{ownerId:req.user.id,managerUserId:{in:users}}});
 res.json({assignments,employees:staff.map(e=>({...e,manager:assignments.find(a=>a.managerId===e.managerUserId)?.manager}))});
}));
r.get("/designations",asyncRoute(async(req,res)=>res.json(await prisma.ownerDesignation.findMany({where:{ownerId:req.user.id},orderBy:{name:"asc"}}))));
r.post("/designations",asyncRoute(async(req,res)=>{
 const {name}=parse(z.object({name:z.string().trim().min(2).max(80)}).strict(),req.body);
 const old=await prisma.ownerDesignation.findUnique({where:{ownerId_name:{ownerId:req.user.id,name}}});
 required(!old,"Designation already exists",409);
 res.status(201).json(await prisma.ownerDesignation.create({data:{ownerId:req.user.id,name}}));
}));
// Employees receive the existing MANAGER login role, with a separate owner-defined job designation.
// Legacy manager endpoints require further permission enforcement; see README security limitations.
r.post("/",asyncRoute(async(req,res)=>{
 const schema=empData.extend({name:z.string().trim().min(2).max(100),email:z.string().trim().email().max(255),phone:z.string().trim().max(25).optional(),password:z.string().min(12).max(128),propertyIds:z.array(z.string()).min(1).max(50)});
 const d=parse(schema,req.body);const email=d.email.toLowerCase();
 const ownProperties=await prisma.property.findMany({where:{ownerId:req.user.id,id:{in:d.propertyIds}},select:{id:true}});
 const ids=[...new Set(d.propertyIds)];required(ids.length===ownProperties.length,"One or more properties are not owned by you",403);
 const existing=await prisma.user.findUnique({where:{email}});required(!existing,"Email already registered",409);
 const passwordHash=await bcrypt.hash(d.password,12);
 const employee=await prisma.$transaction(async tx=>{
  const user=await tx.user.create({data:{name:d.name,email,phone:d.phone||null,passwordHash,role:"MANAGER",verified:true,active:d.active}});
  await tx.managerAssignment.createMany({data:ids.map(propertyId=>({managerId:user.id,propertyId}))});
  return tx.ownerEmployee.create({data:{ownerId:req.user.id,managerUserId:user.id,designation:d.designation,permissions:d.permissions,basicSalary:d.basicSalary,active:d.active}});
 });
 res.status(201).json({id:employee.id,message:"Employee created and assigned"});
}));
const attStatus=z.enum(["PRESENT","ABSENT","HALF_DAY","PAID_LEAVE","UNPAID_LEAVE","HOLIDAY"]);
function validDate(s){const date=new Date(s+"T00:00:00.000Z");return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===s?date:null}
r.get("/attendance",asyncRoute(async(req,res)=>{
 const {period}=parse(z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}),req.query);
 const from=new Date(period+"-01T00:00:00.000Z");const to=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),1));
 const data=await prisma.employeeAttendance.findMany({where:{ownerId:req.user.id,workDate:{gte:from,lt:to}},orderBy:{workDate:"desc"}});res.json(data);
}));
r.get("/attendance/requests",asyncRoute(async(req,res)=>{
 const q=parse(z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}),req.query);
 const from=new Date(q.period+"-01T00:00:00.000Z");
 const to=new Date(Date.UTC(Number(q.period.slice(0,4)),Number(q.period.slice(5,7)),1));
 const rows=await prisma.employeeAttendanceRequest.findMany({where:{ownerId:req.user.id,workDate:{gte:from,lt:to}},orderBy:{requestedAt:"desc"},take:300});
 res.set("Cache-Control","private, no-store");res.json(rows);
}));
r.post("/attendance/requests/:requestId/review",asyncRoute(async(req,res)=>{
 const d=parse(z.object({decision:z.enum(["APPROVE","REJECT"]),note:z.string().trim().max(300).default("")}).strict(),req.body);
 const request=await prisma.employeeAttendanceRequest.findFirst({where:{id:req.params.requestId,ownerId:req.user.id,status:"PENDING"}});
 required(request,"Pending request not found",404);
 const employee=await prisma.ownerEmployee.findFirst({where:{id:request.employeeId,ownerId:req.user.id,active:true}});
 required(employee,"Employee inactive or unavailable",403);
 // Owner must not modify attendance for a pay period with a locked payroll snapshot.
 const period=request.workDate.toISOString().slice(0,7);
 const locked=await prisma.salaryRecord.findUnique({where:{employeeId_period:{employeeId:employee.id,period}}});
 required(!locked,"Payroll already generated for this month. Use an audited payroll correction process.",409);
 const result=await prisma.$transaction(async tx=>{
   // Atomic claim avoids double review; rollback if attendance conflict occurs.
   const claimed=await tx.employeeAttendanceRequest.updateMany({where:{id:request.id,ownerId:req.user.id,status:"PENDING"},data:{status:d.decision==="APPROVE"?"APPROVED":"REJECTED",reviewedAt:new Date(),reviewedBy:req.user.id,reviewNote:d.note}});
   required(claimed.count===1,"Request already reviewed",409);
   if(d.decision==="APPROVE"){
     const existing=await tx.employeeAttendance.findUnique({where:{employeeId_workDate:{employeeId:employee.id,workDate:request.workDate}}});
     required(!existing,"Attendance already recorded by Owner. Request was not approved.",409);
     await tx.employeeAttendance.create({data:{ownerId:req.user.id,employeeId:employee.id,workDate:request.workDate,status:"PRESENT",note:`Approved employee self-check-in by Owner${d.note?": "+d.note:""}`}});
   }
   await notifyUsers(tx,{userIds:[employee.managerUserId],type:"EMPLOYEE_ATTENDANCE_REVIEWED",referenceId:request.id,
     title:d.decision==="APPROVE"?"Attendance approved":"Attendance request rejected",
     message:`Your attendance request for ${period} (${request.workDate.toISOString().slice(0,10)}) was ${d.decision==="APPROVE"?"approved":"rejected"} by the Project Owner.`});
   return tx.employeeAttendanceRequest.findUnique({where:{id:request.id}});
 });
 res.json(result);
}));
r.put("/attendance",asyncRoute(async(req,res)=>{
 const d=parse(z.object({employeeId:z.string(),workDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:attStatus,note:z.string().max(300).default("")}).strict(),req.body);
 const date=validDate(d.workDate);required(date,"Invalid attendance date",400);
 const employee=await prisma.ownerEmployee.findFirst({where:{id:d.employeeId,ownerId:req.user.id}});required(employee,"Employee not available",403);
 const period=d.workDate.slice(0,7);
 const payroll=await prisma.salaryRecord.findUnique({where:{employeeId_period:{employeeId:employee.id,period}}});
 required(!payroll,"Payroll already generated for this month. Attendance corrections require an audited payroll revision.",409);
 const row=await prisma.employeeAttendance.upsert({where:{employeeId_workDate:{employeeId:employee.id,workDate:date}},create:{ownerId:req.user.id,employeeId:employee.id,workDate:date,status:d.status,note:d.note},update:{status:d.status,note:d.note}});res.json(row);
}));
r.put("/:managerId",asyncRoute(async(req,res)=>{
 const data=parse(empData,req.body);
 required(await prisma.managerAssignment.findFirst({where:{managerId:req.params.managerId,property:{ownerId:req.user.id}}}),"Employee not assigned to your property",403);
 const record=await prisma.ownerEmployee.upsert({where:{ownerId_managerUserId:{ownerId:req.user.id,managerUserId:req.params.managerId}},create:{ownerId:req.user.id,managerUserId:req.params.managerId,...data},update:data});res.json(record);
}));

// Preview is informational. Missing days are not automatically treated as absent;
// a work schedule/holiday calendar is not configured in this project.

r.get("/payroll",asyncRoute(async(req,res)=>res.json(await prisma.salaryRecord.findMany({where:{ownerId:req.user.id},orderBy:{createdAt:"desc"},take:150}))));
r.get("/payroll/preview",asyncRoute(async(req,res)=>{
 const q=parse(z.object({period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)}),req.query);
 const employees=await prisma.ownerEmployee.findMany({where:{ownerId:req.user.id,active:true}});
 const from=new Date(q.period+"-01T00:00:00.000Z"),to=new Date(Date.UTC(Number(q.period.slice(0,4)),Number(q.period.slice(5,7)),1));
 const entries=await prisma.employeeAttendance.findMany({where:{ownerId:req.user.id,workDate:{gte:from,lt:to},employeeId:{in:employees.map(e=>e.id)}}});
 res.json(employees.map(e=>calculatePayrollPreview(e,q.period,entries.filter(a=>a.employeeId===e.id))));
}));
r.post("/payroll",asyncRoute(async(req,res)=>{
 const d=parse(z.object({employeeId:z.string(),period:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),allowance:z.number().int().min(0).max(10000000).default(0),deduction:z.number().int().min(0).max(10000000).default(0),note:z.string().max(500).default(""),attendanceReviewed:z.literal(true),calculationMode:z.enum(["RECORDED_PAID_DAYS","FIXED_MONTHLY"]),missingDaysAcknowledged:z.boolean().default(false)}).strict(),req.body);
 const employee=await prisma.ownerEmployee.findFirst({where:{id:d.employeeId,ownerId:req.user.id,active:true}});required(employee,"Employee not available",403);
 const from=new Date(d.period+"-01T00:00:00.000Z"),to=new Date(Date.UTC(Number(d.period.slice(0,4)),Number(d.period.slice(5,7)),1));
 const attendance=await prisma.employeeAttendance.findMany({where:{employeeId:employee.id,ownerId:req.user.id,workDate:{gte:from,lt:to}}});
 const pendingRequests=await prisma.employeeAttendanceRequest.count({where:{employeeId:employee.id,ownerId:req.user.id,status:"PENDING",workDate:{gte:from,lt:to}}});
 required(pendingRequests===0,"Review pending attendance requests before generating payroll",409);
 const preview=calculatePayrollPreview(employee,d.period,attendance,d.allowance,d.deduction,new Date(),d.calculationMode);
 required(preview.daysRecorded>0,"Record and review attendance before generating salary",409);
 required(preview.unrecordedElapsedDays===0||d.missingDaysAcknowledged,"Review and explicitly acknowledge missing attendance before generating a draft",409);
 const deduction=preview.deduction;
 required(deduction<=employee.basicSalary+d.allowance,"Deductions cannot exceed total pay",400);
 const note=[d.note,`Calculation mode: ${d.calculationMode}; payable days ${preview.payableDays}/${preview.calendarDays}; `,`Payroll snapshot: ${preview.daysRecorded}/${preview.daysElapsed} elapsed calendar days recorded; unpaid equivalent ${preview.unpaidDays}; attendance deduction INR ${preview.attendanceDeduction}; manual deduction INR ${d.deduction}.`,preview.unrecordedElapsedDays?"Attendance incomplete at generation; owner explicitly acknowledged. In recorded-paid-days mode unrecorded days did not earn pay, but were NOT marked absent.":"Attendance reviewed by owner."].filter(Boolean).join(" | ").slice(0,1200);
 const record = await prisma.$transaction(async tx => {
   const saved = await tx.salaryRecord.create({data:{ownerId:req.user.id,employeeId:employee.id,period:d.period,basic:employee.basicSalary,allowance:d.allowance,deduction,note}});
   await notifyUsers(tx,{userIds:[employee.managerUserId],type:"PAYROLL_DRAFT_CREATED",referenceId:saved.id,
     title:"Monthly salary draft available",message:`Your ${d.period} salary draft is ready to review and download in My Salary & Payslips. Payment has not been recorded.`});
   return saved;
 });
 res.status(201).json(record);
}));
r.patch("/payroll/:id",asyncRoute(async(req,res)=>{
 const d=parse(z.object({markPaid:z.literal(true),paymentRecorded:z.literal(true),paymentMethod:z.enum(["BANK_TRANSFER","CASH","CHEQUE","OTHER"]),paymentReference:z.string().trim().min(3).max(120),note:z.string().max(500).optional()}),req.body);
 const record=await prisma.salaryRecord.findFirst({where:{id:req.params.id,ownerId:req.user.id}});required(record&&record.status==="DRAFT","Salary record not editable",409);
 const updated=await prisma.$transaction(async tx=>{
   const changed=await tx.salaryRecord.updateMany({where:{id:record.id,ownerId:req.user.id,status:'DRAFT'},data:{status:'PAID',paidAt:new Date(),note:[record.note,`Payment recorded by owner; method ${d.paymentMethod}; reference ${d.paymentReference}. No bank transfer initiated or independently verified.`,d.note||''].filter(Boolean).join(' | ').slice(0,1500)}});
   required(changed.count===1,'Payroll record already changed',409);
   const employee=await tx.ownerEmployee.findUnique({where:{id:record.employeeId},select:{managerUserId:true}});
   await notifyUsers(tx,{userIds:[employee?.managerUserId],type:'PAYROLL_RECORDED',referenceId:record.id,
     title:'Payroll payment recorded by Owner',message:`Your ${record.period} payroll was marked paid in GoyalNest. Method: ${d.paymentMethod}. Verify receipt independently; GoyalNest did not initiate a bank transfer.`});
   return tx.salaryRecord.findUnique({where:{id:record.id}});
 });
 res.json(updated);
}));
export default r;
