export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function fail(status,message){throw new HttpError(status,message);}
export function required(condition,message='Invalid request',status=400){if(!condition)fail(status,message);}
export const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
