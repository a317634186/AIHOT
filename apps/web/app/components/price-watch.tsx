import { useEffect, useState } from 'react';
import { Link } from 'react-router';
/**
 * Price-drop alerts and a local "saved" list. Alerts go through browser push (consent is the
 * subscription) or e-mail (confirmed by a link); the saved list lives in this browser only.
 */
const SAVED_KEY='savlume.saved';
export function savedIds():string[]{try{const v=JSON.parse(localStorage.getItem(SAVED_KEY)??'[]');return Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').slice(0,200):[];}catch{return [];}}
function setSaved(ids:string[]){try{localStorage.setItem(SAVED_KEY,JSON.stringify(ids.slice(0,200)));}catch{}}
export function SaveButton({id,compact}:{id:string;compact?:boolean}){
 const [saved,setSavedState]=useState(false);
 useEffect(()=>{setSavedState(savedIds().includes(id));},[id]);
 const toggle=()=>{const ids=savedIds();const next=ids.includes(id)?ids.filter(x=>x!==id):[id,...ids];setSaved(next);setSavedState(next.includes(id));};
 return <button type="button" className={'db-save'+(saved?' is-saved':'')+(compact?' db-save-compact':'')} onClick={toggle} aria-pressed={saved} aria-label={saved?'Remove from saved':'Save for later'}><svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s-7-4.6-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.4-9.5 9-9.5 9Z"/></svg>{!compact&&<span>{saved?'Saved':'Save'}</span>}</button>;
}
const toKey=(b64:string)=>{const pad='='.repeat((4-b64.length%4)%4);const raw=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
export function WatchPrice({articleId,price}:{articleId:string;price:number|null}){
 const [options,setOptions]=useState<{email:boolean;push:boolean;vapidPublicKey:string}|null>(null);
 const [state,setState]=useState<'idle'|'busy'|'push-on'|'email-sent'|'error'>('idle');
 const [message,setMessage]=useState('');
 const [email,setEmail]=useState('');
 const pushSupported=typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 useEffect(()=>{const c=new AbortController();fetch('/api/site/watch/options',{signal:c.signal}).then(r=>r.ok?r.json():null).then(o=>{if(o&&!c.signal.aborted)setOptions(o);}).catch(()=>{});return ()=>c.abort();},[]);
 useEffect(()=>{if(new URLSearchParams(location.search).get('alert')==='confirmed'){setState('email-sent');setMessage('Your e-mail alert is confirmed.');}},[]);
 if(price===null)return null;
 const enablePush=async()=>{
  if(!options||!pushSupported)return;setState('busy');setMessage('');
  try{
   const permission=await Notification.requestPermission();if(permission!=='granted'){setState('error');setMessage('Notifications were not allowed in this browser.');return;}
   const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
   const sub=(await reg.pushManager.getSubscription())??(await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toKey(options.vapidPublicKey)}));
   const r=await fetch('/api/site/watch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({articleId,channel:'push',subscription:sub.toJSON()})});
   if(!r.ok)throw new Error((await r.json().catch(()=>({})) as {detail?:string}).detail??'Could not save the alert.');
   setState('push-on');setMessage('You will get a notification in this browser when the price drops.');
  }catch(e){setState('error');setMessage(e instanceof Error?e.message:'Could not enable notifications.');}
 };
 const sendEmail=async()=>{
  setState('busy');setMessage('');
  try{const r=await fetch('/api/site/watch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({articleId,channel:'email',email})});
   const data=await r.json().catch(()=>({})) as {detail?:string;confirmed?:boolean};if(!r.ok)throw new Error(data.detail??'Could not save the alert.');
   setState('email-sent');setMessage(data.confirmed?'This e-mail is already confirmed for this offer.':'Check your inbox and click the confirmation link to start the alert.');
  }catch(e){setState('error');setMessage(e instanceof Error?e.message:'Could not save the alert.');}
 };
 return <section className="db-panel db-watch"><div className="db-section-title"><h2>Price-drop alert</h2><span>We check prices every 30 minutes</span></div>
  <p className="db-muted">Get told when this offer drops below its current price. No account needed.</p>
  <div className="db-watch-actions">
   {pushSupported&&<button type="button" className="db-buy" disabled={state==='busy'||state==='push-on'||!options} onClick={()=>void enablePush()}>{state==='push-on'?'Browser alerts on ✓':'Notify me in this browser'}</button>}
   {options?.email&&<form className="db-watch-email" onSubmit={e=>{e.preventDefault();void sendEmail();}}><input type="email" required placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} aria-label="E-mail address for the alert"/><button type="submit" className="db-buy db-buy-secondary" disabled={state==='busy'}>E-mail me</button></form>}
   {!pushSupported&&!options?.email&&<p className="db-muted">Alerts are not available in this browser yet.</p>}
  </div>
  {message&&<p role="status" className={'db-watch-status'+(state==='error'?' is-error':'')}>{message}</p>}
  <p className="db-muted">Alerts link back to this page; you can stop them any time. <Link to="/privacy">How we handle alerts</Link></p>
 </section>;
}
