/** Read-only NCR demo data verification. Never modifies database. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const tag = '[GoyalNest NCR DEMO]';
const expectedCities = ['Noida','Greater Noida','Gurugram','Delhi','Faridabad','Ghaziabad','Bahadurgarh'];
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  const rows = await prisma.property.findMany({
    where: { title: { startsWith: tag } },
    select: { id:true,title:true,city:true,locality:true,status:true,active:true,ownerId:true,units: {select:{id:true,label:true,rent:true,capacity:true,active:true}} }
  });
  const cities = [...new Set(rows.map(r=>r.city))].sort();
  const missingCities = expectedCities.filter(c=>!cities.includes(c));
  const noRooms = rows.filter(r=>!r.units.length);
  const notPublished = rows.filter(r=>r.status!=='PUBLISHED'||!r.active);
  const invalidRooms = rows.flatMap(r=>r.units.filter(u=>!u.active||u.rent<=0||u.capacity<=0).map(u=>`${r.title} / ${u.label}`));
  const duplicateKeys = new Map();
  for(const r of rows){ const key=`${r.ownerId}|${r.title}`;duplicateKeys.set(key,(duplicateKeys.get(key)||0)+1); }
  const duplicates = [...duplicateKeys].filter(([,count])=>count>1);
  const report = { demoProperties:rows.length, demoUnits: rows.reduce((n,r)=>n+r.units.length,0), cities, missingCities, withoutRooms:noRooms.length, unpublished:notPublished.length, invalidRooms:invalidRooms.length, duplicatePropertyKeys:duplicates.length, status: rows.length && !missingCities.length && !noRooms.length && !notPublished.length && !invalidRooms.length && !duplicates.length ? 'PASS':'NOT_READY' };
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='PASS')process.exitCode=2;
}
try { await main(); } catch(e) { console.error('NCR demo verification failed:',e.message);process.exitCode=1; } finally { await prisma.$disconnect(); }
