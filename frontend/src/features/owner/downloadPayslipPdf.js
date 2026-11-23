/** Download the saved payroll snapshot as a one-page PDF, without external dependencies.
 * Canvas rendering preserves Unicode employee names and the rupee symbol.
 * Only payroll values already present in the authenticated Owner payroll response are used.
 */
const PAGE_W = 1240;
const PAGE_H = 1754;

const currency = value => `₹${Number(value || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const dateLabel = value => value && !Number.isNaN(new Date(value).valueOf())
  ? new Date(value).toLocaleDateString("en-IN") : "Not recorded";
const safeFilePart = value => String(value || "Employee").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 65) || "Employee";

function wrap(ctx, text, maxWidth) {
  const rows = [];
  for (const paragraph of String(text || "").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { rows.push(line); line = word; }
      else line = candidate;
    }
    rows.push(line);
  }
  return rows;
}

function drawPayslip(ctx, {payroll, employeeName, attendanceInfo}) {
  const p = payroll;
  const basic = Number(p.basic || 0);
  const allowance = Number(p.allowance || 0);
  const deduction = Number(p.deduction || 0);
  const net = basic + allowance - deduction;
  const margin = 90;
  const right = PAGE_W - margin;
  const line = (y) => { ctx.strokeStyle = "#dae5dd"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(margin,y); ctx.lineTo(right,y); ctx.stroke(); };
  const text = (value,x,y,options={}) => {
    ctx.font = `${options.bold ? "700" : "400"} ${options.size || 28}px Arial, sans-serif`;
    ctx.fillStyle = options.color || "#203b30";
    ctx.textAlign = options.align || "left";
    ctx.fillText(String(value), x, y);
    ctx.textAlign = "left";
  };
  const block = (value, x, y, {size=25, width=1060, maxLines=6, color="#53695c"}={}) => {
    ctx.font = `400 ${size}px Arial, sans-serif`;
    const rows = wrap(ctx,value,width);
    for (const row of rows.slice(0,maxLines)) { text(row,x,y,{size,color}); y+=size+13; }
    if(rows.length>maxLines) {text("(Further notes omitted; see payroll record)",x,y,{size:20,color});y+=32;}
    return y;
  };

  ctx.fillStyle = "#ffffff";ctx.fillRect(0,0,PAGE_W,PAGE_H);
  ctx.fillStyle = "#173c2d";ctx.fillRect(0,0,PAGE_W,230);
  text("GOYALNEST",margin,105,{bold:true,size:48,color:"#ffffff"});
  text("PAYROLL STATEMENT",margin,168,{size:30,color:"#e6f0e9"});
  text(p.status === "PAID" ? "PAYMENT RECORDED" : "DRAFT - NOT PAID",right,168,{size:26,bold:true,color:"#ffffff",align:"right"});
  text("Employee",margin,310,{size:24,color:"#6c8174"});
  let nameY=354;
  ctx.font="700 38px Arial, sans-serif";
  for(const row of wrap(ctx,employeeName,920).slice(0,2)){text(row,margin,nameY,{bold:true,size:38});nameY+=48;}
  text("Pay period",margin,455,{size:24,color:"#6c8174"});
  text(p.period || "Not provided",margin,495,{bold:true,size:30});
  text("Payroll record ID",right,455,{size:24,color:"#6c8174",align:"right"});
  text(String(p.id || "Not provided").slice(0,45),right,495,{size:22,align:"right"});
  line(540);

  text("PAY BREAKDOWN",margin,605,{bold:true,size:26});
  const items=[
    ["Basic salary", currency(basic)],
    ["Allowances", `+ ${currency(allowance)}`],
    ["Deductions", `- ${currency(deduction)}`],
  ];
  let y=675;
  for(const [label,value] of items){text(label,margin,y,{size:29});text(value,right,y,{size:29,align:"right"});line(y+32);y+=100;}
  ctx.fillStyle="#edf5ef";ctx.fillRect(margin,970,PAGE_W-2*margin,125);
  text("NET PAYABLE",margin+26,1047,{bold:true,size:30});
  text(currency(net),right-26,1047,{bold:true,size:40,align:"right"});

  text("PAYMENT STATUS",margin,1170,{bold:true,size:25});
  let payment = p.status === "PAID"
    ? `Payment manually recorded on ${dateLabel(p.paidAt)}. This is not evidence of bank settlement.`
    : "Draft payroll statement. Payment has not been recorded.";
  y=block(payment,margin,1218,{maxLines:3});
  if(p.paymentMethod) y=block(`Recorded method: ${p.paymentMethod}`,margin,y+3,{maxLines:2});
  if(p.paymentReference) y=block(`Recorded reference: ${p.paymentReference}`,margin,y+3,{maxLines:2});

  y=Math.max(1400,y+24);
  text("ATTENDANCE SNAPSHOT",margin,y,{bold:true,size:25});y+=53;
  const attendance = attendanceInfo?.recorded != null
    ? `${attendanceInfo.recorded} attendance day(s) recorded${attendanceInfo.elapsed != null ? ` out of ${attendanceInfo.elapsed} elapsed calendar days at draft creation` : ""}.`
    : "No structured attendance snapshot available.";
  y=block(attendance,margin,y,{size:24,maxLines:3});
  if(p.note){y+=25;text("PAYROLL NOTES",margin,y,{bold:true,size:25});y+=48;block(p.note,margin,y,{size:21,maxLines:Math.max(1,Math.floor((1665-y)/34))});}
  line(1690);
  text("Generated from the saved GoyalNest payroll record. Not a bank receipt.",margin,1730,{size:19,color:"#718778"});
}

function bytesFromBase64(base64){
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

function jpegToPdf(jpeg, width, height) {
  const encoder=new TextEncoder();
  const chunks=[];let size=0;const offsets=[0];
  const push=bytes=>{const b=typeof bytes==="string"?encoder.encode(bytes):bytes;chunks.push(b);size+=b.length;};
  const object=(index,content)=>{offsets[index]=size;push(`${index} 0 obj\n${content}\nendobj\n`);};
  push("%PDF-1.4\n");
  object(1,"<< /Type /Catalog /Pages 2 0 R >>");
  object(2,"<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
  offsets[4]=size;push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);push(jpeg);push("\nendstream\nendobj\n");
  const commands="q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n";
  object(5,`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref=size;push("xref\n0 6\n0000000000 65535 f \n");
  for(let i=1;i<=5;i++)push(`${String(offsets[i]).padStart(10,"0")} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks,{type:"application/pdf"});
}

export function downloadPayslipPdf({payroll,employeeName,attendanceInfo}) {
  if(!payroll) return;
  const canvas=document.createElement("canvas");canvas.width=PAGE_W;canvas.height=PAGE_H;
  const ctx=canvas.getContext("2d");
  if(!ctx) throw new Error("PDF export is not supported in this browser.");
  drawPayslip(ctx,{payroll,employeeName,attendanceInfo});
  const jpeg=bytesFromBase64(canvas.toDataURL("image/jpeg",0.92).split(",")[1]);
  const blob=jpegToPdf(jpeg,PAGE_W,PAGE_H);
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;
  a.download=`GoyalNest-Payslip-${safeFilePart(employeeName)}-${safeFilePart(payroll.period)}.pdf`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
