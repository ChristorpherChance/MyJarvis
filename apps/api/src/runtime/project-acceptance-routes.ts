import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {BusinessError} from '../v1/types.js';
import {RuntimeAccessError,type IdentityRuntime} from './identity.js';
import type {ProjectAcceptanceRuntime} from './project-acceptance-runtime.js';
import {projectAcceptanceListQuerySchema} from './project-acceptance-runtime.js';

export function registerProjectAcceptanceRoutes(app:FastifyInstance,runtime:ProjectAcceptanceRuntime,identity:IdentityRuntime){
 const handle=(fn:(req:any,p:any)=>unknown)=>async(req:any,reply:any)=>{try{const p=identity.principal(req);reply.header('Cache-Control','private, no-store');return {data:await fn(req,p)}}catch(error){if(error instanceof BusinessError)return reply.code(error.status).send({error:{code:error.code,message:error.message}});if(error instanceof RuntimeAccessError)return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});if(error instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_INPUT',message:'项目验收记录或分页格式不正确'}});throw error}};
 const base='/api/v1/projects/:id',projectId=(req:any)=>z.string().trim().min(1).max(200).parse(req.params.id),defectId=(req:any)=>z.string().trim().min(1).max(200).parse(req.params.defectId),query=(req:any)=>projectAcceptanceListQuerySchema.parse(req.query??{});
 app.get(base+'/acceptance',handle((req,p)=>runtime.overview(projectId(req),p)));
 app.get(base+'/defects',handle((req,p)=>runtime.list(projectId(req),req.query??{},p)));
 app.get(base+'/defects/:defectId',handle((req,p)=>runtime.get(projectId(req),defectId(req),query(req),p)));
 app.post(base+'/defects',handle((req,p)=>runtime.create(projectId(req),req.body,p)));
 app.post(base+'/defects/:defectId/commands',handle((req,p)=>runtime.commandDefect(projectId(req),defectId(req),req.body,p)));
 app.get(base+'/releases',handle((req,p)=>runtime.releases(projectId(req),req.query??{},p)));
}
