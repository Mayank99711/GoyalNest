import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
import { notifyUsers } from "../notifications/notify.service.js";

const router = Router();

router.use(authenticate);
router.use(roles("ADMIN"));

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const SLA_HOURS = {
  LOW: 120,
  MEDIUM: 72,
  HIGH: 24,
  URGENT: 4,
};

function isResolved(status) {
  return ["RESOLVED", "CLOSED"].includes(status);
}

// GET /api/admin-maintenance/overview
router.get(
  "/overview",
  asyncRoute(async (req, res) => {
    const tickets = await prisma.maintenanceTicket.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const ticketIds = tickets.map((t) => t.id);

    const tenancyIds = [
      ...new Set(tickets.map((t) => t.tenancyId).filter(Boolean)),
    ];

    const [oversight, tenancies] = await Promise.all([
      prisma.maintenanceOversight.findMany({
        where: { ticketId: { in: ticketIds } },
      }),

      prisma.tenancy.findMany({
        where: { id: { in: tenancyIds } },
        select: {
          id: true,
          tenant: {
            select: { name: true },
          },
          unit: {
            select: {
              label: true,
              propertyId: true,
              property: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const oversightMap = new Map(oversight.map((o) => [o.ticketId, o]));

    const tenancyMap = new Map(tenancies.map((t) => [t.id, t]));

    const managerAssignments = await prisma.managerAssignment.findMany({
      where: {
        propertyId: {
          in: [...new Set(tenancies.map((t) => t.unit.propertyId))],
        },
      },
      select: {
        propertyId: true,
        managerId: true,
      },
    });

    const managerIds = [...new Set(managerAssignments.map((a) => a.managerId))];

    const managers = await prisma.user.findMany({
      where: {
        id: { in: managerIds },
        role: "MANAGER",
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const managerMap = new Map(managers.map((m) => [m.id, m]));

    const assignmentsByProperty = new Map();

    for (const assignment of managerAssignments) {
      if (!assignmentsByProperty.has(assignment.propertyId)) {
        assignmentsByProperty.set(assignment.propertyId, []);
      }

      const manager = managerMap.get(assignment.managerId);

      if (manager) {
        assignmentsByProperty.get(assignment.propertyId).push(manager);
      }
    }

    const now = Date.now();

    const items = tickets.map((ticket) => {
      const tenancy = tenancyMap.get(ticket.tenancyId);
      const record = oversightMap.get(ticket.id);

      const priority = record?.priority || "MEDIUM";

      // Existing tickets use a provisional SLA based
      // on creation time until an Admin saves an SLA.
      const dueAt =
        record?.dueAt ||
        new Date(
          new Date(ticket.createdAt).getTime() + SLA_HOURS[priority] * 3600000,
        );

      const resolved = isResolved(ticket.status);

      return {
        id: ticket.id,
        title: ticket.title || ticket.subject || "Maintenance Request",
        description: ticket.description || "",
        status: ticket.status,
        createdAt: ticket.createdAt,
        tenant: tenancy?.tenant?.name || "Unknown",
        property: tenancy?.unit?.property?.title || "Unknown",
        room: tenancy?.unit?.label || "",
        priority,
        assignedToId: record?.assignedToId || null,
        assignedToName: record?.assignedToId
          ? managerMap.get(record.assignedToId)?.name ||
            "Previously assigned manager"
          : null,
        availableManagers:
          assignmentsByProperty.get(tenancy?.unit?.propertyId) || [],
        dueAt,
        slaConfigured: Boolean(record?.dueAt),
        overdue: !resolved && new Date(dueAt).getTime() < now,
        escalated: record?.escalated || false,
        escalatedAt: record?.escalatedAt || null,
        adminNotes: record?.adminNotes || "",
      };
    });

    const summary = {
      total: items.length,
      open: items.filter((i) => !isResolved(i.status)).length,
      resolved: items.filter((i) => isResolved(i.status)).length,
      overdue: items.filter((i) => i.overdue).length,
      escalated: items.filter((i) => i.escalated).length,
      unassigned: items.filter((i) => !isResolved(i.status) && !i.assignedToId)
        .length,
    };

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      summary,
      tickets: items,
      isSnapshotLimited: tickets.length === 200,
    });
  }),
);

// PATCH /api/admin-maintenance/:id
router.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const { priority, assignedToId, dueAt, escalated, adminNotes } =
      req.body || {};

    required(
      PRIORITIES.includes(priority),
      "Invalid maintenance priority",
      400,
    );

    required(
      assignedToId === null ||
        (typeof assignedToId === "string" && assignedToId.length > 0),
      "Invalid manager assignment",
      400,
    );

    required(
      typeof escalated === "boolean",
      "Escalation must be true or false",
      400,
    );

    required(
      typeof adminNotes === "string" && adminNotes.trim().length <= 1000,
      "Admin notes must be 1000 characters or less",
      400,
    );

    let deadline = null;

    if (dueAt !== null && dueAt !== "") {
      required(
        typeof dueAt === "string" && !Number.isNaN(Date.parse(dueAt)),
        "Invalid SLA deadline",
        400,
      );

      deadline = new Date(dueAt);
    }

    const ticket = await prisma.maintenanceTicket.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        tenancyId: true,
        status: true,
      },
    });

    required(ticket, "Maintenance ticket not found", 404);

    required(
      !isResolved(ticket.status),
      "Resolved tickets cannot be reassigned or escalated",
      409,
    );

    const tenancy = await prisma.tenancy.findUnique({
      where: { id: ticket.tenancyId },
      select: {
        unit: {
          select: { propertyId: true },
        },
      },
    });

    required(tenancy, "Maintenance ticket tenancy not found", 409);

    if (assignedToId) {
      const assignment = await prisma.managerAssignment.findUnique({
        where: {
          managerId_propertyId: {
            managerId: assignedToId,
            propertyId: tenancy.unit.propertyId,
          },
        },
      });

      const manager = await prisma.user.findUnique({
        where: { id: assignedToId },
        select: {
          role: true,
          active: true,
        },
      });

      required(
        assignment && manager?.role === "MANAGER" && manager.active,
        "Manager is not active or assigned to this property",
        403,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Guard against a concurrent maintenance resolution.
      const current = await tx.maintenanceTicket.findUnique({
        where: { id: ticket.id },
        select: { status: true },
      });

      required(
        current && !isResolved(current.status),
        "Ticket was already resolved",
        409,
      );

      const saved = await tx.maintenanceOversight.upsert({
        where: { ticketId: ticket.id },
        create: {
          ticketId: ticket.id,
          priority,
          assignedToId,
          dueAt: deadline,
          escalated,
          escalatedAt: escalated ? new Date() : null,
          adminNotes: adminNotes.trim(),
        },
        update: {
          priority,
          assignedToId,
          dueAt: deadline,
          escalated,
          escalatedAt: escalated ? new Date() : null,
          adminNotes: adminNotes.trim(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_MAINTENANCE_OVERSIGHT_UPDATED",
          entityType: "MaintenanceTicket",
          entityId: ticket.id,
          metadata: {
            priority,
            assignedToId,
            dueAt: deadline?.toISOString() || null,
            escalated,
            adminNotes: adminNotes.trim(),
          },
        },
      });

      const owner=await tx.property.findUnique({where:{id:tenancy.unit.propertyId},select:{ownerId:true}});
      await notifyUsers(tx,{userIds:[owner?.ownerId,...(assignedToId?[assignedToId]:[])],type:'MAINTENANCE_ASSIGNED',referenceId:ticket.id,
        title:escalated?'Maintenance escalation updated':'Maintenance assignment updated',
        message:`Maintenance ${priority.toLowerCase()} priority. ${assignedToId?'Assigned to a Manager.':'No Manager currently assigned.'}`});
      return saved;
    });

    res.json({
      message: "Maintenance oversight updated",
      oversight: result,
    });
  }),
);

export default router;
