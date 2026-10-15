import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { offerQuestions } from '@aihot/contracts/shopping-facts';
import { isOffer, isAffiliateLink, type Offer, type PriceObservation } from '@aihot/contracts/shopping';
type DetailItem={id:string;title:string;summary:string;reason:string|null;offer:Offer;sourceUrl:string;source:string};
const money=(n:number|null)=>n===null?'Not specified':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const day=(s:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'}).format(new Date(s));
export function BuyingAnswers({offer}:{offer:Offer}){const questions=offerQuestions(offer);if(!questions.length)return null;return <section id="buying-answers" className="db-panel db-buying-answers"><h2>What to know before buying</h2><dl>{questions.map(q=><div key={q.question}><dt>{q.question}</dt><dd>{q.answer}</dd></div>)}</dl></section>;}
export function AiIntroduction({item}:{item:DetailItem}){
 const d=item.offer;const ai=d.aiOverview;
 return <section className="db-panel db-ai-intro"><div className="db-ai-heading"><span aria-hidden>✦</span><h2>{isOffer(d)?'Why this deal may be worth it':'AI brief'}</h2><span className="db-ai-label">From the source report</span></div><p className="db-ai-summary">{ai?.summary||item.summary}</p>{ai?.bestFor&&<p><strong>Best suited for</strong><br/>{ai.bestFor}</p>}{ai?.highlights?.length?<><h3>{isOffer(d)?'What stands out':'Highlights'}</h3><ul>{ai.highlights.map((text,i)=><li key={i}>{text}</li>)}</ul></>:item.reason&&<p><strong>Why it matters</strong><br/>{item.reason}</p>}{isOffer(d)&&ai?.priceReason&&<><h3>About the price</h3><p className="db-ai-price-reason">{ai.priceReason}</p></>}{!!ai?.cautions?.length&&<><h3>Before you buy</h3><ul>{ai.cautions.map((text,i)=><li key={i}>{text}</li>)}</ul></>}<details><summary>Product facts & conditions</summary><dl>{[['Model / variant',[d.model,d.variant].filter(Boolean).join(' · ')],['Condition',d.condition],['Eligibility',d.restrictions.join('; ')],['Shipping',d.shipping],['Warranty',d.warranty]].filter(([,v])=>v).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></details><p className="db-ai-disclosure">Written by AI from the source report, not a hands-on test. <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Read source ↗</a></p></section>;
}
export function PriceInsights({item,history=[],comparisons=[]}:{item:DetailItem;history:PriceObservation[];comparisons:DetailItem[]}){
 const d=item.offer;if(!isOffer(d))return null;
 const checkout=d.checkoutPriceCents!==null;
 // Without two recorded prices or a second retailer there is nothing to compare; the panel waits.
 const points=history.flatMap(h=>{const price=checkout?h.checkoutPriceCents:h.listedPriceCents;return price===null?[]:[{...h,price}];});
 const low=points.length?Math.min(...points.map(p=>p.price)):null;
 const high=points.length?Math.max(...points.map(p=>p.price)):null;
 const first=points[0],last=points.at(-1);
 const timeStart=first?Date.parse(first.at):0;const timeSpan=last?Math.max(Date.parse(last.at)-timeStart,1):1;
 if(points.length<2&&!comparisons.length)return null;
 const spread=Math.max((high??0)-(low??0),100);const floor=(low??0)-spread*.15;
 const coords=points.map(p=>({x:64+(Date.parse(p.at)-timeStart)/timeSpan*504,y:160-(p.price-floor)/(spread*1.3)*120}));
 return <section className="db-panel db-price-insights"><div className="db-section-title"><h2>Price trends & comparisons</h2><span>USD · before tax</span></div>{points.length>=2&&<div className="db-price-stats"><div><span>Current price</span><strong>{money(d.checkoutPriceCents??d.listedPriceCents)}</strong></div><div><span>Lowest we recorded</span><strong>{money(low)}</strong></div><div><span>First recorded</span><strong>{first?day(first.at):'Not yet recorded'}</strong></div></div>}
 {points.length>=2&&<figure className="db-price-chart"><svg viewBox="0 0 600 208" role="img" aria-label="Prices recorded by Savlume over time"><line x1="64" x2="568" y1="160" y2="160" stroke="#dce5e8"/><text x="5" y="50">{money(high)}</text><text x="5" y="151">{money(low)}</text><polyline points={coords.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#267fba" strokeWidth="3"/>{coords.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill={points[i]!.basis==='merchant-verified'?'#14655d':'#267fba'}><title>{day(points[i]!.at)}: {money(points[i]!.price)} · {points[i]!.basis}</title></circle>)}<text x="64" y="195">{day(first!.at)}</text><text x="568" y="195" textAnchor="end">{day(last!.at)}</text></svg><figcaption>Savlume observations · {checkout?'conditional checkout':'listed'} prices. Blue: source-reported; green: merchant-verified. No observations are available between recorded points.</figcaption></figure>}
 {points.length>=2&&<p className="db-muted">These are the prices we recorded for this offer, not its full market history. Cashback, gift cards, tax and shipping are not included.</p>}

 {points.length>=2&&<details className="db-observation-table"><summary>View recorded prices & sources ({points.length})</summary><div className="db-table-wrap"><table><thead><tr><th>Recorded (ET)</th><th>Price</th><th>Evidence</th></tr></thead><tbody>{points.slice().reverse().map((p,i)=><tr key={i}><td>{new Date(p.at).toLocaleString('en-US',{timeZone:'America/New_York'})}</td><td>{money(p.price)}</td><td><a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{p.basis} ↗</a></td></tr>)}</tbody></table></div></details>}
 {!!comparisons.length&&<><h3>Same product at other retailers</h3><p className="db-muted">Same model, variant and condition. Check seller, shipping and eligibility separately.</p><div className="db-retailer-quotes">{[item,...comparisons].map(c=><div className="db-retailer-quote" key={c.id}><div><strong>{c.offer.merchant??c.source}</strong><span>{c.id===item.id?'This offer':c.offer.seller??'See seller details'}{c.offer.status!=='Unverified'&&<> · {c.offer.status}</>}</span><small>{c.offer.restrictions.join(' · ')||'Review offer conditions'}</small></div><div><strong>{money(c.offer.checkoutPriceCents??c.offer.listedPriceCents)}</strong>{c.id!==item.id?<Link to={'/items/'+c.id}>View offer →</Link>:c.offer.buyUrl&&<a href={c.offer.buyUrl} target="_blank" rel={isAffiliateLink(c.offer.buyUrl)?"noopener noreferrer sponsored":"noopener noreferrer"}>Visit retailer ↗</a>}</div></div>)}</div></>}</section>;
}
export function DetailActions({item,initialLikes=0}:{item:DetailItem;initialLikes:number}){
 const [reaction,setReaction]=useState({count:initialLikes,liked:false});const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [manualLink,setManualLink]=useState('');const visitor=useRef('');
 useEffect(()=>{
  const controller=new AbortController();let value='';
  try{value=localStorage.getItem('dealbrief.visitor')??'';}catch{}
  if(!/^[a-f0-9]{32}$/.test(value)){value=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');try{localStorage.setItem('dealbrief.visitor',value);}catch{}}
  visitor.current=value;
  void fetch('/api/shopping/'+item.id+'/likes',{headers:{'x-dealbrief-visitor':value},signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();const data=await r.json();if(!controller.signal.aborted)setReaction(data);}).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setReady(true);});
  return ()=>controller.abort();
 },[item.id]);
 const like=async()=>{if(busy||!ready)return;setBusy(true);setMessage('');try{const r=await fetch('/api/shopping/'+item.id+'/likes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({visitorId:visitor.current,liked:!reaction.liked})});if(!r.ok)throw new Error();setReaction(await r.json());}catch{setMessage('Could not save your like. Please try again.');}finally{setBusy(false);}};
 const share=async()=>{
  const url=window.location.origin+'/items/'+item.id;setMessage('');setManualLink('');
  if(navigator.share){try{await navigator.share({title:item.title,url});return;}catch(e){if(e instanceof Error&&e.name==='AbortError')return;}}
  try{if(navigator.clipboard){await navigator.clipboard.writeText(url);setMessage('Link copied');return;}}catch{}
  const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();let copied=false;try{copied=document.execCommand('copy');}catch{}finally{input.remove();}
  if(copied)setMessage('Link copied');else{setManualLink(url);setMessage('Copy this link to share');}
 };
 return <div className="db-detail-actions"><div className="db-action-buttons"><button className="db-like" type="button" onClick={()=>void like()} aria-pressed={reaction.liked} disabled={busy||!ready} aria-label={(reaction.liked?'Unlike':'Like')+' this post'}><svg viewBox="0 0 24 24" aria-hidden><path d="M7 10v10H3V10h4Zm0 0 5-7c2 0 2 2 1 6h6c2 0 2 1 2 3l-2 7c0 1-1 1-2 1H7"/></svg><span>{reaction.liked?'Liked':'Like'}{reaction.count>0&&<> <b>{reaction.count}</b></>}</span></button><button className="db-share" type="button" onClick={()=>void share()}><svg viewBox="0 0 24 24" aria-hidden><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/></svg><span>Share</span></button>{item.offer.buyUrl&&<a className="db-action-buy" href={item.offer.buyUrl} target="_blank" rel={isAffiliateLink(item.offer.buyUrl)?"noopener noreferrer sponsored":"noopener noreferrer"}>{item.offer.coupon?'Get offer':'View offer'} ↗</a>}</div>{message&&<p role="status">{message}</p>}{manualLink&&<input aria-label="Share link" readOnly value={manualLink} onFocus={e=>e.currentTarget.select()}/>}</div>;
}
