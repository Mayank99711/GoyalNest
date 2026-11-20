export const roleLabels = {
  ADMIN: "Super Admin",
  OWNER: "Property Owner",
  MANAGER: "Property Manager",
  TENANT: "Tenant",
};

export const roleNavigation = {
  ADMIN: [
    {
      group: "WORKSPACE",
      items: [
        { id: "dashboard", label: "Overview", icon: "◈" },
        { id: "owners", label: "Property Owners", icon: "♙" },
        { id: "properties", label: "All Properties", icon: "⌂" },
        { id: "categories", label: "Property Categories", icon: "▦" },
        { id: "approvals", label: "Listing Approvals", icon: "✓" },
        { id: "tenants", label: "Tenant Management", icon: "♧" },
      ],
    },
    {
      group: "PLATFORM MANAGEMENT",
      items: [
        { id: "subscriptions", label: "Subscriptions & Plans", icon: "▤" },
        { id: "payments", label: "Payments & Transactions", icon: "₹" },
        { id: "agreements", label: "Agreements & KYC", icon: "▧" },
        { id: "maintenance", label: "Maintenance Oversight", icon: "⚒" },
        { id: "complaints", label: "Complaints & Disputes", icon: "!" },
      ],
    },
    {
      group: "SYSTEM",
      items: [
        { id: "reports", label: "Reports & Analytics", icon: "▥" },
        { id: "notifications", label: "Notifications", icon: "♢" },
        { id: "permissions", label: "Roles & Permissions", icon: "⊞" },
        { id: "settings", label: "Platform Settings", icon: "⚙" },
        { id: "audit", label: "Audit Logs", icon: "≡" },
      ],
    },
  ],

  OWNER: [
    {
      group: "PROPERTY MANAGEMENT",
      items: [
        { id: "dashboard", label: "Overview", icon: "◈" },
        { id: "properties", label: "My Properties", icon: "⌂" },
        { id: "units", label: "Rooms, Beds & Units", icon: "▦" },
        { id: "bookings", label: "Booking Approvals", icon: "✓" },
        { id: "visits", label: "Property Visits", icon: "◇" },
        { id: "employees", label: "Employees, Attendance & Payroll", icon: "▤" },
        { id: "tenants", label: "Tenant Management", icon: "♧" },
        {
          id: "my-disputes",
          label: "My Disputes",
          icon: "⚖️",
        },
      ],
    },
    {
      group: "FINANCE & OPERATIONS",
      items: [
        { id: "rent", label: "Rent & Invoices", icon: "₹" },
        { id: "deposits", label: "Deposits & Refunds", icon: "▤" },
        { id: "agreements", label: "Agreements", icon: "▧" },
        { id: "maintenance", label: "Maintenance", icon: "⚒" },

        { id: "subscriptions", label: "My Subscription", icon: "◉" },
        { id: "reports", label: "Reports & Analytics", icon: "▥" },
        { id: "notifications", label: "Notifications & Actions", icon: "♢" },
      ],
    },
  ],

  MANAGER: [
    {
      group: "OPERATIONS",
      items: [
        { id: "dashboard", label: "Overview", icon: "◈" },
        { id: "properties", label: "Assigned Properties", icon: "⌂" },
        { id: "occupancy", label: "Rooms & Occupancy", icon: "▦" },
        { id: "tenants", label: "Tenant Records", icon: "♧" },
        { id: "checkin", label: "Check-in / Check-out", icon: "✓" },
        { id: "rent", label: "Rent Collection", icon: "₹" },
        { id: "maintenance", label: "Maintenance Tickets", icon: "⚒" },

        { id: "agreements", label: "Agreements", icon: "▧" },
        { id: "reports", label: "Daily Reports", icon: "▥" },
        { id: "notifications", label: "Notifications & Actions", icon: "♢" },
      ],
    },
  ],

  TENANT: [
    {
      group: "MY LIVING",
      items: [
        { id: "dashboard", label: "Overview", icon: "◈" },
        { id: "explore", label: "Explore Properties", icon: "⌂" },
        { id: "visits", label: "Property Visits", icon: "◇" },
        { id: "bookings", label: "My Bookings", icon: "✓" },
        { id: "tenancy", label: "My Tenancy", icon: "▦" },
        { id: "rent", label: "Rent & Payments", icon: "₹" },
        { id: "maintenance", label: "Maintenance Requests", icon: "⚒" },
        {
          id: "my-disputes",
          label: "My Disputes",
          icon: "⚖️",
        },
        { id: "agreements", label: "Agreements", icon: "▧" },
        { id: "kyc", label: "KYC & Documents", icon: "▤" },
        { id: "vacate", label: "Vacate Requests", icon: "↳" },
        { id: "notifications", label: "Notifications", icon: "♢" },
        { id: "profile", label: "Profile & Settings", icon: "⚙" },
      ],
    },
  ],
};

export function findNavigationItem(role, page) {
  return roleNavigation[role]
    ?.flatMap((section) => section.items)
    .find((item) => item.id === page);
}
