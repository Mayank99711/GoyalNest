const KEY='goyalnest-active-portal';
export function currentPortal(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}}
export function claimPortal(role,email){const current=currentPortal();if(current&&current.role!==role)return false;localStorage.setItem(KEY,JSON.stringify({role,email}));return true;}
export function clearPortal(){localStorage.removeItem(KEY);}
export function subscribePortalChanges(fn){const onStorage=e=>{if(e.key===KEY)fn(currentPortal());};window.addEventListener('storage',onStorage);return()=>window.removeEventListener('storage',onStorage);}
