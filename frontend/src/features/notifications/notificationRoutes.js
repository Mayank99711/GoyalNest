// Reusable, role-aware navigation for saved notifications.
// Only navigate to routes supported by each portal; read state is separate from completing actions.
const safeRole = role => String(role || "").toUpperCase();
export function notificationTarget(type, role) {
  const t = String(type || "").toUpperCase();
  const r = safeRole(role);
  if (t.startsWith("AGREEMENT_")) return r === "TENANT" || r === "OWNER" ? "/dashboard/agreements" : "/dashboard/notifications";
  if (t.startsWith("KYC_")) return r === "ADMIN" ? "/dashboard/agreements#gn-kyc-review" : r === "TENANT" ? "/dashboard/kyc" : r === "OWNER" ? "/dashboard/agreements" : "/dashboard/notifications";
  if (t.startsWith("BOOKING_")) return r === "OWNER" || r === "TENANT" ? "/dashboard/bookings" : r === "MANAGER" ? "/dashboard/checkin" : "/dashboard/notifications";
  if (t.startsWith("CHECKIN_") || t === "TENANCY_ACTIVATED") return r === "MANAGER" ? "/dashboard/checkin" : r === "TENANT" ? "/dashboard/tenancy" : r === "OWNER" ? "/dashboard/tenants" : "/dashboard/notifications";
  if (t.startsWith("MOVEOUT_")) return r === "TENANT" ? "/dashboard/vacate" : r === "MANAGER" ? "/dashboard/checkin" : "/dashboard/tenants";
  if (t.startsWith("OFFLINE_PAYMENT") || t.startsWith("PAYMENT_")) return r === "ADMIN" ? "/dashboard/payments" : r === "OWNER" ? "/dashboard/rent" : r === "TENANT" ? "/dashboard/rent" : "/dashboard/rent";
  if (t.startsWith("MAINTENANCE_")) return "/dashboard/maintenance";
  if (t.startsWith("PROPERTY_") || t.startsWith("CATEGORY_")) return r === "ADMIN" ? "/dashboard/approvals" : r === "OWNER" ? "/dashboard/properties" : "/dashboard/notifications";
  if (t.startsWith("SUBSCRIPTION_")) return r === "ADMIN" || r === "OWNER" ? "/dashboard/subscriptions" : "/dashboard/notifications";
  if (t.startsWith("PAYROLL_")) return r === "OWNER" ? "/dashboard/employees" : "/dashboard/notifications";
  return "/dashboard/notifications";
}
export function notificationActionLabel(type, role) {
  const t = String(type || "").toUpperCase();
  if (t.startsWith("AGREEMENT_")) return safeRole(role) === "TENANT" ? "Review agreement" : "View agreement";
  if (t.startsWith("KYC_")) return safeRole(role) === "ADMIN" ? "Review KYC" : "View KYC status";
  if (t.startsWith("BOOKING_")) return "View booking";
  if (t.startsWith("MAINTENANCE_")) return "View ticket";
  if (t.startsWith("OFFLINE_PAYMENT") || t.startsWith("PAYMENT_")) return "View payments";
  if (t.startsWith("SUBSCRIPTION_")) return "View subscription";
  return "Open related section";
}
export function notificationNeedsAction(item, role) {
  if (item?.source === "announcement") return false;
  const t = String(item?.type || "").toUpperCase();
  if (t === "AGREEMENT_PUBLISHED" && safeRole(role) === "TENANT") return true;
  if (t === "KYC_SUBMITTED" && safeRole(role) === "ADMIN") return true;
  if (t === "BOOKING_SUBMITTED" && safeRole(role) === "OWNER") return true;
  if (t.startsWith("OFFLINE_PAYMENT") && (t.includes("SUBMITTED") || t.includes("REPORTED")) && safeRole(role) === "OWNER") return true;
  return t.endsWith("_SUBMITTED") || t.endsWith("_REPORTED") || t === "CHECKIN_PREPARE";
}
