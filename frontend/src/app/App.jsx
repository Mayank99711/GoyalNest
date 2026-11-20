import ActivityToastHost from "../components/ActivityToastHost";
import OwnerEmployees from "../features/owner/OwnerEmployees";
import AdminCategories from "../features/admin/AdminCategories";
import TenantTenancyPro from "../features/tenancies/TenantTenancyPro";
import AgreementWorkspace from "../features/agreements/AgreementWorkspace";
import CheckoutPortal from "../features/checkout/CheckoutPortal";
import PaymentCentre from "../features/payments/PaymentCentre";
import TenantPaymentHub from "../features/payments/TenantPaymentHub";
import { OwnerUnits, OwnerTenants } from "../features/owner/OwnerWorkspace";
import OwnerSubscriptionBilling from "../features/owner/OwnerSubscriptionBilling";
// import AdminComplaints from "../features/admin/AdminComplaints";
import React, {useState} from "react";
import "../features/owner/DepositsProfessional.css";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./AuthContext";
import { roleLabels, roleNavigation, findNavigationItem } from "./navigation";

import AuthPage from "../features/auth/AuthPage";
import PublicHome from "../features/marketplace/PublicHome";
import Marketplace from "../features/marketplace/Marketplace";

import AdminDashboard from "../features/admin/AdminDashboard";
import PropertyOwners from "../features/admin/PropertyOwners";
import OwnerDashboard from "../features/owner/OwnerDashboard";
import ManagersStaff from "../features/owner/ManagersStaff";
import ManagerDashboard from "../features/manager/ManagerDashboard";
import TenantDashboard from "../features/tenant/TenantDashboard";
import TenantProfile from "../features/tenant/TenantProfile";
import TenantVisits from "../features/tenant/TenantVisits";
import TenantVacate from "../features/tenant/TenantVacate";
import TenantPayments from "../features/tenant/TenantPayments";
import TenantKYC from "../features/tenant/TenantKYC";

import { Card } from "../components/UI";
import ListingApprovals from "../features/admin/ListingApprovals";
import MyProperties from "../features/owner/MyProperties";
import PropertyDetails from "../features/marketplace/PropertyDetails";
import BookingApprovals from "../features/owner/BookingApprovals";
import MyBookings from "../features/tenant/MyBookings";
import ForgotPassword from "../features/auth/ForgotPassword";
import TenancyWorkflow from "../features/tenancies/TenancyWorkflow";
import RentAlerts from "../features/tenant/RentAlerts";
import RentPayments from "../features/rent/RentPayments";
import RefundReview from "../features/owner/RefundReview";
import OwnerReports from "../features/owner/OwnerReports";
import OwnerDepositsWorkspace from "../features/owner/OwnerDepositsWorkspace";
import MoveOutWorkflow from "../features/tenancies/MoveOutWorkflow";
import MaintenanceManagement from "../features/maintenance/MaintenanceManagement";
import ManagerOperations from "../features/manager/ManagerOperations";
import ManagerDailyOperations from "../features/manager/ManagerDailyOperations";
import ManagerReportsAgreements from "../features/manager/ManagerReportsAgreements";
import ManagerDailyReport from "../features/manager/ManagerDailyReport";
import ManagerHandoverPage from "../features/manager/ManagerHandoverPage";
import OwnerCheckoutReview from "../features/owner/OwnerCheckoutReview";
import InvoiceReconciliation from "../features/owner/InvoiceReconciliation";
import AgreementDownloads from "../features/agreements/AgreementDownloads";
import AgreementUploads from "../features/agreements/AgreementUploads";
import AgreementVersions from "../features/agreements/AgreementVersions";
import AgreementEvidence from "../features/agreements/AgreementEvidence";
import AdminOperations from "../features/admin/AdminOperations";
import AdminManagement from "../features/admin/AdminManagement";
import AdminSubscriptionsSettings from "../features/admin/AdminSubscriptionsSettings";
import AdminNotificationsRoles from "../features/admin/AdminNotificationsRoles";
import NotificationInbox from "../features/notifications/NotificationInbox";
import PortalNotificationBell from "../features/notifications/PortalNotificationBell";
import AdminAllProperties from "../features/admin/AdminAllProperties";
import AdminTransactions from "../features/admin/AdminTransactions";
import AdminAgreementsKYC from "../features/admin/AdminAgreementsKYC";
import AdminMaintenanceOversight from "../features/admin/AdminMaintenanceOversight";
import AdminDisputes from "../features/admin/AdminDisputes";
import MyDisputes from "../features/disputes/MyDisputes";
import PortalOverviews from "../features/overview/PortalOverviews";
const dashboards = {
  ADMIN: AdminDashboard,
  OWNER: OwnerDashboard,
  MANAGER: ManagerDashboard,
  TENANT: TenantDashboard,
};

function PendingModule({ title }) {
  return (
    <Card
      title={title}
      desc="This module is part of the approved GoyalNest scope."
    >
      <p>
        Under development. Functional APIs, database workflows
        and dedicated screens will be added in upcoming phases.
      </p>
    </Card>
  );
}

function PublicPage() {
  const navigate = useNavigate();

  return (
    <PublicHome
      onLogin={() => navigate("/login")}
      onRegister={() => navigate("/register")}
    />
  );
}

function AuthRoute({ mode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading GoyalNest...</div>;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AuthPage mode={mode} />;
}

function DashboardShell() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { page } = useParams();
  const [sidebarCollapsed,setSidebarCollapsed] = useState(false);
  const [mobileNavOpen,setMobileNavOpen] = useState(false);

  if (loading) {
    return <div className="loading">Loading GoyalNest...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const sections = roleNavigation[user.role] || [];
  const requestedPage = page || "dashboard";

  const currentPage = (requestedPage === "notifications" || Boolean(findNavigationItem(user.role, requestedPage))) ? requestedPage : "dashboard";

  const currentItem = findNavigationItem(user.role, currentPage);
  const Dashboard = dashboards[user.role];

  function changePage(nextPage) {
    setMobileNavOpen(false);
    navigate(
      nextPage === "dashboard"
        ? "/dashboard"
        : `/dashboard/${nextPage}`
    );
  }

  async function signOut() {
    await logout();
    navigate("/", { replace: true });
  }

  function renderContent() {
    // TENANT_TENANCY_PRO_V1: New tenant-only workspace; all other portals unchanged.
    if (user.role === "TENANT" && ["tenancy", "tenancies"].includes(currentPage)) {
      return <TenantTenancyPro />;
    }
    // AGREEMENT_WORKSPACE_PRO: role-scoped agreement management.
    if (currentPage === "agreements" && ["OWNER", "TENANT", "ADMIN"].includes(user.role)) {
      return <AgreementWorkspace />;
    }
    if (currentPage === "dashboard") return <PortalOverviews role={user.role} />;
    if (user.role === "TENANT" && ["rent", "payments"].includes(currentPage)) return <TenantPaymentHub />;
    if (user.role === "OWNER" && ["subscriptions", "my-subscription"].includes(currentPage)) return <CheckoutPortal />;
    if (["TENANT", "OWNER"].includes(user.role) && ["rent", "payments", "collections"].includes(currentPage)) return <PaymentCentre />;
    // OWNER_P0_DIRECT_COPY routes - preserve remaining existing routes below.
    if (user.role === "OWNER" && ["units", "rooms", "beds"].includes(currentPage)) return <OwnerUnits />;
    if (user.role === "OWNER" && currentPage === "tenants") return <OwnerTenants />;
    if (user.role === "OWNER" && ["subscriptions", "my-subscription"].includes(currentPage)) return <OwnerSubscriptionBilling />;
    if (
  ["TENANT", "OWNER"].includes(user.role) &&
  ["my-disputes", "disputes"].includes(currentPage)
) {
  return <MyDisputes />;
}

    if (user.role === "OWNER" && currentPage === "deposits") {
      return <OwnerDepositsWorkspace />;
    }
    if (
  user.role === "MANAGER" &&
  ["checkin", "check-in", "check-out", "check-in-out"].includes(currentPage)
) {
  return <ManagerHandoverPage />;
}
    if (user.role === "MANAGER") {
  if (currentPage === "agreements") {
  return (
    <div className="dashboard-grid">
      <ManagerReportsAgreements page="agreements" />
      <AgreementDownloads />
      <AgreementUploads />
      <AgreementVersions />
      <AgreementEvidence />
    </div>
  );
}

  if (["reports", "daily-reports"].includes(currentPage)) {
    return <ManagerDailyReport />;
  }
}
    if (user.role === "MANAGER") {
  if (["tenants", "tenant-records"].includes(currentPage)) {
    return <ManagerDailyOperations page="tenants" />;
  }

  if (["checkin", "check-in", "check-out", "check-in-out"].includes(currentPage)) {
    return <ManagerDailyOperations page="checkin" />;
  }

  if (["rent", "rent-collection"].includes(currentPage)) {
    return <ManagerDailyOperations page="rent" />;
  }
}
    if (user.role === "MANAGER") {
  if (["overview", "dashboard"].includes(currentPage)) {
    return <ManagerOperations page="overview" />;
  }

  if (["properties", "assigned-properties"].includes(currentPage)) {
    return <ManagerOperations page="properties" />;
  }

  if (["rooms", "units", "occupancy"].includes(currentPage)) {
    return <ManagerOperations page="rooms" />;
  }
}
    if (
  ["TENANT", "OWNER", "MANAGER"].includes(user.role) &&
  ["maintenance", "maintenance-requests"].includes(currentPage)
) {
  return <MaintenanceManagement />;
}
    if (
  user.role === "TENANT" &&
  ["tenancies", "tenancy"].includes(currentPage)
) {
  return (
    <>
      <TenancyWorkflow />
      <MoveOutWorkflow />
    </>
  );
}
    if (
  user.role === "OWNER" &&
  ["reports", "analytics"].includes(currentPage)
) {
  return <OwnerReports />;
}
    if (
  user.role === "TENANT" &&
  ["rent", "payments"].includes(currentPage)
) {
  return <TenantPayments />;
}

if (
  user.role === "OWNER" &&
  ["rent", "payments", "collections"].includes(currentPage)
) {
  return <RentPayments />;
}
    if (
  ["TENANT", "OWNER"].includes(user.role) &&
  ["agreements", "tenancies"].includes(currentPage)
) {
  return (
    <div className="dashboard-grid">
      <TenancyWorkflow />

      {currentPage === "agreements" && (
        <AgreementDownloads />

      )}
      <AgreementUploads />
      <AgreementVersions />
      <AgreementEvidence />
    </div>
  );
}

// ADMIN - SUBSCRIPTIONS
if (
  user.role === "ADMIN" &&
  ["subscriptions", "subscription-management"].includes(currentPage)
) {
  return <AdminSubscriptionsSettings page="subscriptions" />;
}

// ADMIN - PLATFORM SETTINGS
if (
  user.role === "ADMIN" &&
  ["settings", "platform-settings"].includes(currentPage)
) {
  return <AdminSubscriptionsSettings page="settings" />;
}
if (user.role === "OWNER" && currentPage === "employees") return <OwnerEmployees />;
if (user.role === "ADMIN" && currentPage === "categories") return <AdminCategories />;
// ADMIN - NOTIFICATIONS
if (
  user.role === "ADMIN" &&
  ["notifications", "notification-management"].includes(currentPage)
) {
  return <AdminNotificationsRoles page="notifications" />;
}
if (
  user.role === "ADMIN" &&
  currentPage === "properties"
) {
  return <AdminAllProperties />;
}
// Maintenance complaints use their own route.
// if (user.role === "ADMIN" && currentPage === "complaints") {
//   return <AdminComplaints />;
// }
if (
  user.role === "ADMIN" &&
  [
    "agreements",
    "kyc",
    "agreements-kyc",
    "agreements-and-kyc",
  ].includes(currentPage)
) {
  return <AdminAgreementsKYC />;
}
if (
  user.role === "ADMIN" &&
  [
    "payments",
    "transactions",
    "payments-transactions",
    "payments-and-transactions",
  ].includes(currentPage)
) {
  return <AdminTransactions />;
}
if (
  user.role === "ADMIN" &&
  [
    "complaints",
    "disputes",
    "complaints-disputes",
    "complaints-and-disputes"
  ].includes(currentPage)
) {
  return <AdminDisputes />;
}
// ADMIN - ROLES & PERMISSIONS
if (
  user.role === "ADMIN" &&
  ["roles", "roles-permissions", "permissions"].includes(currentPage)
) {
  return <AdminNotificationsRoles page="roles" />;
}

// TENANT, OWNER, MANAGER - NOTIFICATIONS
if (
  ["TENANT", "OWNER", "MANAGER"].includes(user.role) &&
  ["notifications", "my-notifications"].includes(currentPage)
) {
  return <NotificationInbox />;
}
if (
  user.role === "ADMIN" &&
  ["maintenance", "maintenance-oversight"].includes(currentPage)
) {
  return <AdminMaintenanceOversight />;
}
// ADMIN - USER MANAGEMENT
if (
  user.role === "ADMIN" &&
  currentPage === "tenants"
) {
  return <AdminManagement roleFilter="TENANT" />;
}

if (
  user.role === "ADMIN" &&
  ["users", "user-management"].includes(currentPage)
) {
  return <AdminManagement />;
}
  // ADMIN - REPORTS & ANALYTICS
if (
  user.role === "ADMIN" &&
  ["reports", "analytics"].includes(currentPage)
) {
  return <AdminManagement initialTab="finance" />;
}

// ADMIN - AUDIT LOGS
if (
  user.role === "ADMIN" &&
  ["audit", "audit-logs"].includes(currentPage)
) {
  return <AdminManagement initialTab="audit" />;
}
    // TENANT_COMPLETION_PACK: dedicated pages, existing dashboards unchanged.
    if (user.role === "TENANT" && currentPage === "profile") return <TenantProfile />;
    if (user.role === "TENANT" && currentPage === "visits") return <TenantVisits />;
    if (user.role === "OWNER" && currentPage === "visits") return <TenantVisits />;
    if (user.role === "TENANT" && currentPage === "vacate") return <TenantVacate />;
    if (user.role === "TENANT" && currentPage === "kyc") return <TenantKYC />;
    if (currentPage === "dashboard") {
  if (user.role === "ADMIN") {
  return (
    <div className="dashboard-grid">
      {Dashboard && <Dashboard />}
      <AdminOperations />
      <AdminManagement />
    </div>
  );
}

  return Dashboard ? <Dashboard /> : null;
}

    if (currentPage === "explore") {
      return <Marketplace />;
    }

    if (user.role === "ADMIN" && currentPage === "owners") {
      return <PropertyOwners />;
    }
    if (user.role === "ADMIN" && currentPage === "approvals") {
        return <ListingApprovals />;
    }
    if (user.role === "OWNER" && currentPage === "properties") {
  return <MyProperties />;
  }
  if (user.role === "OWNER" && currentPage === "bookings") {
  return <BookingApprovals />;
}
    if (user.role === "TENANT" && currentPage === "bookings") {
  return <MyBookings />;
}

    if (user.role === "OWNER" && currentPage === "team") {
      return <OwnerEmployees />;
    }

    return <PendingModule title={currentItem?.label || "Module"} />;
  }

  return (
    <div className={`layout gn-shell ${sidebarCollapsed ? "gn-shell-collapsed" : ""} ${mobileNavOpen ? "gn-nav-open" : ""}`}>
      <aside className="sidebar">

<button
  type="button"
  className="gn-sidebar-collapse"
  onClick={() => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMobileNavOpen(false);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  }}
  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
  aria-expanded={!sidebarCollapsed}
>
  <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
</button>

        <div className="brand">
          G<span>✦</span>
          <div>
            GoyalNest
            <small>PROPERTY & LIVING</small>
          </div>
        </div>

        <div className="role-navigation">
          {sections.map((section) => (
            <div key={section.group}>
              <div className="nav-label">{section.group}</div>

              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    "nav-item " +
                    (currentPage === item.id ? "selected" : "")
                  }
                  onClick={() => changePage(item.id)}
                  title={sidebarCollapsed ? item.label : undefined}
                  aria-label={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="gn-nav-icon" aria-hidden="true">{item.icon}</span><span className="gn-nav-text">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-bottom">
          {/* GOYALNEST_VISIT_HOMEPAGE_V1 */}
          <button type="button" className="nav-item gn-visit-homepage" title="Visit GoyalNest Homepage" onClick={() => { setMobileNavOpen(false); navigate("/"); }}>
            <span aria-hidden="true">⌂</span> &nbsp; Visit Homepage
          </button>
          <span className="eyebrow light">YOUR PORTAL</span>

          <div className="user-mini">
            <span className="avatar">
              {user.name?.charAt(0)}
            </span>

            <span>
              <b>{user.name}</b>
              <small>{roleLabels[user.role]}</small>
            </span>
          </div>

          <button
            className="nav-item"
            type="button"
            onClick={signOut}
          >
            <span className="gn-nav-icon" aria-hidden="true">↳</span><span className="gn-nav-text">Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button type="button" className="gn-mobile-menu" aria-label="Toggle navigation" aria-expanded={mobileNavOpen} onClick={()=>setMobileNavOpen(v=>!v)}>☰</button>
          <div>
            <span className="eyebrow">
              GOYALNEST / {currentPage.toUpperCase()}
            </span>

            <h1>
              {currentPage === "dashboard"
                ? `${roleLabels[user.role]} dashboard`
                : currentItem?.label}
            </h1>
          </div>

          <div className="topbar-right">
            <PortalNotificationBell role={user.role} />
            <span className="date-label">
              A BETTER WAY TO LIVE
            </span>
            <span className="top-avatar">
              {user.name?.charAt(0)}
            </span>
          </div>
        </header>

        {currentPage === "explore" ? (
          renderContent()
        ) : (
          <div className="main-content">
            {currentPage === "dashboard" && (
              <p className="page-intro">
                Welcome back, {user.name?.split(" ")[0]}.
                Here's what's happening in your workspace.
              </p>
            )}

            {user.role === "TENANT" && <RentAlerts />}

{renderContent()}
{currentPage === "dashboard" &&
  user.role !== "ADMIN" && (
    <NotificationInbox />
  )}
          </div>
        )}
      </main>
    </div>
  );

}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ActivityToastHost />
        <Routes>
          <Route path="/" element={<PublicPage />} />
          <Route path="/properties" element={<Marketplace />} />
          <Route path="/properties/:id" element={<PropertyDetails />} />
          <Route path="/login" element={<AuthRoute mode="login" />} />
          <Route path="/register" element={<AuthRoute mode="register" />} />
          <Route
            path="/verify-email"
            element={<AuthRoute mode="verify" />}
          />

          <Route path="/dashboard" element={<DashboardShell />} />
          <Route path="/dashboard/:page" element={<DashboardShell />} />

          <Route path="*" element={<Navigate to="/" replace />} />
          <Route
  path="/forgot-password"
  element={<ForgotPassword />}
/>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
