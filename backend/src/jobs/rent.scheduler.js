import {prisma} from '../config/prisma.js';
import {lateFee} from '../lib/rent.js';
import {sendRentReminder} from '../lib/email.js';
const UTC_DAY=86400000;
function firstOfNextMonth(date){return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));}
export async function runRentCycle(now=new Date()){
 // Run at most daily, but safe to execute more often due to invoice unique constraints.
 const today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
 const tenants=await prisma.tenancy.findMany({where:{status:{in:['ACTIVE','VACATING']}},include:{tenant:true}});
 const next=firstOfNextMonth(today);const daysUntil=Math.round((next-today)/UTC_DAY);
 if(daysUntil<=5){const period=next.toISOString().slice(0,7);for(const t of tenants){
   const inv=await prisma.rentInvoice.upsert({where:{tenancyId_period:{tenancyId:t.id,period}},update:{},create:{tenancyId:t.id,period,amount:t.rent,dueDate:next}});
   if(daysUntil===5){const found=await prisma.reminderLog.findUnique({where:{invoiceId_type:{invoiceId:inv.id,type:'PRE_DUE_5D'}}});if(!found){try{await sendRentReminder(t.tenant.email,period,inv.amount,next.toISOString().slice(0,10));await prisma.reminderLog.create({data:{invoiceId:inv.id,type:'PRE_DUE_5D'}});}catch(e){console.warn('Reminder pending',inv.id,e.message);}}}
 }}
 // Day 7 onwards: fixed fee plus daily fee, capped at INR 500. Cap is a proposed policy.
 const overdue=await prisma.rentInvoice.findMany({where:{status:{in:['PENDING','OVERDUE']},dueDate:{lt:today}}});
 for(const invoice of overdue){const day=Math.floor((today-invoice.dueDate)/UTC_DAY)+1;if(day>6){const penalty=lateFee(invoice.amount,day);if(invoice.penalty!==penalty||invoice.status!=='OVERDUE')await prisma.rentInvoice.update({where:{id:invoice.id},data:{penalty,status:'OVERDUE'}});}}
}
export function scheduleRentCycle(){let running=false;const tick=async()=>{if(running)return;running=true;try{await runRentCycle();}catch(e){console.error('Rent scheduler error',e)}finally{running=false}};tick();const timer=setInterval(tick,60*60*1000);timer.unref?.();return()=>clearInterval(timer);}
