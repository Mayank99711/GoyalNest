import {Router} from "express";
import {z} from "zod";
import {prisma} from "../../config/prisma.js";
import {authenticate,roles} from "../../middleware/auth.js";
import {asyncRoute,required} from "../../lib/errors.js";
import { notifyUsers, activeUserIdsByRole } from "../notifications/notify.service.js";
function parseInput(schema,value){const parsed=schema.safeParse(value);required(parsed.success,"Invalid request data",400);return parsed.data;}
const router=Router();
const schema=z.object({name:z.string().trim().min(2).max(70)});
router.get("/",asyncRoute(async(req,res)=>res.json(await prisma.propertyCategory.findMany({where:{active:true},orderBy:{name:"asc"}}))));
router.use(authenticate);
router.get("/admin",roles("ADMIN"),asyncRoute(async(req,res)=>res.json(await prisma.propertyCategory.findMany({orderBy:{name:"asc"},include:{_count:{select:{properties:true}}}}))));
router.post("/admin",roles("ADMIN"),asyncRoute(async(req,res)=>{
 const data=parseInput(schema,req.body);
 res.status(201).json(await prisma.propertyCategory.create({data}));
}));
router.patch("/admin/:id",roles("ADMIN"),asyncRoute(async(req,res)=>{
 const data=parseInput(z.object({name:z.string().trim().min(2).max(70).optional(),active:z.boolean().optional()}).strict(),req.body);
 required(Object.keys(data).length>0,"No changes provided",400);
 res.json(await prisma.propertyCategory.update({where:{id:req.params.id},data}));
}));
router.delete("/admin/:id",roles("ADMIN"),asyncRoute(async(req,res)=>{
 // Soft delete preserves historical property associations.
 res.json(await prisma.propertyCategory.update({where:{id:req.params.id},data:{active:false}}));
}));
router.get("/requests",roles("OWNER"),asyncRoute(async(req,res)=>res.json(await prisma.categoryRequest.findMany({where:{ownerId:req.user.id},orderBy:{createdAt:"desc"}}))));
router.post("/requests",roles("OWNER"),asyncRoute(async(req,res)=>{
 const data=parseInput(z.object({name:z.string().trim().min(2).max(70),reason:z.string().max(500).optional()}),req.body);
 const created=await prisma.$transaction(async tx=>{
   const request=await tx.categoryRequest.create({data:{...data,ownerId:req.user.id}});
   await notifyUsers(tx,{userIds:await activeUserIdsByRole(tx,'ADMIN'),type:'CATEGORY_REVIEW',referenceId:request.id,
     title:'New property category request',message:`An Owner requested category: ${data.name}. Review the request.`});
   return request;
 });
 res.status(201).json(created);
}));
router.get("/admin/requests",roles("ADMIN"),asyncRoute(async(req,res)=>{
 const requests=await prisma.categoryRequest.findMany({orderBy:{createdAt:"desc"}});
 const ownerIds=[...new Set(requests.map(r=>r.ownerId).filter(Boolean))];
 const users=ownerIds.length ? await prisma.user.findMany({where:{id:{in:ownerIds}},select:{id:true,name:true,email:true}}) : [];
 const byId=new Map(users.map(u=>[u.id,u]));
 res.json(requests.map(request=>({...request,requestedBy:byId.get(request.ownerId)||null})));
}));
router.patch("/admin/requests/:id",roles("ADMIN"),asyncRoute(async(req,res)=>{
 const data=parseInput(z.object({approve:z.boolean(),adminNote:z.string().max(500).optional()}),req.body);
 const result=await prisma.$transaction(async tx=>{
   const request=await tx.categoryRequest.findUnique({where:{id:req.params.id}});
   required(request && request.status==="PENDING","Request already reviewed",409);
   let category=null;
   if(data.approve){category=await tx.propertyCategory.upsert({where:{name:request.name},create:{name:request.name},update:{active:true}});}
   const updated=await tx.categoryRequest.update({where:{id:request.id},data:{status:data.approve?"APPROVED":"REJECTED",categoryId:category?.id,adminNote:data.adminNote||"",reviewedAt:new Date()}});
   await notifyUsers(tx,{userIds:[request.ownerId],type:'CATEGORY_DECISION',referenceId:request.id,
     title:`Category request ${updated.status.toLowerCase()}`,message:`Your category request for ${request.name} is ${updated.status.toLowerCase()}.`});
   return updated;
 });
 res.json(result);
}));
export default router;
