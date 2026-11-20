import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(import.meta.dirname,'..');
let failed=0;let warn=0;
const report=(ok,label,required=true)=>{console.log(`${ok?'PASS':required?'FAIL':'WARN'} ${label}`);if(!ok){if(required)failed++;else warn++;}};
const exists=p=>fs.existsSync(path.join(root,p));
for(const p of ['frontend/package.json','frontend/vite.config.js','frontend/src','backend/package.json','backend/src/server.js','backend/prisma/schema.prisma'])report(exists(p),p);
const major=Number(process.versions.node.split('.')[0]); const minor=Number(process.versions.node.split('.')[1]);
report(major>20||(major===20&&minor>=19),`Node ${process.version} >=20.19`);
let name='';try{name=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).name;}catch{}
report(name==='goyalnest-property-living',`Root package name matches file:.. dependencies (found ${name||'none'})`);
report(exists('backend/.env'),'backend/.env configured',false);
report(exists('backend/node_modules'),'Backend npm dependencies installed',false);
report(exists('frontend/node_modules'),'Frontend npm dependencies installed',false);
const nets=os.networkInterfaces();
for(const [iface, entries] of Object.entries(nets))for(const e of entries||[])if(e.family==='IPv4'&&!e.internal)console.log(`LAN ${iface}: http://${e.address}:5173`);
console.log(`Preflight completed: ${failed} failure(s), ${warn} warning(s)`);
process.exitCode=failed?1:0;
