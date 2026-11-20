import { z } from "zod";
import { Router } from "express";
import { notifyUsers, activeUserIdsByRole } from "../notifications/notify.service.js";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles, ownerProperty } from "../../middleware/auth.js";
import { asyncRoute, required, fail } from "../../lib/errors.js";
import { checkListingSubscription } from "./properties.service.js";
const r = Router();
r.get("/locations", asyncRoute(async (req,res)=>{
 const items=await prisma.property.findMany({where:{status:"PUBLISHED",active:true},select:{city:true,locality:true}});
 const unique=new Map();
 for(const item of items){for(const value of [item.city,item.locality ? `${item.locality}, ${item.city}` : ""]){const label=String(value||"").trim();if(label && !unique.has(label.toLowerCase())) unique.set(label.toLowerCase(),label);}}
 res.json([...unique.values()].sort((a,b)=>a.localeCompare(b)));
}));
r.get(
  "/public",
  asyncRoute(async (req, res) => {
    const where = {
      status: "PUBLISHED",
      active: true,
      ...(req.query.categoryId ? {categoryId:String(req.query.categoryId)} : {}),
      ...(req.query.city ? (() => {
        const query=String(req.query.city).trim();
        if(query.includes(",")){
          const [locality,...cityParts]=query.split(",");
          return {AND:[{locality:{contains:locality.trim(),mode:"insensitive"}},{city:{contains:cityParts.join(",").trim(),mode:"insensitive"}}]};
        }
        return {OR:[{city:{contains:query,mode:"insensitive"}},{locality:{contains:query,mode:"insensitive"}}]};
      })() : {}),
    };
    res.json(
      await prisma.property.findMany({
        where,
        include: {
          units: true,
          category: {select:{id:true,name:true}},
          images: {
            orderBy: { createdAt: "asc" },
          },
        },
        take: 60,
        orderBy: { createdAt: "desc" },
      }),
    );
  }),
);
r.get(
  "/public/:id",
  asyncRoute(async (req, res) => {
    const p = await prisma.property.findFirst({
      where: { id: req.params.id, status: "PUBLISHED", active: true },
      include: {
        units: true,
        category: { select: { id: true, name: true } },
        images: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
    required(p, "Property not found", 404);
    const counts = await prisma.tenancy.groupBy({
      by: ["unitId"],
      where: {
        unitId: { in: p.units.map(unit => unit.id) },
        status: { in: ["ACTIVE", "PENDING_PAYMENT", "VACATING"] },
      },
      _count: { _all: true },
    });
    const used = new Map(counts.map(row => [row.unitId, row._count._all]));
    res.json({
      ...p,
      units: p.units.map(unit => ({
        ...unit,
        availableSlots: unit.active ? Math.max(0, unit.capacity - (used.get(unit.id) || 0)) : 0,
      })),
    });
  }),
);
r.use(authenticate);

r.get(
  "/mine",
  roles("OWNER", "MANAGER"),
  asyncRoute(async (req, res) => {
    const where =
      req.user.role === "OWNER"
        ? { ownerId: req.user.id }
        : {
            assignments: {
              some: { managerId: req.user.id },
            },
          };

    const properties = await prisma.property.findMany({
      where,
      include: {
        units: true,
        images: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(properties);
  }),
);

r.post(
  "/",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const {
      title,
      description,
      city,
      address,
      type,
      locality,
      amenities,
      genderPreference,
      imageUrl,
      categoryId,
    } = req.body;
    required(
      title &&
        city &&
        address &&
        ["PG", "HOSTEL", "APARTMENT", "FLAT", "COMMERCIAL", "SHARED"].includes(
          type,
        ),
      "Required property information missing",
    );
    if (categoryId) {
      const category=await prisma.propertyCategory.findFirst({where:{id:categoryId,active:true}});
      required(category,"Invalid or inactive category",400);
    }
    const p = await prisma.property.create({
      data: {
        ownerId: req.user.id,
        title,
        description: description || "",
        city,
        address,
        type,
        locality: locality || "",
        amenities: amenities || "",
        genderPreference: genderPreference || "ANY",
        imageUrl: imageUrl || null,
        categoryId: categoryId || null,
      },
    });
    res.status(201).json(p);
  }),
);
const editPropertySchema = z
  .object({
    title: z.string().trim().min(2).max(150),
    type: z.enum(["PG", "HOSTEL", "APARTMENT", "FLAT", "COMMERCIAL", "SHARED"]),
    city: z.string().trim().min(2).max(100),
    locality: z.string().trim().max(150),
    address: z.string().trim().min(5).max(500),
    description: z.string().trim().max(3000),
    amenities: z.string().trim().max(2000),
    categoryId: z.string().nullable().optional(),
  })
  .strict();

r.patch(
  "/:id",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const parsed = editPropertySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid property details",
        details: parsed.error.flatten(),
      });
    }

    if (parsed.data.categoryId) {
      required(await prisma.propertyCategory.findFirst({where:{id:parsed.data.categoryId,active:true}}),"Invalid category",400);
    }
    const result = await prisma.$transaction(async (tx) => {
      const property = await tx.property.findFirst({
        where: {
          id: req.params.id,
          ownerId: req.user.id,
        },
      });

      if (!property) {
        return {
          error: "Property not found",
          status: 404,
        };
      }

      if (property.status === "PENDING") {
        return {
          error: "Property is under Admin review. Please wait for a decision.",
          status: 409,
        };
      }

      if (!["DRAFT", "REJECTED", "PUBLISHED"].includes(property.status)) {
        return {
          error: "This property cannot be edited in its current status.",
          status: 409,
        };
      }

      const changed = Object.keys(parsed.data).some((key)=>{
        const fallback=key==="categoryId" ? null : "";
        return (property[key] ?? fallback) !== (parsed.data[key] ?? fallback);
      });

      if (!changed) {
        return { property };
      }

      const nextStatus =
        property.status === "PUBLISHED"
          ? "PENDING"
          : property.status === "REJECTED"
            ? "DRAFT"
            : property.status;

      const updated = await tx.property.updateMany({
        where: {
          id: property.id,
          ownerId: req.user.id,
          status: property.status,
        },
        data: {
          ...parsed.data,
          status: nextStatus,
        },
      });

      if (updated.count !== 1) {
        return {
          error: "Property changed. Refresh and try again.",
          status: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "OWNER_PROPERTY_UPDATED",
          entityType: "Property",
          entityId: property.id,
          metadata: {
            previousStatus: property.status,
            newStatus: nextStatus,
            fields: Object.keys(parsed.data),
          },
        },
      });

      return {
        property: await tx.property.findUnique({
          where: { id: property.id },
        }),
      };
    });

    if (result.error) {
      return res.status(result.status).json({
        error: result.error,
      });
    }

    res.json(result);
  }),
);
r.patch("/:id/availability", roles("OWNER"), asyncRoute(async(req,res)=>{
 required(typeof req.body.active === "boolean","active must be true or false",400);
 const current=await ownerProperty(req.user,req.params.id);
 if (req.body.active && current.status !== "PUBLISHED" && current.status !== "DRAFT") {
   required(false,"Cannot activate a listing awaiting review or rejected",409);
 }
 const updated=await prisma.property.update({where:{id:current.id},data:{active:req.body.active}});
 await prisma.auditLog.create({data:{actorId:req.user.id,action:"PROPERTY_AVAILABILITY_CHANGED",entityType:"Property",entityId:current.id,metadata:{active:updated.active}}});
 res.json(updated);
}));
r.post(
  "/:id/units",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    await ownerProperty(req.user, req.params.id);
    const { label, bhk, capacity, rent, depositAmount } = req.body;
    required(
      label &&
        Number.isInteger(+rent) &&
        +rent > 0 &&
        Number.isInteger(+capacity) &&
        +capacity > 0,
      "Invalid unit details",
    );
    res.status(201).json(
      await prisma.unit.create({
        data: {
          propertyId: req.params.id,
          label,
          bhk: bhk ? Number(bhk) : null,
          capacity: Number(capacity),
          rent: Number(rent),
          depositAmount: Number(depositAmount || 0),
        },
      }),
    );
  }),
);
r.post(
  "/:id/submit",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const result = await prisma.$transaction(
      async (tx) => {
        const property = await tx.property.findFirst({
          where: { id: req.params.id, ownerId: req.user.id },
          select: { id: true, status: true },
        });
        required(property, "Property not found", 404);
        required(
          ["DRAFT", "REJECTED"].includes(property.status),
          "Only draft or rejected properties can be submitted",
          409,
        );
        await checkListingSubscription(req.user.id, tx);
        const countUnits = await tx.unit.count({
          where: { propertyId: property.id, active: true },
        });
        required(countUnits > 0, "Add at least one active unit");
        const changed = await tx.property.updateMany({
          where: {
            id: property.id,
            ownerId: req.user.id,
            status: property.status,
          },
          data: { status: "PENDING" },
        });
        required(
          changed.count === 1,
          "Property changed. Refresh and retry",
          409,
        );
        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "OWNER_PROPERTY_SUBMITTED",
            entityType: "Property",
            entityId: property.id,
            metadata: { previousStatus: property.status, status: "PENDING" },
          },
        });
        const admins = await activeUserIdsByRole(tx, 'ADMIN');
        await notifyUsers(tx, {
          userIds: admins, type:'PROPERTY_MODERATION', referenceId:property.id,
          title:'Property awaiting moderation',
          message:`An Owner submitted a property for listing review. Property ID: ${property.id}.`,
        });
        return tx.property.findUnique({ where: { id: property.id } });
      },
      { isolationLevel: "Serializable" },
    );
    res.json(result);
  }),
);
export default r;
