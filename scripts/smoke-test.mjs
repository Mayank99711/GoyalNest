import {spawnSync} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');const tests=[];
function walk(p){if(!fs.existsSync(p))return;for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.name==='node_modules')continue;const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile()&&e.name.endsWith('.test.js'))tests.push(f);}}
walk(path.join(root,'backend','src'));walk(path.join(root,'backend','tests'));
if(!tests.length){console.log('NO TESTS FOUND - not marking as passed');process.exitCode=2;}else{console.log(`Running ${tests.length} discovered unit test files`);const r=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit'});process.exitCode=r.status??1;}
