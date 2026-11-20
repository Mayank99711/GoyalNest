import React,{useEffect,useState} from "react";
import {subscribeActivity} from "../lib/activityFeedback";
import "./ActivityToastHost.css";
export default function ActivityToastHost(){
 const [items,setItems]=useState([]);
 useEffect(()=>{
  const timers=new Map();
  const unsubscribe=subscribeActivity(item=>{
   setItems(old=>[...old.slice(-2),item]);
   timers.set(item.id,setTimeout(()=>{setItems(old=>old.filter(x=>x.id!==item.id));timers.delete(item.id);},5500));
  });
  return ()=>{unsubscribe();timers.forEach(clearTimeout);};
 },[]);
 return <div className="gn-feedback-host" aria-label="Action notifications">{items.map(item=><div className={`gn-feedback-toast gn-feedback-${item.type}`} key={item.id} role={item.type==="error"?"alert":"status"}><span className="gn-feedback-symbol" aria-hidden="true">{item.type==="success"?"✓":item.type==="error"?"!":"i"}</span><div><strong>{item.type==="success"?"Action completed":item.type==="error"?"Action needs attention":"Notice"}</strong><p>{item.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={()=>setItems(old=>old.filter(x=>x.id!==item.id))}>×</button></div>)}</div>;
}
