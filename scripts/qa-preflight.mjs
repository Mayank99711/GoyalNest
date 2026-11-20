import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname || new URL('..', import.meta.url).pathname, '..');
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; };
const parse = path => JSON.parse(readFileSync(resolve(root,path),'utf8'));
for (const name of ['backend/package.json','frontend/package.json','backend/prisma/schema.prisma','frontend/src/main.jsx']) check(name, existsSync(resolve(root,name)));
const packageName = parse('package.json').name;
check('frontend local root package name',parse('frontend/package.json').dependencies?.['goyalnest-property-living']==='file:..' && packageName==='goyalnest-property-living');
check('backend local root package name',parse('backend/package.json').dependencies?.['goyalnest-property-living']==='file:..' && packageName==='goyalnest-property-living');
check('rent unit tests present', existsSync(resolve(root,'backend/src/modules/rent/rentAutomation.rules.test.js')));
check('node >=20.19',Number(process.versions.node.split('.')[0])>=20);
try { execFileSync('node',['--check',resolve(root,'backend/src/server.js')],{stdio:'pipe'});check('backend entry syntax',true); } catch { check('backend entry syntax',false); }
if(failures){ console.error(`${failures} preflight check(s) failed.`); process.exitCode=1; }
else console.log('QA preflight passed. This is NOT a production deployment approval.');
