import offlinePayments from "./modules/payments/offlinePayments.routes.js";
import categoryRoutes from "./modules/properties/categories.routes.js";
import ownerEmployeesRoutes from "./modules/team/ownerEmployees.routes.js";
import checkoutRoutes from "./modules/checkout/checkout.routes.js";
import checkoutWebhookRoutes from "./modules/checkout/checkoutWebhook.routes.js";
import paymentCentreRoutes from "./modules/payments/paymentCentre.routes.js";
import ownerWorkspaceRoutes from "./modules/owner/ownerWorkspace.routes.js";
import ownerBedsRoutes from "./modules/owner/ownerBeds.routes.js";
import userNotificationsRoutes from "./modules/notifications/userNotifications.routes.js";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import auth from "./modules/auth/auth.routes.js";
import tenantPortalRoutes from "./modules/tenant/tenantPortal.routes.js";
import properties from "./modules/properties/properties.routes.js";
import bookings from "./modules/bookings/bookings.routes.js";
import tenancies from "./modules/tenancies/tenancies.routes.js";
import rent from "./modules/rent/rent.routes.js";
import maintenance from "./modules/maintenance/maintenance.routes.js";
import team from "./modules/team/team.routes.js";
import subscriptions from "./modules/subscriptions/subscriptions.routes.js";
import subscriptionBilling from "./modules/subscriptions/subscriptionRequests.routes.js";
import admin from "./modules/admin/admin.routes.js";
import agreements from "./modules/agreements/agreements.routes.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import propertyImages from "./modules/properties/propertyImages.routes.js";
import kyc from "./modules/Kyc/kyc.routes.js";
import rentAutomation from "./modules/rent/rentAutomation.routes.js";
import gatewayPayments from "./modules/payments/gateway.routes.js";
import refundReview from "./modules/rent/refundReview.routes.js";
import reports from "./modules/reports/reports.routes.js";
import managerAssignments from "./modules/team/managerAssignments.routes.js";
import managerPortal from "./modules/team/managerPortal.routes.js";
import ownerCheckoutRoutes from "./modules/team/ownerCheckout.routes.js";
import invoiceReconciliation from "./modules/rent/invoiceReconciliation.routes.js";
import agreementDocumentsRoutes from "./modules/agreements/agreementDocuments.routes.js";
import agreementUploads from "./modules/agreements/agreementUploads.routes.js";
import agreementVersions from "./modules/agreements/agreementVersions.routes.js";
import agreementEvidenceRoutes from "./modules/agreements/agreementEvidence.routes.js";
import adminOperationsRoutes from "./modules/admin/adminOperations.routes.js";
import platformNotificationsRoutes from "./modules/admin/platformNotifications.routes.js";
import adminMaintenanceRoutes from "./modules/admin/adminMaintenance.routes.js";
import adminKycPreviewRoutes from "./modules/admin/adminKycPreview.routes.js";
import adminSubscriptionsRoutes from "./modules/admin/adminSubscriptions.routes.js";
import adminDisputesRoutes from "./modules/admin/adminDisputes.routes.js";
import myDisputesRoutes from "./modules/disputes/myDisputes.routes.js";
import sharedDisputesRoutes from "./modules/disputes/sharedDisputes.routes.js";
export const app = express();
app.use(helmet());
app.use(cors({ origin: env.origin, credentials: true }));
app.use(cookieParser());
app.use("/api/secure-checkout", checkoutWebhookRoutes);
app.use(express.json({ limit: "256kb" }));
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);
app.use("/api/offline-payments", offlinePayments);
app.use("/api/payment-center", paymentCentreRoutes);
app.use("/api/secure-checkout", checkoutRoutes);
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", service: "GoyalNest API" }),
);
app.use("/api/owner-employees", ownerEmployeesRoutes);
app.use("/api/owner-workspace", ownerWorkspaceRoutes);
app.use("/api/owner-beds", ownerBedsRoutes);
app.use("/api/user-notifications", userNotificationsRoutes);
app.use("/api/auth", auth);
app.use("/api/tenant-portal", tenantPortalRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/properties", properties);
app.use("/api/properties", propertyImages);

const uploadDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../uploads",
);

app.use(
  "/uploads/properties",
  express.static(path.join(uploadDirectory, "properties")),
);
app.use("/api/bookings", bookings);
app.use("/api/tenancies", tenancies);
app.use("/api/rent", rent);
app.use("/api/maintenance", maintenance);
app.use("/api/team", team);
app.use("/api/subscriptions", subscriptions);
app.use("/api/subscription-billing", subscriptionBilling);
app.use("/api/admin", admin);
app.use("/api/agreements", agreements);
app.use("/api/kyc", kyc);
app.use("/api/rent-automation", rentAutomation);
app.use("/api/gateway-payments", gatewayPayments);
app.use("/api/refund-review", refundReview);
app.use("/api/reports", reports);
app.use("/api/manager-assignments", managerAssignments);
app.use("/api/manager-portal", managerPortal);
app.use("/api/owner-checkout", ownerCheckoutRoutes);
app.use("/api/invoice-reconciliation", invoiceReconciliation);
app.use("/api/agreement-documents", agreementDocumentsRoutes);
app.use("/api/agreement-versions", agreementVersions);
app.use("/api/agreement-uploads", agreementUploads);
app.use("/api/agreement-evidence", agreementEvidenceRoutes);
app.use("/api/admin-operations", adminOperationsRoutes);
app.use("/api/platform-notifications", platformNotificationsRoutes);
app.use("/api/admin-maintenance", adminMaintenanceRoutes);
app.use("/api/admin-kyc", adminKycPreviewRoutes);
app.use("/api/admin-subscriptions", adminSubscriptionsRoutes);
app.use("/api/admin-disputes", adminDisputesRoutes);
app.use("/api/dispute-cases", sharedDisputesRoutes);
app.use("/api/my-disputes", myDisputesRoutes);
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));

app.use((err, req, res, next) => {
  if (err.code === "P2002")
    return res.status(409).json({ error: "Record already exists" });
  if (err.code === "P2025")
    return res.status(404).json({ error: "Record not found" });
  if (err.code === "P2034")
    return res.status(409).json({ error: "Concurrent update detected. Refresh and retry." });
  if ((err.status || 500) >= 500) console.error(err);
  res
    .status(err.status || 500)
    .json({ error: err.status ? err.message : "Internal server error" });
});
