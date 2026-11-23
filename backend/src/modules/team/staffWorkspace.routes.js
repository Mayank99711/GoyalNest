import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, fail, required } from "../../lib/errors.js";
import { notifyUsers } from "../notifications/notify.service.js";

const router = Router();
const rights = ["properties.view", "rooms.view", "bookings.view", "tenants.view", "maintenance.view", "payments.view", "reports.view"];
const modules = Object.fromEntries(rights.map(right => [right.split(".")[0], right]));
router.use(authenticate, roles("MANAGER"));
router.use(asyncRoute(async (req, _res, next) => {
  const employee = await prisma.ownerEmployee.findFirst({
    where: { managerUserId: req.user.id, active: true },
    select: { id: true, ownerId: true, designation: true, permissions: true },
  });
  if (!employee) fail(403, "Employee workspace unavailable");
  const assignments = await prisma.managerAssignment.findMany({
    where: { managerId: req.user.id, property: { owner: { active: true } } },
    select: { propertyId: true },
  });
  req.staff = {
    employeeId: employee.id, ownerId: employee.ownerId, designation: employee.designation,
    permissions: Array.isArray(employee.permissions) ? employee.permissions.filter(p => rights.includes(p)) : [],
    ids: assignments.map(x => x.propertyId),
  };
  next();
}));

// Attendance is an employee's own check-in, never an owner-certified payroll approval.
// IST calendar date is used consistently to avoid client locale/UTC date rollovers.
const istDate = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const validPeriod = p => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ""));
const range = period => ({
  gte: new Date(`${period}-01T00:00:00.000Z`),
  lt: new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1)),
});
router.get("/me/attendance", asyncRoute(async (req, res) => {
  const period = String(req.query.period || istDate().slice(0, 7));
  required(validPeriod(period), "Invalid attendance month", 400);
  const rows = await prisma.employeeAttendance.findMany({
    where: { employeeId: req.staff.employeeId, ownerId: req.staff.ownerId, workDate: range(period) },
    select: { id: true, workDate: true, status: true, note: true, updatedAt: true },
    orderBy: { workDate: "desc" }, take: 31,
  });
  res.set("Cache-Control", "private, no-store");
  const requests = await prisma.employeeAttendanceRequest.findMany({
    where: { employeeId: req.staff.employeeId, ownerId: req.staff.ownerId, workDate: range(period) },
    select: { id: true, workDate: true, status: true, requestedAt: true, reviewedAt: true, reviewNote: true },
    orderBy: { workDate: "desc" }, take: 31,
  });
  res.json({ period, timezone: "Asia/Kolkata", rows, requests });
}));
router.post("/me/attendance", asyncRoute(async (req, res) => {
  // Submission is a request, not payroll-eligible attendance.
  const today = istDate();
  required(req.body && Object.keys(req.body).every(k => k === "workDate") &&
    (!req.body.workDate || req.body.workDate === today), "Only today's attendance can be requested", 400);
  const day = new Date(`${today}T00:00:00.000Z`);
  const existing = await prisma.employeeAttendance.findUnique({
    where: { employeeId_workDate: { employeeId: req.staff.employeeId, workDate: day } },
  });
  required(!existing, "Attendance already recorded for today; ask Project Owner for a correction", 409);
  const previous = await prisma.employeeAttendanceRequest.findUnique({
    where: { employeeId_workDate: { employeeId: req.staff.employeeId, workDate: day } },
  });
  required(!previous, "Attendance request already submitted today", 409);
  let row;
  try {
    row = await prisma.$transaction(async tx => {
      const created = await tx.employeeAttendanceRequest.create({ data: {
        employeeId: req.staff.employeeId, ownerId: req.staff.ownerId, workDate: day, status: "PENDING",
      }});
      await notifyUsers(tx, {userIds: [req.staff.ownerId], type: "EMPLOYEE_ATTENDANCE_PENDING", referenceId: created.id,
        title: "Attendance approval needed", message: `${req.staff.designation} requested attendance for ${today}. Review in Employee Management > Attendance.`});
      return created;
    });
  } catch (e) { if (e.code === "P2002") fail(409, "Attendance request already submitted today"); throw e; }
  res.set("Cache-Control", "private, no-store");
  res.status(201).json({ id: row.id, workDate: row.workDate, status: "PENDING", message: "Attendance request submitted for Project Owner approval; not counted in payroll yet" });
}));
router.get("/me/payroll", asyncRoute(async (req, res) => {
  const rows = await prisma.salaryRecord.findMany({
    where: { ownerId: req.staff.ownerId, employeeId: req.staff.employeeId },
    select: { id: true, period: true, basic: true, allowance: true, deduction: true, status: true, paidAt: true, note: true, createdAt: true },
    orderBy: [{ period: "desc" }, { createdAt: "desc" }], take: 60,
  });
  res.set("Cache-Control", "private, no-store");
  res.json({ rows });
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
