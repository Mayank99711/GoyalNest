const amount = value => `INR ${Number(value || 0).toLocaleString("en-IN")}`;
const date = value => value ? new Date(value).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata",year:"numeric",month:"short",day:"numeric"}) : "Not specified";
const text = value => String(value ?? "Not specified");
function details({booking, unit, property, tenant}) {
 return [`Tenant: ${text(tenant?.name)}`, `Booking reference: ${text(booking.id)}`,
 `Property: ${text(property?.title)}`, `Address: ${text(property?.address)}`,
 `Room/unit: ${text(unit?.label)}`, `Move-in date: ${date(booking.moveIn)}`,
 `Monthly rent: ${amount(unit?.rent)}`, `Security deposit requested: ${booking.wantsDeposit ? amount(unit?.depositAmount) : "No"}`].join("\n");
}
export function bookingRequestEmail(input) {
 return {subject:"GoyalNest | Booking request received",body:`Your booking request has been recorded. It is NOT confirmed yet.\n\n${details(input)}\nStatus: PENDING\nSubmitted: ${date(input.booking.createdAt || new Date())}\n\nWhat happens next: The property owner reviews your request. Watch your GoyalNest portal for the decision.`};
}
export function bookingApprovedEmail(input) {
 return {subject:"GoyalNest | Booking approved",body:`Your property owner approved your booking. Approval does not mean payment or check-in is complete.\n\n${details(input)}\nStatus: APPROVED\n\nNext: Review any required invoice and deposit in your tenant portal before check-in.`};
}
export function bookingRejectedEmail(input) {
 return {subject:"GoyalNest | Booking request update",body:`Your booking request was not approved.\n\n${details(input)}\nStatus: REJECTED\n\nYou can browse other available properties in your GoyalNest portal.`};
}
export function tenancyActivatedEmail(input) {
 return {subject:"GoyalNest | Tenancy activated",body:`Your tenancy has been activated in GoyalNest. This does not by itself confirm physical check-in.\n\n${details(input)}\nTenancy reference: ${text(input.tenancy?.id)}\nStatus: ACTIVE\n\nReview your invoices, payment history and check-in details in your tenant portal.`};
}
