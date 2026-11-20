import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');let checked=0,failed=0;
function walk(p){if(!fs.existsSync(p))return;for(const e of fs.readdirSync(p,{withFileTypes:true})){if(['node_modules','.git','dist','.gn-backups'].includes(e.name))continue;const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile()&&f.endsWith('.js')){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});checked++;if(r.status!==0){failed++;console.error(`FAIL ${path.relative(root,f)}\n${r.stderr}`);}}}}
walk(path.join(root,'backend','src'));walk(path.join(root,'backend','prisma'));
console.log(`Backend JavaScript syntax: ${checked-failed}/${checked} passed`);process.exitCode=failed?1:0;
