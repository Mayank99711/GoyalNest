/**
 * Synthetic NCR demo listings, repeatable and non-destructive.
 * Explicit opt-in only: NCR_DEMO_SEED_CONFIRM=YES, NCR_DEMO_SEED_PASSWORD 12+ chars.
 * Never use on production or a shared database with real customer records.
 * Does not reset, delete, or overwrite existing properties/units.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const seedTag = '[GoyalNest NCR DEMO]';
const cities = {
  Noida: ['Sector 15','Sector 18','Sector 19','Sector 22','Sector 44','Sector 50','Sector 62','Sector 75','Sector 76','Sector 78','Sector 100','Sector 104','Sector 137','Sector 143','Sector 150'],
  'Greater Noida': ['Alpha 1','Alpha 2','Beta 1','Beta 2','Gamma 1','Pari Chowk','Knowledge Park','Greater Noida West','Gaur City','Techzone 4'],
  Gurugram: ['DLF Phase 1','DLF Phase 2','DLF Phase 3','DLF Phase 4','DLF Phase 5','Sector 14','Sector 21','Sector 31','Sector 40','Sector 45','Sector 46','Sector 47','Sector 56','Sector 57','Sector 62','Sector 65','Sohna Road','Golf Course Road','Cyber City','Udyog Vihar','Manesar'],
  Delhi: ['Dwarka','Rohini','Saket','Lajpat Nagar','Malviya Nagar','Uttam Nagar','Janakpuri','Karol Bagh','Mukherjee Nagar','South Extension','Vasant Kunj','Pitampura','Mayur Vihar','Laxmi Nagar','Rajouri Garden'],
  Faridabad: ['Sector 15','Sector 21C'],
  Ghaziabad: ['Indirapuram','Vaishali','Vasundhara'],
  Bahadurgarh: ['City Centre'],
};
const types = ['PG','HOSTEL','APARTMENT','FLAT','SHARED'];
const amountFor = (city,i) => {
 const base = city === 'Gurugram' ? 11000 : city === 'Noida' ? 8500 : city === 'Delhi' ? 9000 : 7200;
 return base + (i%5)*1100;
};
async function main() {
 if (process.env.NCR_DEMO_SEED_CONFIRM !== 'YES') throw new Error('Explicit confirmation NCR_DEMO_SEED_CONFIRM=YES is required');
 if (process.env.NODE_ENV === 'production') throw new Error('Never run the demo seeder in production');
 if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
 const password = process.env.NCR_DEMO_SEED_PASSWORD || '';
 if(password.length < 12) throw new Error('NCR_DEMO_SEED_PASSWORD must contain at least 12 characters');
 const email = 'ncr.demo.owner@goyalnest-demo.invalid';
 const owner = await prisma.user.findUnique({where:{email}}) || await prisma.user.create({data:{
   email,name:'NCR Demo Property Owner',passwordHash:await bcrypt.hash(password,12),role:'OWNER',verified:true,active:true,
 }});
 if(owner.role !== 'OWNER') throw new Error('Demo email already exists with another role');
 let properties=0, units=0;
 for(const [city,localities] of Object.entries(cities)) {
  for(const [i,locality] of localities.entries()) {
   const title = `${seedTag} ${city} ${locality}`;
   const type=types[i%types.length], rent=amountFor(city,i);
   let property = await prisma.property.findFirst({where:{ownerId:owner.id,title}});
   if(!property) {
    property=await prisma.property.create({data:{ownerId:owner.id,title,description:`Synthetic ${type.toLowerCase()} accommodation for development search and booking demos. Not a real property or offer.`,city,locality,address:`DEMO ONLY - ${locality}, ${city}, India`,type,
     amenities:'Wi-Fi, Water, Electricity, Common Area',genderPreference:'ANY',status:'PUBLISHED',active:true}});
    properties++;
   }
   for(const [j,capacity] of [1,2,3,4].entries()) {
    const label=`DEMO-${String(j+1).padStart(2,'0')}`;
    if(await prisma.unit.findFirst({where:{propertyId:property.id,label}})) continue;
    await prisma.unit.create({data:{propertyId:property.id,label,capacity,rent:Math.round(rent*(j===0?1.3:j===1?1:j===2?0.85:0.75)),depositAmount:rent,active:true}});
    units++;
   }
  }
 }
 console.log(`NCR DEMO SEED COMPLETE: ${properties} properties and ${units} units created; existing demo records preserved`);
 console.log('These are synthetic listings and addresses; not actual rental inventory.');
}
try { await main(); } catch (error) {console.error('NCR demo seed failed:',error.message);process.exitCode=1;} finally {await prisma.$disconnect();}
