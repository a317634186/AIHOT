import { RecommendationSchema, cleanRecommendation } from './recommendations.ts';
import { publicVideoUrl, type ReviewSummary } from '@aihot/contracts/reviews';
import { z } from 'zod';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import { merchantFor, redirectorFor, SHOPPING } from '@aihot/industry/shopping';
import { cleanMerchantLink, unitPrice, cents, effectiveStatus, isOffer, offerIdentity, safeCopy, supportedPromotion, type Offer } from '@aihot/contracts/shopping';
import { sql } from '../db.ts';
import { guardedFetch } from '../lib/http-fetch.ts';
import { chatJson, markReceiptsCompleted } from '../providers/llm.ts';
import { modelFor } from '../editorial/models.ts';
import { promptText, promptVersion } from '../editorial/prompts.ts';
const nullable=z.string().max(1600).nullable().catch(null);
const Review=z.object({format:z.enum(['media_review','user_experience','buying_guide','ai_pick','video_review']),author:nullable,verdict:z.string().max(900),bestFor:nullable,strengths:z.array(z.string().max(280)).max(3).catch([]),limitations:z.array(z.string().max(280)).max(3).catch([]),testingNote:nullable,questions:z.array(z.object({question:z.string().max(180),answer:z.string().max(450)})).max(3).catch([]),videoId:nullable}).nullable().catch(null);
const Extract=z.object({review:Review,activityScope:z.enum(['single_product','multi_product','storewide','event','financial']).nullable().catch(null),promotion:z.object({kind:z.enum(['platform_sale','popular']),quote:z.string().max(300)}).nullable().catch(null),aiOverview:RecommendationSchema.nullable().catch(null),minimumSpend:nullable,unitQuantity:z.number().positive().nullable().catch(null),unitLabel:nullable,kind:z.enum(['product_deal','coupon_offer','cashback_offer','freebie','shopping_news','buying_guide','recall']),product:nullable,model:nullable,variant:nullable,condition:nullable,seller:nullable,fulfillment:nullable,linkId:nullable,imageId:nullable,listedPrice:nullable,checkoutPrice:nullable,priceEvidence:nullable,comparison:nullable,shipping:nullable,cashback:nullable,giftCard:nullable,points:nullable,coupon:nullable,steps:z.array(z.string()).max(10).catch([]),restrictions:z.array(z.string()).max(12).catch([]),membership:nullable,subscription:nullable,renewal:nullable,cancellation:nullable,region:nullable,expiresAt:nullable,deadlineOriginal:nullable,warranty:nullable,returns:nullable});
const ARTICLE_SELECTOR='.content-card.details, article, .entry-content, .post-content, #dealDetails';
type SourceLink={id:string;url:string;text:string};
/**
 * The merchant page a URL leads to without any request. A merchant URL nested in the query wins over
 * the wrapper around it, so an affiliate tracker on a merchant subdomain (goto.walmart.com/c/…?u=…)
 * yields the product page it carries rather than the tracker.
 */
function merchantDestination(raw:string,base:string,depth=0):string|null{if(depth>5)return null;try{const u=new URL(raw,base);for(const value of u.searchParams.values()){if(/^https?:/.test(value)){const found=merchantDestination(value,base,depth+1);if(found)return found;}}if(merchantFor(u.href))return cleanMerchantLink(u.href);}catch{}return null;}
export function observedLinks(html:string,sourceUrl:string) {
 const $=load(html); const links:SourceLink[]=[];
 const add=(url:string,text:string)=>{const direct=merchantDestination(url,sourceUrl);const candidate=direct??(/buy now|shop now|get deal|redeem|claim offer/i.test(text)&&/^https:\/\//.test(url)?url:null);if(candidate&&!links.some(x=>x.url===candidate))links.push({id:`L${links.length+1}`,url:candidate,text:text.trim().slice(0,160)});};
 if(merchantFor(sourceUrl))add(sourceUrl,$('title').text());
 const article=$(ARTICLE_SELECTOR).first();
 (article.length?article:$('body')).find('a[href]').each((_i,e)=>{const el=$(e);let u;try{u=new URL(el.attr('href')!,sourceUrl).href;}catch{return;}add(u,el.text());});
 const images:Array<{id:string;url:string}>=[];
 const image=(u:string|undefined)=>{try{if(!u)return;const url=new URL(u,sourceUrl);if(url.protocol==='https:'&&!images.some(x=>x.url===url.href)&&images.length<16)images.push({id:`I${images.length+1}`,url:url.href});}catch{}};
 image($('meta[property="og:image"]').attr('content'));
 $('article img, .entry-content img').each((_i,e)=>image($(e).attr('src')??$(e).attr('data-src')));
 const videos:Array<{id:string;url:string;title:string;embedded:boolean}>=[];
 (article.length?article:$('body')).find('iframe[src],iframe[data-src],[data-provider="youtube"][data-src],[data-lazy-src],a[href]').each((_i,e)=>{const el=$(e);const url=publicVideoUrl(el.attr('src')??el.attr('data-src')??el.attr('data-lazy-src')??el.attr('href')??'');if(url&&!videos.some(x=>x.url===url)&&videos.length<8)videos.push({id:'V'+(videos.length+1),url,title:el.attr('title')??el.text().trim().slice(0,180),embedded:article.length>0&&e.tagName!=='a'});});
 return {links:links.slice(0,80),images,videos};
}
type RedirectFetch=(url:string,opts:{method:string;redirect:'manual';timeoutMs:number;maxBytes:number})=>Promise<{status:number;headers:{get(name:string):string|null}}>;
/**
 * Follows a publisher's shortener or affiliate redirect (industry LINK_REDIRECTORS) one Location at a
 * time until a merchant appears. The merchant page is never requested here, every hop passes the
 * fetch guard, and a chain that ends anywhere else yields nothing: the destination is read from the
 * source's own link, never guessed.
 */
export async function resolveRedirect(url:string,fetch:RedirectFetch=guardedFetch):Promise<string|null>{
 let current=url;
 for(let hop=0;hop<6;hop++){
  let res;
  try{
   res=await fetch(current,{method:'HEAD',redirect:'manual',timeoutMs:8000,maxBytes:65536});
   // Some redirectors answer HEAD with an error and only redirect a GET; the body stays capped.
   if(res.status>=400&&res.status!==404)res=await fetch(current,{method:'GET',redirect:'manual',timeoutMs:8000,maxBytes:65536});
  }catch{return null;}
  const location=res.headers.get('location');
  if(res.status<300||res.status>=400||!location)return null;
  let next;try{next=new URL(location,current).href;}catch{return null;}
  const destination=merchantDestination(next,current);
  if(destination)return destination;
  current=next;
 }
 return null;
}
/** Adds the merchant pages reached through redirector links in the article body; at most eight distinct links are followed. */
export async function resolveRedirectLinks(html:string,sourceUrl:string,evidence:{links:SourceLink[]},fetch:RedirectFetch=guardedFetch){
 const $=load(html);const article=$(ARTICLE_SELECTOR).first();const seen=new Map<string,string>();
 (article.length?article:$('body')).find('a[href]').each((_i,e)=>{const el=$(e);let u;try{u=new URL(el.attr('href')!,sourceUrl).href;}catch{return;}if(redirectorFor(u)&&!seen.has(u)&&seen.size<8)seen.set(u,el.text().trim());});
 const found=await Promise.all([...seen].map(async([url,text])=>({url:await resolveRedirect(url,fetch),text})));
 for(const f of found)if(f.url&&!evidence.links.some(x=>x.url===f.url))evidence.links.push({id:`L${evidence.links.length+1}`,url:f.url,text:f.text.slice(0,160)});
 return evidence;
}
export async function extractShopping(articleId:string,opts:{refreshReview?:boolean;relink?:boolean}={}) {
 const [a]=await sql`SELECT a.*,s.first_party FROM articles a JOIN sources s ON s.id=a.source_id WHERE a.id=${articleId}`;
 if(!a)return;
 const [old]=await sql`SELECT input_revision FROM shopping_offers WHERE article_id=${articleId}`;
 if(old?.input_revision===a.revision&&!opts.refreshReview&&!opts.relink)return;
 let html=String(a.body_html??'');
 if(process.env.COLLECT_ENABLED !== "false") try{const page=await guardedFetch(a.url,{maxBytes:4_000_000,headers:{'accept-language':'en-US,en;q=0.9'}});if(page.status===200)html=page.text();}catch{}
 const evidence=observedLinks(html,a.url);
 // Resolve only links actually present in the source; never synthesize a buying URL.
 if(process.env.COLLECT_ENABLED !== "false")await resolveRedirectLinks(html,a.url,evidence);
 if(process.env.COLLECT_ENABLED !== "false" && evidence.links.length===0){
  const $=load(html);const candidates=$('a[href]').toArray().map(e=>({text:$(e).text().trim(),url:$(e).attr('href')!})).filter(x=>/get deal|shop now|buy now|buy at|shop at|redeem|claim offer/i.test(x.text)).slice(0,3);
  for(const c of candidates){try{const target=new URL(c.url,a.url).href;const res=await guardedFetch(target,{timeoutMs:10000,maxBytes:2_000_000});if(merchantFor(res.url))evidence.links.push({id:`L${evidence.links.length+1}`,url:res.url,text:c.text.slice(0,160)});}catch{}}
 }
 for(const m of a.media??[])if(m.kind==='image'&&typeof m.url==='string'&&m.url.startsWith('https:')&&!evidence.images.some(x=>x.url===m.url))evidence.images.push({id:`I${evidence.images.length+1}`,url:m.url});
 const body=String(a.body_text??a.excerpt??'');
 const result=await chatJson({model:await modelFor('structure'),purpose:'shopping_extract',subject:`article:${articleId}@${a.revision}`,promptVersion:promptVersion('shopping-extract'),system:promptText('shopping-extract'),user:JSON.stringify({title:a.title,body:body.slice(0,22000),sourceUrl:a.url,publishedAt:a.published_at,...evidence}),schema:Extract,maxTokens:5000,temperature:0.1});
 const d=result.data; const buyUrl=evidence.links.find(x=>x.id===d.linkId)?.url??null; const merchant=buyUrl?merchantFor(buyUrl):null;
 const material=(a.title+' '+body).replace(/\s+/g,' ');
 const quote=d.priceEvidence&&material.includes(d.priceEvidence.replace(/\s+/g,' '))?d.priceEvidence:null;
 const quotedAmount=(value:string|null)=>{const amount=cents(value);if(amount===null)return null;const evidence=quote??material;const matches=[...evidence.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?![\d.])/g)];return matches.some(m=>cents(m[1])===amount)?amount:null;};
 const expiresAt=d.expiresAt&&d.deadlineOriginal&&body.includes(d.deadlineOriginal)&&d.deadlineOriginal.includes(d.expiresAt)&&/T\d\d:\d\d.*(?:Z|[+-]\d\d:\d\d)$/.test(d.expiresAt)&&Number.isFinite(Date.parse(d.expiresAt))?d.expiresAt:null;
 const review:ReviewSummary|null=d.kind==='buying_guide'&&d.review?{format:d.review.format,author:d.review.author,verdict:safeCopy(d.review.verdict),bestFor:d.review.bestFor?safeCopy(d.review.bestFor):null,strengths:d.review.strengths.map(safeCopy),limitations:d.review.limitations.map(safeCopy),testingNote:d.review.testingNote,questions:d.review.questions.map(q=>({question:q.question,answer:safeCopy(q.answer)})),videoUrl:evidence.videos.find(v=>v.id===d.review?.videoId)?.url??(evidence.videos.length===1&&evidence.videos[0]!.embedded?evidence.videos[0]!.url:null),basis:'source_text'}:null;
 if(review?.format==='video_review'&&!review.videoUrl)review.format='media_review';
 const data:Offer={...d,review,promotion:supportedPromotion(d.promotion,material),aiOverview:d.aiOverview?cleanRecommendation(d.aiOverview,isOffer(d)):null,merchant:merchant?.name??null,merchantId:merchant?.id??null,buyUrl,imageUrl:evidence.images.find(x=>x.id===d.imageId)?.url??evidence.images[0]?.url??null,imageSource:a.url,listedPriceCents:quotedAmount(d.listedPrice),checkoutPriceCents:quotedAmount(d.checkoutPrice),currency:'USD',unitPriceCents:unitPrice(quotedAmount(d.checkoutPrice),d.unitQuantity),priceEvidence:quote,comparison:d.comparison?safeCopy(d.comparison):null,expiresAt,status:'Unverified',verifiedAt:null,lastCheckedAt:null,verificationNote:'Source report only. Merchant price, availability, seller, and conditions have not been independently confirmed.',identity:null};
 if (/^\s*(?:\[expired\]|expired[: —-])/i.test(a.title) || /^(?:This (?:deal|offer) has expired|This (?:deal|offer) is no longer available)[.!]/i.test(body.trim())) {data.status='Expired';data.verificationNote='The source explicitly marks this offer expired.';}
 if (/^\s*(?:\[sold out\]|sold out[: —-])/i.test(a.title)) {data.status='Out of Stock';data.verificationNote='The source explicitly marks this offer sold out.';}
 // Strict identity prevents unknown variants, seller changes, and eligibility differences from merging.
 const identity=offerIdentity(data);data.identity=identity?createHash('sha256').update(identity).digest('hex'):null;
 await sql`INSERT INTO shopping_offers(article_id,input_revision,data,identity_key) VALUES(${articleId},${a.revision},${sql.json(data as never)},${data.identity}) ON CONFLICT(article_id) DO UPDATE SET input_revision=EXCLUDED.input_revision,data=EXCLUDED.data,identity_key=EXCLUDED.identity_key,next_check_at=now(),updated_at=now()`;
 await markReceiptsCompleted([result.receiptId]);
 if(process.env.COLLECT_ENABLED !== 'false' && isOffer(data)&&buyUrl&&!['Expired','Out of Stock'].includes(data.status))await verifyShopping(articleId);
}
export function officialProductEvidence(html:string, expected:Offer, allowPriceChange=false) {
 const $=load(html);const nodes:any[]=[];
 const walk=(v:any)=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(v['@type']==='Product'||v['@type']?.includes?.('Product'))nodes.push(v);if(v['@graph'])walk(v['@graph']);}};
 $('script[type="application/ld+json"]').each((_i,e)=>{try{walk(JSON.parse($(e).text()));}catch{}});
 for(const product of nodes){
  const ids=[product.sku,product.mpn,product.model,product.gtin13,product.gtin12].filter(x=>typeof x==='string').map(x=>x.toLowerCase());
  if(!expected.model||!ids.includes(expected.model.toLowerCase()))continue;
  const offers=Array.isArray(product.offers)?product.offers:[product.offers];
  for(const offer of offers){if(!offer||offer['@type']==='AggregateOffer')continue;
   const price=cents(offer.price);const availability=String(offer.availability??'');const seller=typeof offer.seller==='string'?offer.seller:offer.seller?.name;
   // No checkout simulation: complex offers must be checked by a person or authorized API.
   if(price===null||offer.priceCurrency!=='USD'||!seller||!expected.seller||seller.toLowerCase()!==expected.seller.toLowerCase())continue;
   if(expected.restrictions.length||expected.coupon||expected.membership||expected.subscription||expected.cashback||expected.giftCard||expected.points)continue;
   if(!expected.variant||!expected.condition||!offer.itemCondition||!String(offer.itemCondition).toLowerCase().includes(expected.condition.toLowerCase().replace(/\s/g,'')))continue;
   const currencyCountry=offer.eligibleRegion??offer.shippingDetails?.shippingDestination?.addressCountry;
   if(currencyCountry!=='US')continue;
   if(!allowPriceChange&&expected.checkoutPriceCents!==price)continue;
   if(!String(product.name??'').toLowerCase().includes(expected.variant.toLowerCase()))continue;
   return {price,seller,availability,sku:expected.model,condition:offer.itemCondition,region:'US',productName:product.name};
  }
 }
 return null;
}
export async function verifyShopping(articleId:string) {
 const [row]=await sql`SELECT data FROM shopping_offers WHERE article_id=${articleId}`;if(!row)return;
 const d=row.data as Offer;if(!d.buyUrl||!merchantFor(d.buyUrl)||!isOffer(d)||['Expired','Out of Stock'].includes(d.status))return;
 const checkedAt=new Date().toISOString();let error:string|null=null;let evidence:ReturnType<typeof officialProductEvidence>=null;
 try{const r=await guardedFetch(d.buyUrl,{timeoutMs:15000,maxBytes:4_000_000,headers:{'accept-language':'en-US,en;q=0.9'}});if(r.status!==200)throw new Error(`Merchant returned HTTP ${r.status}`);if(!merchantFor(r.url))throw new Error('Destination is not a recognized merchant');evidence=officialProductEvidence(r.text(),d,true);}catch(e){error=String(e).slice(0,300);}
 d.lastCheckedAt=checkedAt;
 if(evidence){
  if(/\/InStock$/.test(evidence.availability)){d.checkoutPriceCents=evidence.price;const identity=offerIdentity(d);d.identity=identity?createHash('sha256').update(identity).digest('hex'):null;d.status='Active';d.verifiedAt=checkedAt;d.verificationNote='Matched the exact model, variant, seller, condition, USD price, US availability, and in-stock structured offer on the merchant page. Confirm tax and shipping at checkout.';}
  else if(/\/(OutOfStock|SoldOut)$/.test(evidence.availability)){d.status='Out of Stock';d.verifiedAt=checkedAt;d.verificationNote='The matching merchant offer explicitly reports out of stock.';}
  else {d.status='Unverified';d.verificationNote='Merchant availability is not explicit.';}
 }else{d.status='Unverified';d.verificationNote=error?'The merchant check failed. This does not prove expiration; the previous successful verification time is retained.':'The page did not provide enough matching price, stock, seller, variant, condition, and US-eligibility evidence.';}
 d.status=effectiveStatus(d);
 await sql`INSERT INTO shopping_checks(article_id,url,status,evidence,error) VALUES(${articleId},${d.buyUrl},${d.status},${sql.json((evidence??{}) as never)},${error})`;
 await sql`UPDATE shopping_offers SET data=${sql.json(d as never)},identity_key=${d.identity},next_check_at=now()+interval '30 minutes',updated_at=now() WHERE article_id=${articleId}`;
}
export async function recheckShopping(){
 // Only offers a reader can still act on are worth a merchant round-trip: anything older than two
 // weeks is labelled by its age on the page and leaves the rotation, so recent items are checked
 // on time instead of queueing behind the backlog.
 const rows=await sql`SELECT d.article_id FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id WHERE d.next_check_at<=now() AND p.visibility='public' AND p.timeline_at>now()-interval '14 days' AND d.data->>'kind' NOT IN ('shopping_news','buying_guide','recall') AND d.data->>'buyUrl' IS NOT NULL AND d.data->>'status' NOT IN ('Expired','Out of Stock') ORDER BY d.next_check_at LIMIT 24`;
 for(const r of rows)await verifyShopping(r.article_id);
 return {checked:rows.length};
}
