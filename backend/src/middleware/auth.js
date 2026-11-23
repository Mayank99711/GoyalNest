import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { fail } from "../lib/errors.js";
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies.goyalnest_session;
    if (!token) fail(401, "Please sign in");
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.active) fail(401, "Session invalid");
    // Owner-created employee accounts reuse the MANAGER login role. All staff
    // business reads are served by the explicit, permission-checked workspace.
    if (user.role === "MANAGER") {
      const employee = await prisma.ownerEmployee.findFirst({
        where: { managerUserId: user.id },
        select: { designation: true, permissions: true, active: true },
      });
      if (employee) {
        if (!employee.active) fail(403, "Employee account disabled");
        const path = req.originalUrl.split("?")[0].replace(/\/$/, "");
        const personal = path === "/api/auth/me" ||
          path === "/api/auth/logout" ||
          path === "/api/user-notifications" ||
          (req.method === "GET" && path === "/api/platform-notifications/mine") ||
          (req.method === "POST" && /^\/api\/platform-notifications\/[^/]+\/read$/.test(path)) ||
          /^\/api\/user-notifications\/[^/]+\/read$/.test(path);
        const workspace = path === "/api/staff-workspace" ||
          /^\/api\/staff-workspace\/(properties|rooms|bookings|tenants|maintenance|payments|reports)$/.test(path);
        // No legacy manager operations for staff: their endpoints can expose
        // additional data/actions not covered by the 7 view permissions.
        if (!personal && !workspace) fail(403, "Not permitted for employee workspace");
      }
    }
    req.user = user;
    next();
  } catch (err) {
    next(
      err.status
        ? err
        : Object.assign(new Error("Session expired"), { status: 401 }),
    );
  }
}
export function roles(...allowed) {
  return (req, res, next) =>
    allowed.includes(req.user.role)
      ? next()
      : next(
          Object.assign(new Error("Insufficient permissions"), { status: 403 }),
        );
}
export async function ownerProperty(user, propertyId) {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p || p.ownerId !== user.id) fail(403, "Property not owned by you");
  return p;
}
export async function managerProperty(user, propertyId) {
  if (user.role === "OWNER") return ownerProperty(user, propertyId);
  const a = await prisma.managerAssignment.findUnique({
    where: { managerId_propertyId: { managerId: user.id, propertyId } },
  });
  if (!a) fail(403, "Property not assigned to you");
}
