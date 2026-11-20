import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=relative=>readFileSync(new URL('../'+relative,import.meta.url),'utf8');
test('public registration allows TENANT only',()=>{
 const auth=file('backend/src/modules/auth/auth.routes.js');
 assert.match(auth,/required\(\s*role\s*===\s*['"]TENANT['"]/ );
 assert.doesNotMatch(auth,/\['TENANT','OWNER'\]\.includes\(role\)/);
});
test('Admin-only owner provisioning and Owner-only Manager appointment',()=>{
 const admin=file('backend/src/modules/admin/admin.routes.js');
 assert.match(admin,/r\.use\(\s*authenticate\s*,\s*roles\(['"]ADMIN['"]\)\s*\)/);
 assert.match(admin,/r\.post\(\s*['"]\/owners['"]/);
 const team=file('backend/src/modules/team/team.routes.js');
 assert.match(team,/r\.post\(\s*['"]\/appoint['"]\s*,\s*roles\(['"]OWNER['"]\)/);
});
test('Prisma enum format is compatible with multiline entries',()=>{
 const schema=file('backend/prisma/schema.prisma');
 assert.doesNotMatch(schema,/enum \w+ \{ [^\n]* \}/);
});
