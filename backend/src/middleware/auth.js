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
