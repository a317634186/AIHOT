import { useEffect, useRef, useState } from 'react';
import { cleanPromoCode } from '@aihot/contracts/shopping-dedup';
import { truncateAtWord } from '@aihot/contracts/shopping';

interface AssistantDeal {
 id:string;title:string;price:number;listPrice:number|null;discountPercent:number|null;priceType:'active-deal'|'regular-price';promoCode:string|null;
 retailer:string;priceStatus:'retailer-verified'|'last-verified'|'source-reported';imageUrl:string|null;url:string;
}
interface AssistantMessage {role:'user'|'assistant';content:string;products?:AssistantDeal[]}
const samples=['Earbuds under $50','Robot vacuum for pet hair','MagSafe power bank','Air fryer under $80'];
const money=(amount:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(amount);
const assistantImageAlt=(deal:AssistantDeal)=>{
 const suffix=` — ${money(deal.price)} ${deal.discountPercent?`Deal (${deal.discountPercent}% Off)`:'Offer'} at ${deal.retailer||'retailer'}`;
 return truncateAtWord(deal.title,55)+suffix;
};

function DealFinderMark() {
 return <span className="db-deal-finder-icon" aria-hidden="true"><svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5h9l4 4v7H3z"/><path d="M12 4.5v4h4"/><circle cx="7.2" cy="11.2" r="2"/><path d="m8.8 12.8 1.8 1.8"/></svg></span>;
}

export function AiShoppingAssistant(){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[messages,setMessages]=useState<AssistantMessage[]>([{role:'assistant',content:"Hi! I'm your Savlume Deal Finder. Tell me what you're looking for, your target budget, or must-have features, and I'll find current deals for you."}]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const end=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(open){document.body.style.overflow='hidden';input.current?.focus();}else document.body.style.overflow='';return()=>{document.body.style.overflow='';};},[open]);
 useEffect(()=>{end.current?.scrollIntoView({block:'end',behavior:'smooth'});},[messages,busy]);
 useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)setOpen(false);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[open,busy]);
 async function ask(raw:string){
  const content=raw.trim().slice(0,300);if(!content||busy)return;
  setError('');setQuery('');setBusy(true);
  const next=[...messages,{role:'user' as const,content}];setMessages(next);
  try{
   const response=await fetch('/api/ai-assistant',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content}]})});
   const body=await response.json() as {reply?:string;products?:AssistantDeal[];error?:string};
   if(!response.ok)throw new Error(body.error??'Could not search current deals.');
   setMessages(previous=>[...previous,{role:'assistant',content:body.reply??'I could not find a clear match.',products:Array.isArray(body.products)?body.products:[]}]);
  }catch(caught){setError(caught instanceof Error?caught.message:'The assistant is temporarily unavailable.');}
  finally{setBusy(false);}
 }
 return <>
  <button type="button" className="db-ai-assistant-trigger" aria-label="Deal Finder" onClick={()=>setOpen(true)}><DealFinderMark/>{' '}<span className="db-ai-trigger-full">Deal Finder</span>{' '}<span className="db-ai-trigger-short">Deal Finder</span></button>{' '}
  <button type="button" className="db-ai-assistant-fab" aria-label="Open Deal Finder" onClick={()=>setOpen(true)}><DealFinderMark/></button>
  {open&&<div className="db-ai-assistant-overlay">
   <button type="button" className="db-ai-assistant-backdrop" aria-label="Close Deal Finder" onClick={()=>{if(!busy)setOpen(false);}}/>
   <section className="db-ai-assistant-drawer" role="dialog" aria-modal="true" aria-labelledby="db-ai-assistant-title">
    <header className="db-ai-assistant-header"><div><p className="db-eyebrow">SAVLUME SHOPPING HELP</p><h2 id="db-ai-assistant-title">Deal Finder</h2><p>Recommendations use current offers in Savlume’s deal feed.</p></div><button type="button" aria-label="Close" onClick={()=>setOpen(false)}>×</button></header>
    <div className="db-ai-assistant-messages" aria-live="polite">
     {messages.map((message,index)=><div className={'db-ai-message '+message.role} key={index}><p>{message.content}</p>{message.products?.length? <div className="db-ai-products">{message.products.map(deal=><article className="db-ai-product" key={deal.id}>
      {deal.imageUrl?<img src={deal.imageUrl} alt={assistantImageAlt(deal)} loading="lazy" decoding="async"/>:<div className="db-ai-product-placeholder" aria-hidden="true">{deal.retailer}</div>}
      <div className="db-ai-product-info"><a className="db-ai-product-title" href={'/items/'+deal.id}>{deal.title}</a><div className="db-ai-price-line"><strong className={deal.priceType==='active-deal'?'db-ai-price-active':'db-ai-price-neutral'}>{money(deal.price)}</strong>{deal.listPrice!==null&&deal.listPrice>deal.price&&<s className="db-ai-price-was">{money(deal.listPrice)}</s>}</div>{deal.promoCode&&cleanPromoCode(deal.promoCode)&&<small className="db-ai-promo">Code {cleanPromoCode(deal.promoCode)}</small>}<small className="db-ai-price-status">{deal.priceStatus==='retailer-verified'?'Retailer verified':deal.priceStatus==='last-verified'?'Last retailer verification · recheck':'Source-reported price'}</small><a className="db-ai-outbound" href={deal.url} target="_blank" rel="nofollow sponsored noopener noreferrer">{deal.retailer.toLowerCase().includes('amazon')?'View on Amazon':'View Deal'} ↗</a></div>
     </article>)}</div>:null}</div>)}
     {busy&&<p className="db-ai-assistant-loading" role="status">Checking current offers…</p>}{error&&<p className="db-ai-assistant-error" role="alert">{error}</p>}<div ref={end}/>
    </div>
    {messages.length===1&&<div className="db-ai-assistant-suggestions">{samples.map(sample=><button type="button" key={sample} onClick={()=>void ask(sample)} disabled={busy}>{sample}</button>)}</div>}
    <form className="db-ai-assistant-form" onSubmit={event=>{event.preventDefault();void ask(query);}}><input ref={input} value={query} maxLength={300} onChange={event=>setQuery(event.target.value)} placeholder="e.g., Wireless earbuds under $50…" aria-label="Shopping question"/><button type="submit" disabled={busy||!query.trim()}>{busy?'…':'Send'}</button></form>
   </section>
  </div>}
 </>;
}
