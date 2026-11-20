import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const cases = [
 ['backend/src/modules/bookings/bookings.routes.js',['BOOKING_REVIEW','BOOKING_APPROVED','BOOKING_REJECTED','CHECKIN_PREPARE','BOOKING_CANCELLED']],
 ['backend/src/modules/payments/offlinePayments.routes.js',['OFFLINE_PAYMENT_REVIEW','OFFLINE_PAYMENT_STATUS']],
 ['backend/src/modules/maintenance/maintenance.routes.js',['MAINTENANCE_REVIEW','MAINTENANCE_STATUS']],
 ['backend/src/modules/properties/properties.routes.js',['PROPERTY_MODERATION']],
 ['backend/src/modules/admin/admin.routes.js',['PROPERTY_DECISION']],
 ['backend/src/modules/properties/categories.routes.js',['CATEGORY_REVIEW','CATEGORY_DECISION']],
 ['backend/src/modules/subscriptions/subscriptionRequests.routes.js',['SUBSCRIPTION_REVIEW','SUBSCRIPTION_DECISION']],
 ['backend/src/modules/team/ownerEmployees.routes.js',['PAYROLL_RECORDED']],
 ['backend/src/modules/tenancies/tenancies.routes.js',['MOVEOUT_REVIEW','TENANCY_ACTIVATED','CHECKIN_READY']],
 ['backend/src/modules/team/managerPortal.routes.js',['CHECKIN_CONFIRMED']],
 ['backend/src/modules/admin/adminMaintenance.routes.js',['MAINTENANCE_ASSIGNED']],
 ['backend/src/modules/admin/adminSubscriptions.routes.js',['SUBSCRIPTION_PLAN_CHANGE']],
];
let checks=0;
for (const [file,events] of cases){
 const text=readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
 for(const event of events){assert.ok(text.includes(event),`${file} missing ${event}`);checks++;}
}
console.log(`Notification integration: ${checks}/${checks} event hooks confirmed across ${cases.length} modules.`);
