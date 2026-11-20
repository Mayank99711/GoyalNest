// Memory-only activity store: not a financial audit log or server notification history.
const entries=[];
const listeners=new Set();
export function recordActivity({type="info",message}) {
 const item={id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,type,message:String(message||"Action completed").slice(0,240),at:new Date().toISOString()};
 entries.unshift(item);if(entries.length>20)entries.pop();
 listeners.forEach(fn=>fn(item));return item;
}
export const getSessionActivity=()=>entries.slice();
export function subscribeActivity(fn){listeners.add(fn);return()=>listeners.delete(fn);}
