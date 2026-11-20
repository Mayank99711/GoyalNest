import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyUsers, activeUserIdsByRole, activeManagerIdsForProperty} from './notify.service.js';
test('deduplicates recipients and ignores missing IDs', async()=>{
 let rows=[];
 await notifyUsers({userNotification:{createMany:async ({data})=>{rows=data}}},{userIds:['u1','u1',null,'u2'],type:'BOOKING_REVIEW',title:'Review',message:'Review booking',referenceId:'b1'});
 assert.deepEqual(rows.map(r=>r.userId),['u1','u2']);
 assert.ok(rows.every(r=>r.referenceId==='b1'));
});
test('no users means no notification write', async()=>{
 let calls=0;
 await notifyUsers({userNotification:{createMany:async()=>{calls++}}},{userIds:[null],type:'INFO',title:'Info',message:'Info'});
 assert.equal(calls,0);
});
test('role lookup is active-user scoped',async()=>{
 const ids=await activeUserIdsByRole({user:{findMany:async ({where})=>{assert.deepEqual(where,{role:'ADMIN',active:true});return [{id:'admin1'}]}}},'ADMIN');
 assert.deepEqual(ids,['admin1']);
});
test('manager lookup is assigned-property scoped',async()=>{
 const ids=await activeManagerIdsForProperty({managerAssignment:{findMany:async ({where})=>{assert.equal(where.propertyId,'p1');assert.equal(where.manager.active,true);return [{managerId:'m1'}]}}},'p1');
 assert.deepEqual(ids,['m1']);
});
