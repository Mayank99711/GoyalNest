import nodemailer from "nodemailer";
import {prisma} from "../../config/prisma.js";
import {env} from "../../config/env.js";
function emailHtml(body) {
 const escaped = String(body).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif"><main style="max-width:600px;margin:30px auto;padding:28px;border-radius:12px;background:white;color:#193b32"><h2>GoyalNest</h2><div style="white-space:pre-wrap;line-height:1.6">${escaped}</div><hr><small>For account actions, sign in through your existing GoyalNest portal.</small></main></body></html>`;
}
export async function queueEmail({key,to,subject,body}){
 if(!to || !key) return;
 try { await prisma.emailOutbox.upsert({where:{eventKey:key},create:{eventKey:key,toEmail:to,subject,body},update:{}}); }
 catch(err){console.error("Email could not be queued:",err.message);}
}
let running=false;
export async function flushOutbox(){
 if(running||!env.smtp.host||!env.smtp.from) return;
 running=true;
 try {
  const transport=nodemailer.createTransport({host:env.smtp.host,port:env.smtp.port,secure:env.smtp.secure,auth:env.smtp.user?{user:env.smtp.user,pass:env.smtp.pass}:undefined});
  const batch=await prisma.emailOutbox.findMany({where:{status:"PENDING",attempts:{lt:5}},orderBy:{createdAt:"asc"},take:20});
  for(const entry of batch){
    const claimed=await prisma.emailOutbox.updateMany({where:{id:entry.id,status:"PENDING",attempts:entry.attempts},data:{status:"SENDING",attempts:{increment:1}}});
    if(!claimed.count)continue;
    try{await transport.sendMail({from:env.smtp.from,to:entry.toEmail,subject:entry.subject,text:entry.body,html:emailHtml(entry.body)});await prisma.emailOutbox.update({where:{id:entry.id},data:{status:"SENT",sentAt:new Date(),lastError:null}});}
    catch(e){await prisma.emailOutbox.update({where:{id:entry.id},data:{status:"PENDING",lastError:String(e.message).slice(0,400)}});}
  }
 }finally{running=false;}
}
export function startEmailWorker(){
 // recover unfinished sends on restart; exact-once delivery cannot be guaranteed over SMTP.
 prisma.emailOutbox.updateMany({where:{status:"SENDING"},data:{status:"PENDING"}}).catch(e=>console.error(e.message));
 const timer=setInterval(()=>flushOutbox().catch(e=>console.error("Email worker:",e.message)),30000);
 timer.unref?.();return ()=>clearInterval(timer);
}
