import test from 'node:test';
import assert from 'node:assert/strict';
import {bookingRequestEmail,bookingApprovedEmail,bookingRejectedEmail,tenancyActivatedEmail} from '../backend/src/modules/notifications/bookingEmailTemplates.js';
const data={booking:{id:'BOOK-DEMO',moveIn:'2027-01-01T00:00:00.000Z',wantsDeposit:true},tenant:{name:'Example Tenant'},unit:{label:'DEMO-01',rent:12000,depositAmount:12000},property:{title:'Demo Property',address:'DEMO ONLY, Delhi, India'},tenancy:{id:'TEN-DEMO'}};
test('request does not overpromise approval',()=>{const msg=bookingRequestEmail(data).body;assert.match(msg,/NOT confirmed/);assert.match(msg,/PENDING/);assert.match(msg,/DEMO-01/);});
test('approval distinct from confirmation',()=>{const msg=bookingApprovedEmail(data).body;assert.match(msg,/APPROVED/);assert.match(msg,/does not mean payment/);});
test('rejection email uses rejected status',()=>assert.match(bookingRejectedEmail(data).body,/REJECTED/));
test('activation does not claim physical checkin',()=>assert.match(tenancyActivatedEmail(data).body,/does not by itself confirm physical check-in/));
