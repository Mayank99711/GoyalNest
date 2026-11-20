// Centralized request feedback for authenticated mutations. Never report success on HTTP failures.
import { recordActivity } from "./activityFeedback";
export async function api(path,options={}){
 const method=String(options.method||"GET").toUpperCase();
 const mutates=["POST","PUT","PATCH","DELETE"].includes(method);
 const shouldNotify=mutates && !/^\/(auth|secure-checkout\/reconcile|user-notifications\/read)/.test(path);
 let response;
 try {
  response=await fetch('/api'+path,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options,body:options.body?JSON.stringify(options.body):undefined});
 } catch (err) {
  if(shouldNotify)recordActivity({type:"error",message:"Network request failed. Check your connection and retry."});
  throw err;
 }
 const data=await response.json().catch(()=>({}));
 if(!response.ok){
  const message=String(data.error||`Request failed (${response.status})`);
  if(shouldNotify)recordActivity({type:"error",message});
  throw Error(message);
 }
 if(shouldNotify){
  const section=path.split("/").filter(Boolean)[0]?.replaceAll("-"," ")||"Record";
  const safeMessage=typeof data.message==="string" && data.message.length<180 ? data.message : `${section.charAt(0).toUpperCase()+section.slice(1)} request completed successfully.`;
  recordActivity({type:"success",message:safeMessage});
 }
 return data;
}
