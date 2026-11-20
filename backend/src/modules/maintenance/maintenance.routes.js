import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles, managerProperty } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
import { notifyUsers, activeManagerIdsForProperty } from "../notifications/notify.service.js";

const r = Router();

r.use(authenticate);

// GET: Tenant, Owner, Manager
r.get(
  "/",
  asyncRoute(async (req, res) => {
    required(req.user.role !== "ADMIN", "Not permitted", 403);

    const where =
      req.user.role === "TENANT"
        ? { tenantId: req.user.id }
        : req.user.role === "OWNER"
          ? {
              tenancy: {
                unit: {
                  property: {
                    ownerId: req.user.id,
                  },
                },
              },
            }
          : {
              tenancy: {
                unit: {
                  property: {
                    assignments: {
                      some: {
                        managerId: req.user.id,
                      },
                    },
                  },
                },
              },
            };

    const tickets = await prisma.maintenanceTicket.findMany({
      where,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        tenancy: {
          include: {
            unit: {
              include: {
                property: {
                  select: {
                    id: true,
                    title: true,
                    city: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const overview = await prisma.maintenanceOversight.findMany({
      where: { ticketId: { in: tickets.map((t) => t.id) } },
      select: {
        ticketId: true, assignedToId: true, priority: true,
        dueAt: true, escalated: true,
      },
    });
    const byTicket = new Map(overview.map((o) => [o.ticketId, o]));
    const managerIds = [...new Set(overview.map((o) => o.assignedToId).filter(Boolean))];
    const managers = await prisma.user.findMany({
      where: { id: { in: managerIds } },
      select: { id: true, name: true },
    });
    const names = new Map(managers.map((m) => [m.id, m.name]));
    res.set("Cache-Control", "private, no-store");
    res.json(tickets.map((ticket) => {
      const assigned = byTicket.get(ticket.id);
      return {
        ...ticket,
        oversight: assigned ? {
          assignedToId: assigned.assignedToId,
          assignedToName: names.get(assigned.assignedToId) || null,
          priority: assigned.priority,
          dueAt: assigned.dueAt,
          escalated: assigned.escalated,
          canUpdate: req.user.role === "OWNER" ||
            (req.user.role === "MANAGER" &&
              (!assigned.assignedToId || assigned.assignedToId === req.user.id)),
        } : {
          assignedToId: null, assignedToName: null,
          priority: "MEDIUM", dueAt: null, escalated: false,
          canUpdate: req.user.role !== "TENANT",
        },
      };
    }));
  }),
);

// POST: Tenant creates complaint
r.post(
  "/",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const tenancyId = String(req.body?.tenancyId || "");

    const title = String(req.body?.title || "").trim();

    const description = String(req.body?.description || "").trim();

    required(
      title.length >= 5 && title.length <= 120,
      "Title must contain 5-120 characters",
      400,
    );

    required(
      description.length >= 10 && description.length <= 2000,
      "Description must contain 10-2000 characters",
      400,
    );

    const tenancy = await prisma.tenancy.findFirst({
      where: {
        id: tenancyId,
        tenantId: req.user.id,
        OR: [
          { status: "ACTIVE" },
          {
            status: "VACATING",
            moveOut: {
              is: {
                requestedDate: {
                  gte: new Date(),
                },
              },
            },
          },
        ],
      },
    });
    required(tenancy, "Active tenancy required", 403);

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.maintenanceTicket.create({
        data: {
          tenantId: req.user.id,
          tenancyId,
          title,
          description,
          status: "OPEN",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MAINTENANCE_CREATED",
          entityType: "MaintenanceTicket",
          entityId: created.id,
          metadata: { tenancyId },
        },
      });
      const linked = await tx.tenancy.findUnique({where:{id:tenancyId},select:{unit:{select:{property:{select:{ownerId:true,title:true}},propertyId:true}}}});
      const managers = await activeManagerIdsForProperty(tx, linked.unit.propertyId);
      await notifyUsers(tx, {
        userIds: [linked.unit.property.ownerId, ...managers], type:'MAINTENANCE_REVIEW', referenceId:created.id,
        title:'New maintenance request',
        message:`Tenant reported "${title}" at ${linked.unit.property.title}. Review and assign the request.`,
      });
      return created;
    });

    res.status(201).json({
      message: "Maintenance request submitted",
      ticket,
    });
  }),
);

// PATCH: Owner/Manager updates complaint
r.patch(
  "/:id",
  roles("OWNER", "MANAGER"),
  asyncRoute(async (req, res) => {
    const ticket = await prisma.maintenanceTicket.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        tenancy: {
          include: {
            unit: true,
          },
        },
      },
    });

    required(ticket, "Ticket not found", 404);

    await managerProperty(req.user, ticket.tenancy.unit.propertyId);

    // Admin-assigned tickets must not be completed by a different manager.
    // Owners retain authority over their own property's tickets.
    if (req.user.role === "MANAGER") {
      const oversight = await prisma.maintenanceOversight.findUnique({
        where: { ticketId: ticket.id },
        select: { assignedToId: true },
      });
      required(
        !oversight?.assignedToId || oversight.assignedToId === req.user.id,
        "This ticket is assigned to another manager",
        403,
      );
    }

    const nextStatus = req.body?.status;

    const transitions = {
      OPEN: ["IN_PROGRESS"],
      IN_PROGRESS: ["RESOLVED"],
      RESOLVED: [],
    };

    required(
      transitions[ticket.status]?.includes(nextStatus),
      `Invalid transition from ${ticket.status} to ${nextStatus}`,
      400,
    );

    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.maintenanceTicket.updateMany({
        where: {
          id: ticket.id,
          status: ticket.status,
        },
        data: {
          status: nextStatus,
        },
      });

      required(changed.count === 1, "Ticket was already updated", 409);

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MAINTENANCE_STATUS_CHANGED",
          entityType: "MaintenanceTicket",
          entityId: ticket.id,
          metadata: { from: ticket.status, to: nextStatus },
        },
      });
      await notifyUsers(tx, {
        userIds: [ticket.tenantId], type:'MAINTENANCE_STATUS', referenceId:ticket.id,
        title: nextStatus === 'RESOLVED' ? 'Maintenance request resolved' : 'Maintenance request in progress',
        message:`Your maintenance request is now ${nextStatus.replaceAll('_',' ').toLowerCase()}.`,
      });
      return tx.maintenanceTicket.findUnique({
        where: {
          id: ticket.id,
        },
      });
    });

    res.json({
      message: "Maintenance status updated",
      ticket: result,
    });
  }),
);

export default r;
