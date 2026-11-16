import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { offerQuestions } from '@aihot/contracts/shopping-facts';
import { affiliateLink, isOffer, isAffiliateLink, itemPath, type Offer, type PriceComparisonQuote, type PriceObservation } from '@aihot/contracts/shopping';
import { attributeSource, genuineCautions, itemFaqs, leadSentence, offerHeading, publicRetailer, shortModel } from '../lib/item-geo';
import { isDirectRetailerProductUrl, isDirectRetailerEventUrl } from '@aihot/industry/shopping';
type DetailItem={id:string;title:string;summary:string;reason:string|null;offer:Offer;sourceUrl:string;source:string;thirdPartySeller?:boolean;priceDisplay?:{state:'current'|'ended'|'stale'|'unavailable';amountCents:number|null;label:string;verification:'merchant-verified'|'last-verified'|'source-reported'|'unavailable';verifiedAt:string|null;lastCheckedAt:string|null}};
const money=(n:number|null)=>n===null?'Not specified':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
const day=(s:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'}).format(new Date(s));
const isDirectRetailerUrl=(raw:string|null|undefined)=>isDirectRetailerProductUrl(raw);
export function ItemFaq({item}:{item:DetailItem}){const faqs=itemFaqs(item);if(!faqs.length)return null;return <section id="item-faq" className="db-panel db-item-faq"><h2>Frequently Asked Questions about this {shortModel(item).short} Deal</h2>{faqs.map(faq=><article key={faq.question}><h3 className="db-item-faq-question">{faq.question}</h3><p className="db-item-faq-answer">{faq.answer}</p></article>)}</section>;}
export function BuyingAnswers({offer,priceState}:{offer:Offer;priceState?:DetailItem['priceDisplay']}){const questions=offerQuestions(offer,priceState?.state);if(!questions.length)return null;return <section id="buying-answers" className="db-panel db-buying-answers"><h2>What to know before buying</h2><dl>{questions.map(q=><div key={q.question}><dt>{q.question}</dt><dd>{q.answer}</dd></div>)}</dl></section>;}
export function AiIntroduction({item}:{item:DetailItem}){
 const d=item.offer,ai=d.aiOverview;
 const outdated=!!ai?.analysisVersion&&ai.analysisPriceCents!==item.priceDisplay?.amountCents;
 if(!ai&&!item.reason&&(!isOffer(d)||!item.summary.trim()))return null;
 return <section className="db-panel db-ai-intro"><div className="db-ai-heading"><h2>{isOffer(d)&&d.kind!=='buying_guide'?offerHeading(item):'Buying brief'}</h2></div>
 {outdated?<p className="db-ai-summary">The price changed after this analysis was prepared. Check the current offer and source for details.</p>:<><p className="db-ai-summary">{[leadSentence(item,ai?.summary||item.summary),attributeSource(ai?.summary||item.summary,item.source)].filter(Boolean).join(' ')}</p>{ai?.bestFor&&<><h3>{isOffer(d)?`Who it's for`:'Best suited for'}</h3><p>{attributeSource(ai.bestFor,item.source)}</p></>}{ai?.highlights?.length?<><h3>{isOffer(d)?'What stands out':'Highlights'}</h3><ul>{ai.highlights.map((text,i)=><li key={i}>{attributeSource(text,item.source)}</li>)}</ul></>:item.reason&&<p><strong>Why it matters</strong><br/>{item.reason}</p>}{isOffer(d)&&item.priceDisplay?.state==='current'&&ai?.priceReason&&ai.analysisVersion==='buyer-context-v1'&&ai.analysisPriceCents===item.priceDisplay.amountCents&&['merchant-verified','source-reported'].includes(item.priceDisplay.verification)&&<><h3>Price context</h3>{item.priceDisplay.verification==='source-reported'&&<p className="db-muted">Editorial interpretation of dated source evidence.</p>}<p className="db-ai-price-reason">{attributeSource(ai.priceReason,item.source)}</p></>}{genuineCautions(ai?.cautions,item.source).length>0&&<><h3>{isOffer(d)?'Worth knowing':'Before you buy'}</h3><ul>{genuineCautions(ai?.cautions,item.source).map((text,i)=><li key={i}>{text}</li>)}</ul></>}</>}
 <p className="db-ai-disclosure"><strong>Savlume Editorial Team.</strong> Editorial analysis of the source{ai?.analysisVersion?' and available price records':''}; not a hands-on test. <a href={item.sourceUrl} target="_blank" rel="nofollow noopener noreferrer">Read source ↗</a></p></section>;
}
export function PriceInsights({item,history=[],comparisons=[],searchComparisons=[]}:{item:DetailItem;history:PriceObservation[];comparisons:DetailItem[];searchComparisons?:PriceComparisonQuote[]}){
 const d=item.offer;if(!isOffer(d))return null;
 const checkout=d.checkoutPriceCents!==null;
 const points=history.flatMap(h=>{const price=checkout?h.checkoutPriceCents:h.listedPriceCents;return price===null?[]:[{...h,price}];});
 const low=points.length?Math.min(...points.map(p=>p.price)):null;
 const high=points.length?Math.max(...points.map(p=>p.price)):null;
 const first=points[0],last=points.at(-1);
 const timeStart=first?Date.parse(first.at):0;const timeSpan=last?Math.max(Date.parse(last.at)-timeStart,1):1;
 const spread=Math.max((high??0)-(low??0),100);const floor=(low??0)-spread*.15;
 const coords=points.map(p=>({x:64+(Date.parse(p.at)-timeStart)/timeSpan*504,y:160-(p.price-floor)/(spread*1.3)*120}));
 const evidence=(x:DetailItem)=>x.priceDisplay?.verification==='merchant-verified'?'Retailer verified'+(x.priceDisplay.verifiedAt?' · '+day(x.priceDisplay.verifiedAt):''):x.priceDisplay?.verification==='last-verified'?'Previously retailer verified'+(x.priceDisplay.verifiedAt?' · '+day(x.priceDisplay.verifiedAt):''):'Source-reported';
 const hasComparisons=comparisons.length>0||searchComparisons.length>0;
 if(!hasComparisons&&!points.length)return null;
 return <section className="db-panel db-price-insights"><div className="db-section-title"><h2>{hasComparisons?'Compare retailer prices':'Price history'}</h2><span>USD · before tax and shipping</span></div>
 {!!comparisons.length&&<><h3>Same product at other retailers</h3><p className="db-muted">Matched by model or product name, variant and condition. Each price is labeled with its evidence status.</p><div className="db-retailer-quotes">{[item,...comparisons].map(c=><div className="db-retailer-quote" key={c.id}><div><strong>{publicRetailer(c.offer.merchant,c.source)}</strong><span>{c.offer.seller??'Seller not stated'}{c.thirdPartySeller?' · marketplace seller':''}</span><small>{evidence(c)}</small><small>{c.offer.restrictions.join(' · ')||c.offer.coupon||'Check retailer terms'}</small></div><div><strong>{money(c.priceDisplay?c.priceDisplay.amountCents:c.offer.checkoutPriceCents??c.offer.listedPriceCents)}</strong>{c.id!==item.id?<Link to={itemPath(c)}>View Deal →</Link>:isDirectRetailerUrl(c.offer.buyUrl)&&<a href={c.offer.buyUrl!} target="_blank" rel={isAffiliateLink(c.offer.buyUrl!)?"sponsored nofollow noopener noreferrer":"nofollow noopener noreferrer"}>View Deal ↗</a>}</div></div>)}</div></>}
 {!!searchComparisons.length&&<><h3>Other retailer price references</h3><p className="db-muted">Search results locate additional retailers. Prices are labeled by evidence: only a matching in-stock retailer record is marked verified.</p><div className="db-retailer-quotes">{searchComparisons.map(q=>{const url=affiliateLink(q.url)??q.url;const label=q.basis==='merchant-verified'?'Retailer verified':q.basis==='retailer-page-observed'?'Retailer page observed · check stock and seller':'Search-reported price';return <div className="db-retailer-quote" key={q.merchantId}><div><strong>{q.merchant}</strong><span>{q.seller??'Seller not stated'}</span><small>{label} · {new Date(q.observedAt).toLocaleString('en-US',{timeZone:'America/New_York'})} ET</small>{q.previousPriceCents!==null&&q.previousPriceCents!==undefined&&q.previousObservedAt&&<small>Previous search snapshot: {money(q.previousPriceCents)} · {day(q.previousObservedAt)}</small>}<small>{q.title}</small><a href={q.evidenceUrl} target="_blank" rel="nofollow noopener noreferrer">Price evidence ↗</a></div><div><strong>{money(q.priceCents)}</strong><a href={url} target="_blank" rel={isAffiliateLink(url)?'sponsored nofollow noopener noreferrer':'nofollow noopener noreferrer'}>View Deal ↗</a></div></div>;})}</div></>}
 {points.length>0&&<details className="db-price-history"><summary>View price history · {points.length} recorded {points.length===1?'observation':'observations'}</summary>
 {points.length>=2&&<div className="db-price-stats"><div><span>Lowest recorded</span><strong>{money(low)}</strong></div><div><span>First recorded</span><strong>{day(first!.at)}</strong></div></div>}
 {points.length===1&&<p className="db-muted">One recorded observation · {day(first!.at)} · {points[0]!.basis}.</p>}
 {points.length>=2&&<figure className="db-price-chart"><svg viewBox="0 0 600 208" role="img" aria-label="Prices recorded by Savlume over time"><line x1="64" x2="568" y1="160" y2="160" stroke="#dce5e8"/><text x="5" y="50">{money(high)}</text><text x="5" y="151">{money(low)}</text><polyline points={coords.map(p=>p.x+','+p.y).join(' ')} fill="none" stroke="#267fba" strokeWidth="3"/>{coords.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="4" fill={points[i]!.basis==='merchant-verified'?'#14655d':'#267fba'}><title>{day(points[i]!.at)}: {money(points[i]!.price)} · {points[i]!.basis}</title></circle>)}<text x="64" y="195">{day(first!.at)}</text><text x="568" y="195" textAnchor="end">{day(last!.at)}</text></svg><figcaption>Savlume observations · {checkout?'checkout':'source-listed'} prices. Blue: source-reported; green: retailer-verified. No prices are inferred between observations.</figcaption></figure>}
 <p className="db-muted">These are dated observations from the cited source or retailer page, not a complete market history. Cashback, gift cards, tax and shipping are excluded.</p>
 <details className="db-observation-table"><summary>View recorded prices & sources ({points.length})</summary><div className="db-table-wrap"><table><thead><tr><th>Recorded (ET)</th><th>Price</th><th>Evidence</th></tr></thead><tbody>{points.slice().reverse().map((p,i)=><tr key={i}><td>{new Date(p.at).toLocaleString('en-US',{timeZone:'America/New_York'})}</td><td>{money(p.price)}</td><td><a href={p.sourceUrl} target="_blank" rel="nofollow noopener noreferrer">{p.basis} ↗</a></td></tr>)}</tbody></table></div></details>
 </details>}
 </section>;
}
export function DetailActions({item,initialLikes=0}:{item:DetailItem;initialLikes:number}){
 const [reaction,setReaction]=useState({count:initialLikes,liked:false});const [disliked,setDisliked]=useState(false);const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [manualLink,setManualLink]=useState('');const [relatedUnderDock,setRelatedUnderDock]=useState(false);const visitor=useRef('');
 useEffect(()=>{
  const controller=new AbortController();let value='';
  try{value=localStorage.getItem('dealbrief.visitor')??'';}catch{}
  if(!/^[a-f0-9]{32}$/.test(value)){value=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');try{localStorage.setItem('dealbrief.visitor',value);}catch{}}
  visitor.current=value;
  try{setDisliked(localStorage.getItem(`savlume.dislike.${item.id}`)==='1');}catch{}
  void fetch('/api/shopping/'+item.id+'/likes',{headers:{'x-dealbrief-visitor':value},signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();const data=await r.json();if(!controller.signal.aborted)setReaction(data);}).catch(()=>{}).finally(()=>{if(!controller.signal.aborted)setReady(true);});
  return ()=>controller.abort();
 },[item.id]);
 useEffect(()=>{
  if(window.matchMedia('(min-width:621px)').matches)return;
  let frame=0;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const edge=window.innerHeight-112;const overlap=[...document.querySelectorAll<HTMLElement>('.db-related')].some(section=>{const r=section.getBoundingClientRect();return r.top<window.innerHeight&&r.bottom>edge;});setRelatedUnderDock(overlap);});};
  window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
 },[item.id]);
 const like=async()=>{
  if(busy||!ready)return;setBusy(true);setMessage('');
  try{
   const r=await fetch('/api/shopping/'+item.id+'/likes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({visitorId:visitor.current,liked:!reaction.liked})});
   if(!r.ok)throw new Error();
   const data=await r.json();setReaction(data);
   if(data.liked&&disliked){setDisliked(false);try{localStorage.removeItem(`savlume.dislike.${item.id}`);}catch{}}
  }catch{setMessage('Could not save your like. Please try again.');}finally{setBusy(false);}};
 const toggleDislike=()=>{
  const next=!disliked;setDisliked(next);
  try{if(next){localStorage.setItem(`savlume.dislike.${item.id}`,'1');if(reaction.liked)void like();}else{localStorage.removeItem(`savlume.dislike.${item.id}`);}}catch{}
  fetch('/api/community/votes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({articleId:item.id,direction:next?'not_worth_it':'worth_it'})}).catch(()=>{});
 };
 const share=async()=>{
  const url=window.location.origin+itemPath(item);setMessage('');setManualLink('');
  if(navigator.share){try{await navigator.share({title:item.title,url});return;}catch(e){if(e instanceof Error&&e.name==='AbortError')return;}}
  try{if(navigator.clipboard){await navigator.clipboard.writeText(url);setMessage('Link copied');return;}}catch{}
  const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();let copied=false;try{copied=document.execCommand('copy');}catch{}finally{input.remove();}
  if(copied)setMessage('Link copied');else{setManualLink(url);setMessage('Copy this link to share');}
 };
 return <div className="db-detail-actions" data-related-under-dock={relatedUnderDock||undefined}><div className="db-action-buttons">
  <button className="db-like" type="button" onClick={()=>void like()} aria-pressed={reaction.liked} disabled={busy||!ready} aria-label={(reaction.liked?'Unlike':'Like')+' this post'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H3V10h4Zm0 0 5-7c2 0 2 2 1 6h6c2 0 2 1 2 3l-2 7c0 1-1 1-2 1H7"/></svg><span>{reaction.liked?'Liked':'Like'}{reaction.count>0&&<> <b>{reaction.count}</b></>}</span></button>
  <button className={`db-dislike${disliked?' is-disliked':''}`} type="button" onClick={toggleDislike} aria-pressed={disliked} aria-label="Dislike this post"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 14V4h4v10h-4Zm0 0-5 7c-2 0-2-2-1-6H5c-2 0-2-1-2-3l2-7c0-1 1-1 2-1h10"/></svg><span>{disliked?'Disliked':'Dislike'}</span></button>
  <a className="db-action-comment" href="#comments" onClick={(e)=>{const el=document.getElementById('comments')||document.querySelector('.db-community');if(el){e.preventDefault();el.scrollIntoView({behavior:'smooth'});}}} aria-label="Comments"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Comment</span></a>
  <button className="db-share" type="button" onClick={()=>void share()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7"/></svg><span>Share</span></button>
  {(() => {
    const isSale = ['event', 'storewide'].includes(item.offer.activityScope ?? '');
    const directUrl = item.offer.buyUrl && (isDirectRetailerUrl(item.offer.buyUrl) || isDirectRetailerEventUrl(item.offer.buyUrl));
    const finalUrl = directUrl ? item.offer.buyUrl! : ('https://www.amazon.com/s?k=' + encodeURIComponent([item.offer.brand, item.offer.product, item.offer.model].filter(Boolean).join(' ') || item.title.replace(/\s+for\s+\$\d+.*$/i, '').replace(/\s+at\s+[A-Za-z]+.*$/i, '')) + '&tag=' + (process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG || 'savlume-20'));
    const label = isSale ? 'View Sale ↗' : (!directUrl || finalUrl.includes('amazon.com') ? 'View on Amazon ↗' : 'View Deal ↗');
    return <a className="db-action-buy" href={finalUrl} target="_blank" rel={isAffiliateLink(finalUrl) ? "sponsored nofollow noopener noreferrer" : "nofollow noopener noreferrer"}>{label}</a>;
  })()}
 </div>{message&&<p role="status">{message}</p>}{manualLink&&<input aria-label="Share link" readOnly value={manualLink} onFocus={e=>e.currentTarget.select()}/>}</div>;
}
