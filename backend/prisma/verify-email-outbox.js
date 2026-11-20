// Read-only email outbox inspection. Does not send or retry emails.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma=new PrismaClient();
const mask=(s)=>String(s||"").replace(/^(.{1,2}).*(@.*)$/,(m,a,b)=>a+"***"+b);
try{
 const rows=await prisma.emailOutbox.findMany({orderBy:{createdAt:"desc"},take:30,select:{eventKey:true,toEmail:true,subject:true,status:true,attempts:true,lastError:true,createdAt:true,sentAt:true}});
 const counts=await prisma.emailOutbox.groupBy({by:["status"],_count:{_all:true}});
 console.log("Email outbox status counts:",counts.map(r=>`${r.status}: ${r._count._all}`).join(" | ")||"No records");
 console.table(rows.map(r=>({event:r.eventKey.slice(0,58),to:mask(r.toEmail),subject:r.subject.slice(0,42),status:r.status,attempts:r.attempts,queued:r.createdAt.toISOString(),sent:r.sentAt?.toISOString()||"",error:r.lastError?.slice(0,90)||""})));
 console.log("SENT means SMTP provider accepted the message, not guaranteed inbox delivery.");
} catch(err){console.error("Unable to inspect outbox:",err.message);process.exitCode=1}finally{await prisma.$disconnect()}
