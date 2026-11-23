import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, fail } from "../../lib/errors.js";

const router = Router();
const rights = ["properties.view", "rooms.view", "bookings.view", "tenants.view", "maintenance.view", "payments.view", "reports.view"];
const modules = Object.fromEntries(rights.map(right => [right.split(".")[0], right]));
router.use(authenticate, roles("MANAGER"));
router.use(asyncRoute(async (req, _res, next) => {
  const employee = await prisma.ownerEmployee.findFirst({
    where: { managerUserId: req.user.id, active: true },
    select: { designation: true, permissions: true },
  });
  if (!employee) fail(403, "Employee workspace unavailable");
  const assignments = await prisma.managerAssignment.findMany({
    where: { managerId: req.user.id, property: { owner: { active: true } } },
    select: { propertyId: true },
  });
  req.staff = {
    permissions: Array.isArray(employee.permissions) ? employee.permissions.filter(p => rights.includes(p)) : [],
    ids: assignments.map(x => x.propertyId),
  };
  next();
}));
const table = (req, key, records) => {
  if (!req.staff.permissions.includes(modules[key])) fail(403, "Access not granted by Project Owner");
  return records;
};
router.get("/", (req, res) => {
  res.set("Cache-Control", "private, no-store");
  res.json({ assignedProperties: req.staff.ids.length, permissions: req.staff.permissions });
});
router.get("/:section", asyncRoute(async (req, res) => {
  const section = req.params.section;
  table(req, section, null);
  const ids = req.staff.ids;
  const whereUnit = { unit: { propertyId: { in: ids } } };
  let rows;
  switch (section) {
    case "properties":
      rows = await prisma.property.findMany({ where: { id: { in: ids }, owner: { active: true } }, select: { id: true, title: true, city: true, locality: true, status: true }, take: 200 });
      break;
    case "rooms":
      rows = await prisma.unit.findMany({ where: { propertyId: { in: ids } }, select: { id: true, label: true, capacity: true, active: true, property: { select: { title: true } } }, take: 500 });
      break;
    case "bookings":
      rows = await prisma.booking.findMany({ where: whereUnit, select: { id: true, status: true, moveIn: true, createdAt: true, unit: { select: { label: true, property: { select: { title: true } } } } }, orderBy: { createdAt: "desc" }, take: 200 });
      break;
    case "tenants":
      rows = await prisma.tenancy.findMany({ where: whereUnit, select: { id: true, status: true, startDate: true, tenant: { select: { name: true } }, unit: { select: { label: true, property: { select: { title: true } } } } }, take: 200 });
      break;
    case "maintenance":
      rows = await prisma.maintenanceTicket.findMany({ where: { tenancy: whereUnit }, select: { id: true, title: true, status: true, createdAt: true, tenancy: { select: { unit: { select: { label: true, property: { select: { title: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 200 });
      break;
    case "payments":
      rows = await prisma.payment.findMany({ where: { tenancy: whereUnit }, select: { id: true, amount: true, kind: true, status: true, createdAt: true, tenancy: { select: { unit: { select: { label: true, property: { select: { title: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 200 });
      break;
    case "reports": {
      const [properties, rooms, tenants, openMaintenance] = await Promise.all([
        prisma.property.count({ where: { id: { in: ids } } }),
        prisma.unit.count({ where: { propertyId: { in: ids } } }),
        prisma.tenancy.count({ where: whereUnit }),
        prisma.maintenanceTicket.count({ where: { tenancy: whereUnit, status: "OPEN" } }),
      ]);
      rows = [{ properties, rooms, tenancies: tenants, openMaintenance }];
      break;
    }
    default: fail(404, "Unknown workspace section");
  }
  res.set("Cache-Control", "private, no-store");
  res.json({ rows });
}));
export default router;
