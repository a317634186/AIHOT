// The single shopping read layer used by pages, feeds, API, MCP and briefings.
import { isReviewContent } from '@aihot/contracts/reviews';
import { SHOPPING, MERCHANTS } from '@aihot/industry/shopping';
import { effectiveStatus, flashDealEvidence, sourceDealPick, isProductActivity, isOffer, safeCopy, plainTitle, offerTiming, flashSavings, offerSavings, affiliateLink, type Offer, type OfferTiming, type PriceObservation, type FlashDealEvidence, type DealPick } from '@aihot/contracts/shopping';
import { sql } from '../db.ts';
import { proxiedImage, proxiedImageSet } from '../media/imgproxy.ts';
/**
 * Safety bound on one scan, far above the public working set so a reported total is the real total.
 * The cap exists only to stop an unbounded read if the table grows abnormally; it must never be the
 * reason a published item disappears from the API, the feeds or MCP.
 */
const SCAN_LIMIT = 20_000;
/** Image addresses for the page: our signed proxy (cached, resized) in front of the source image. `offer.imageUrl` stays the original for metadata. */
export interface ItemImage {src:string;srcSet:string|null;hero:string}
/** Why an offer sits in the limited-time strip; every flag is backed by stored evidence. */
export interface FlashHighlight {percent:number;recordedLow:boolean;popular:boolean;clicks:number;likes:number}
export interface ShoppingItem {flash?:FlashHighlight;thirdPartySeller?:boolean;productActivity?:boolean;indexable?:boolean;updatedAt?:string;dealPick?:DealPick;sourcePublishedAt?:string|null;flashDeal?:FlashDealEvidence;timing:OfferTiming|null;image:ItemImage|null; id:string;title:string;summary:string;reason:string|null;category:string|null;tags:string[];score:number|null;selected:boolean;source:string;sourceUrl:string;publishedAt:string;offer:Offer;sources:Array<{name:string;url:string}>; }
/** Sold by a retailer in the registry: the link resolves there, or the source names it as the seller (DealNews-style redirects). */
const retailerName=(v:string|null|undefined)=>(v??'').toLowerCase().replace(/[’']/g,'').replace(/\s+/g,' ').trim();
const knownRetailer=(d:Offer)=>!!d.merchantId||!!d.seller&&MERCHANTS.some(m=>{const a=retailerName(m.name),b=retailerName(d.seller);return a===b||b.startsWith(a+' ')||a.startsWith(b+' ');});
const looseKey=(x:ShoppingItem)=>{const d=x.offer;if(!isOffer(d)||!d.product)return null;const price=d.checkoutPriceCents??d.listedPriceCents;if(price===null)return null;const retailer=d.merchantId??retailerName(d.seller)??'';if(!retailer)return null;return ['p',d.product.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),(d.model??'').toLowerCase().trim(),retailer,price,d.expiresAt??''].join('|');};
/** On a marketplace, the listing is sold by someone other than the retailer. */
export const thirdPartySeller=(d:Offer)=>!!d.merchantId&&!!d.seller&&!!d.merchant&&retailerName(d.seller)!==retailerName(d.merchant)&&!retailerName(d.seller).startsWith(retailerName(d.merchant));
const live=(x:ShoppingItem)=>!x.timing||x.timing.state==='current'||x.timing.state==='ending';
const endsMs=(x:ShoppingItem)=>x.timing?.endsAt?Date.parse(x.timing.endsAt):x.timing?.endsDay?Date.parse(x.timing.endsDay+'T23:59:59-04:00'):Number.MAX_SAFE_INTEGER;
function itemImage(url:unknown):ItemImage|null {
 if(typeof url!=='string')return null;
 try{const src=proxiedImage(url,'image-720');const hero=proxiedImage(url,'image-1200');if(!src||!hero)return null;return {src,srcSet:proxiedImageSet(url,'card'),hero};}catch{return null;}
}
export async function shoppingItems(opts:{view?:string;category?:string;merchant?:string;q?:string;limit?:number;offset?:number;id?:string;product?:string;model?:string;variant?:string;condition?:string}={}) {
 const rows=await sql`SELECT p.article_id,p.title,p.summary,p.reason,p.category,p.tags,p.score,p.selected,p.url,p.timeline_at,p.published_at,p.seo_excluded_at,GREATEST(p.updated_at,d.content_updated_at) AS modified,s.name,d.data
 FROM publications p JOIN articles a ON a.id=p.article_id JOIN shopping_offers d ON d.article_id=p.article_id JOIN sources s ON s.id=p.source_id
 WHERE p.visibility='public' AND p.eligible AND a.processing_state<>'blocked' AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes'
 AND (${opts.id??null}::text IS NULL OR p.article_id=${opts.id??null})
 AND (${opts.category??null}::text IS NULL OR p.category=${opts.category??null})
 AND (${opts.merchant??null}::text IS NULL OR d.data->>'merchantId'=${opts.merchant??null})
 AND (${opts.q??null}::text IS NULL OR p.search_text ILIKE ${'%'+(opts.q??'').replace(/[\\%_]/g,'\\$&')+'%'})
 AND (${opts.product??null}::text IS NULL OR lower(d.data->>'product')=lower(${opts.product??null}))
 AND (${opts.model??null}::text IS NULL OR lower(d.data->>'model')=lower(${opts.model??null}))
 AND (${opts.variant??null}::text IS NULL OR lower(d.data->>'variant')=lower(${opts.variant??null}))
 AND (${opts.condition??null}::text IS NULL OR lower(d.data->>'condition')=lower(${opts.condition??null}))
 ORDER BY p.timeline_at DESC, p.article_id DESC LIMIT ${SCAN_LIMIT}`;
 const now=Date.now();
 let items:ShoppingItem[]=rows.map(r=>({id:r.article_id,indexable:r.seo_excluded_at===null&&!!r.summary?.trim(),updatedAt:r.modified.toISOString(),title:plainTitle(safeCopy(r.title)),summary:safeCopy(r.summary??''),reason:r.reason?safeCopy(r.reason):null,category:r.category,tags:r.tags,score:r.score===null?null:Number(r.score),selected:r.selected,source:r.name,sourceUrl:r.url,publishedAt:r.timeline_at.toISOString(),sourcePublishedAt:r.published_at?.toISOString()??null,offer:{...r.data,status:effectiveStatus(r.data),buyUrl:affiliateLink(r.data.buyUrl)},timing:offerTiming(r.data,r.timeline_at.toISOString(),now),image:itemImage(r.data.imageUrl),thirdPartySeller:thirdPartySeller(r.data),sources:[{name:r.name,url:r.url}]}));
 const view=opts.view??'latest';
 if(!opts.id){
  if(view==='top')items=items.filter(x=>isOffer(x.offer)&&x.offer.status==='Active'&&x.selected).sort((a,b)=>(b.score??0)-(a.score??0));
  else if(view==='recommended'||view==='new') { /* Complete public feed, newest first, including labeled past offers. */ }
  else if(view==='flash'){
   // Best Deals shows what a reader can still act on: offers past a stated deadline, or older than
   // their kind's shelf life with no deadline at all, are not current recommendations.
   // A discount above 70% against a small store's own list price is not a deal signal; only a
   // recognised retailer's markdown of that size is shown here.
   const candidates=items.filter(x=>isOffer(x.offer)&&['Active','Unverified','Upcoming'].includes(x.offer.status)&&live(x)&&!((offerSavings(x.offer)?.percent??0)>70&&!knownRetailer(x.offer)));
   const histories=await priceHistories(candidates.filter(x=>x.offer.expiresAt).map(x=>x.id));
   items=candidates.flatMap(x=>{
    const evidence=flashDealEvidence(x.offer,histories.get(x.id)??[]);
    const pick=sourceDealPick(x.offer,x.sourceUrl,x.sourcePublishedAt??x.publishedAt);
    const productActivity=isProductActivity(x.offer,x.sourcePublishedAt??x.publishedAt,x.title);
    return evidence||pick||productActivity?[{...x,productActivity,...(evidence?{flashDeal:evidence}:{}),...(pick?{dealPick:pick}:{})}]:[];
   });
   // Newest day first; within a day, listings sold by the retailer itself come before marketplace sellers.
   const dayKey=(x:ShoppingItem)=>x.publishedAt.slice(0,10);
   items.sort((a,b)=>dayKey(b).localeCompare(dayKey(a))||Number(thirdPartySeller(a.offer))-Number(thirdPartySeller(b.offer))||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  }
  else if(view==='any') { /* all public shopping content */ }
  else if(view==='picks'){
   // Editorial ranking over live material for the machine exits that used to read the Active-only board.
   // Stored status labels are preserved on every item: a source-reported offer is never shown as
   // merchant-verified here, and no price or stock claim is derived from the ranking.
   items=items.filter(x=>isOffer(x.offer)&&!['Expired','Out of Stock'].includes(x.offer.status))
    .sort((a,b)=>(b.score??0)-(a.score??0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||(a.id<b.id?1:a.id>b.id?-1:0));
  }
  else if(view==='reviews')items=items.filter(x=>isReviewContent(x.offer,x.title));
  else if(view==='news')items=items.filter(x=>!isOffer(x.offer)&&!isReviewContent(x.offer,x.title));
  else if(view==='coupons')items=items.filter(x=>(['coupon_offer','cashback_offer','freebie'].includes(x.offer.kind)||x.offer.coupon||x.offer.cashback)&&live(x));
  else if(view==='ending'){
   // The limited-time strip: a stated deadline, a single product with a purchase link, and a real
   // markdown (flashSavings). Offers ending within two days lead, soonest first; when fewer than ten
   // qualify, later-dated offers with the biggest markdowns fill the strip, never beyond twenty.
   // A recognised retailer, no subscription or auto-renewal attached (a free store loyalty programme
   // is fine): the strip is for things a reader buys once, and a markdown against a small store's
   // own list price is not evidence of a flash sale.
   const worthy=(x:ShoppingItem)=>!!x.offer.buyUrl&&knownRetailer(x.offer)&&!x.offer.subscription&&!x.offer.renewal&&!!flashSavings(x.offer)&&isProductActivity(x.offer,x.sourcePublishedAt??x.publishedAt,x.title,now);
   const pool=items.filter(x=>(x.timing?.state==='ending'||x.timing?.state==='current'&&!!(x.timing.endsAt||x.timing.endsDay))&&worthy(x));
   const [histories,engagement]=await Promise.all([priceHistories(pool.map(x=>x.id)),itemEngagement(pool.map(x=>x.id))]);
   // Ranked by a composite the reader can see on the card: the markdown, the lowest price in our own
   // records (two or more observations, never a market claim), source-stated popularity, and the
   // site's own clicks and likes; offers ending within two days get a push. Twenty at most.
   const ranked=pool.map(x=>{
    const d=x.offer;const percent=flashSavings(d)!.percent;const current=d.checkoutPriceCents??d.listedPriceCents!;
    const prices=(histories.get(x.id)??[]).map(h=>d.checkoutPriceCents!==null?h.checkoutPriceCents:h.listedPriceCents).filter((p):p is number=>p!==null);
    const recordedLow=prices.length>=2&&current<=Math.min(...prices);
    const e=engagement.get(x.id)??{clicks:0,likes:0};
    const popular=d.promotion?.kind==='popular'||e.clicks>=3||e.likes>=2;
    // The markdown counts up to 60 points so an inflated list price cannot outrank real signals.
    const score=Math.min(percent,60)+(recordedLow?25:0)+(popular?15:0)+Math.min(20,e.clicks*2+e.likes*3)+(x.timing?.state==='ending'?15:0);
    return {item:{...x,flash:{percent,recordedLow,popular,clicks:e.clicks,likes:e.likes}},score};
   }).sort((a,b)=>b.score-a.score||endsMs(a.item)-endsMs(b.item));
   // At most five from one retailer, so one store's sale does not fill the strip. The composite
   // decides who gets in; the strip itself is shown in order of the activity's end, soonest first.
   const perRetailer=new Map<string,number>();const picked:ShoppingItem[]=[];
   for(const {item} of ranked){const key=retailerName(item.offer.merchant??item.offer.seller);const n=perRetailer.get(key)??0;if(n>=5)continue;perRetailer.set(key,n+1);picked.push(item);if(picked.length===20)break;}
   items=picked.sort((a,b)=>endsMs(a)-endsMs(b)||(b.flash?.percent??0)-(a.flash?.percent??0));
  }
  else if(view==='archive')items=items.filter(x=>['Expired','Out of Stock'].includes(x.offer.status)||x.timing?.state==='ended');
  else items=items.filter(x=>isOffer(x.offer)&&!['Expired','Out of Stock'].includes(x.offer.status)&&(x.offer.kind!=='product_deal'||x.offer.checkoutPriceCents!==null||x.offer.listedPriceCents!==null));
 }
 const unique=new Map<string,ShoppingItem>();
 // The same deal reported by several sources shows once: either the strict stored identity, or the
 // same product at the same retailer at the same price (two sources quoting one offer). The first
 // (newest) stays and the others become its extra sources.
 for(const item of items){const key=item.offer.identity??looseKey(item)??item.id;const prior=unique.get(key);if(prior){if(!prior.sources.some(s=>s.url===item.sourceUrl))prior.sources.push({name:item.source,url:item.sourceUrl});}else unique.set(key,item);}
 items=[...unique.values()];const total=items.length;const limit=Math.max(1,Math.min(opts.limit??24,100));const offset=Math.max(0,opts.offset??0);
 return {items:items.slice(offset,offset+limit),total,hasMore:offset+limit<total,calibration:SHOPPING.calibration,checkedAt:new Date().toISOString()};
}
export async function shoppingBriefing(date?:string) {
 const [r]=date?await sql`SELECT * FROM reports WHERE kind='daily' AND key=${date} AND content->'generator'->>'version' LIKE '%report-daily-lead%'`:await sql`SELECT * FROM reports WHERE kind='daily' ORDER BY key DESC LIMIT 1`;
 if(!r)return null;
 // Historical issues retain wording, but current states are refreshed before the reader sees them.
 const sections=[];
 for(const section of r.content.sections??[]){const items=[];for(const item of section.items??[]){const got=await shoppingItems({id:item.itemId});if(got.items[0])items.push(got.items[0]);}if(items.length)sections.push({title:section.label??section.title??section.name??section.heading,items});}
 return {key:r.key,title:safeCopy(r.content.lead?.title??r.content.title??r.content.headline??'Daily Briefing'),lead:safeCopy(r.content.lead?.leadParagraph??r.content.leadParagraph??r.content.overview??''),sections};
}
export async function shoppingCounts(){const [r]=await sql`SELECT count(*)::int AS items,count(*) FILTER (WHERE (d.data->>'status')='Active')::int AS active FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id WHERE p.visibility='public' AND p.eligible`;return r;}
export async function shoppingComparisons(item:ShoppingItem) {
 const d=item.offer;
 if(!d.product||!d.model||!d.variant||!d.condition||!d.merchantId)return [];
 const all=await shoppingItems({view:'any',limit:100,product:d.product,model:d.model,variant:d.variant,condition:d.condition});
 return all.items.filter(x=>x.id!==item.id&&isOffer(x.offer)&&!['Expired','Out of Stock'].includes(x.offer.status)&&!!x.offer.merchantId&&x.offer.model?.toLowerCase()===d.model!.toLowerCase()&&x.offer.variant?.toLowerCase()===d.variant!.toLowerCase()&&x.offer.condition?.toLowerCase()===d.condition!.toLowerCase()&&x.offer.merchantId!==d.merchantId);
}

async function priceHistories(ids:string[]):Promise<Map<string,PriceObservation[]>> {
 if(!ids.length)return new Map();
 const rows=await sql`SELECT * FROM (
 SELECT h.*,row_number() OVER (PARTITION BY h.article_id ORDER BY h.observed_at DESC,h.id DESC) AS n
 FROM shopping_price_observations h JOIN shopping_offers d ON d.article_id=h.article_id
 WHERE h.article_id=ANY(${ids}::text[]) AND h.offer_context=shopping_price_context(d.data)
 AND h.observed_at>=now()-interval '90 days'
 ) recent WHERE n<=120 ORDER BY observed_at,id`;
 const histories=new Map<string,PriceObservation[]>();
 for(const r of rows){const list=histories.get(r.article_id)??[];list.push({at:r.observed_at.toISOString(),listedPriceCents:r.listed_price_cents===null?null:Number(r.listed_price_cents),checkoutPriceCents:r.checkout_price_cents===null?null:Number(r.checkout_price_cents),currency:r.currency,basis:r.basis,sourceUrl:r.source_url});histories.set(r.article_id,list);}
 return histories;
}
/** The site's own signals for an item: outbound clicks in the last 7 days and likes. */
async function itemEngagement(ids:string[]):Promise<Map<string,{clicks:number;likes:number}>> {
 const map=new Map<string,{clicks:number;likes:number}>();if(!ids.length)return map;
 const paths=ids.map(id=>'/items/'+id);
 const [clicks,likes]=await Promise.all([
  sql`SELECT split_part(path,'→',1) AS path, sum(hits)::int AS n FROM traffic_hits WHERE kind='click' AND day>=current_date-7 AND split_part(path,'→',1)=ANY(${paths}::text[]) GROUP BY 1`,
  sql`SELECT article_id, count(*)::int AS n FROM shopping_likes WHERE article_id=ANY(${ids}::text[]) GROUP BY 1`,
 ]);
 for(const r of clicks){const id=String(r.path).slice('/items/'.length);map.set(id,{clicks:Number(r.n),likes:0});}
 for(const r of likes){const prior=map.get(r.article_id)??{clicks:0,likes:0};map.set(r.article_id,{...prior,likes:Number(r.n)});}
 return map;
}
export async function shoppingPriceHistory(item:ShoppingItem):Promise<PriceObservation[]> {
 return (await priceHistories([item.id])).get(item.id)??[];
}
export async function shoppingLikes(articleId:string,visitorHash:string|null=null){
 const [r]=await sql`SELECT count(*)::int AS count,COALESCE(bool_or(visitor_hash=${visitorHash}),false) AS liked FROM shopping_likes WHERE article_id=${articleId}`;
 return {count:r.count as number,liked:r.liked as boolean};
}

export async function relatedShopping(item:ShoppingItem){
 if(!item.category)return [];
 const candidates=await shoppingItems({view:'recommended',category:item.category,limit:24});
 return candidates.items.filter(x=>x.id!==item.id&&x.indexable&&!['Expired','Out of Stock'].includes(x.offer.status)&&(!item.offer.identity||x.offer.identity!==item.offer.identity)).slice(0,4);
}
