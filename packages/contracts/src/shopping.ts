import type { ReviewSummary } from './reviews.ts';
import { SHOPPING, guideFor, merchantFor } from '@aihot/industry/shopping';
export type DealStatus = 'Active' | 'Expired' | 'Out of Stock' | 'Unverified' | 'Upcoming';
export interface PriceObservation {at:string;listedPriceCents:number|null;checkoutPriceCents:number|null;currency:string;basis:'source-reported'|'merchant-verified';sourceUrl:string}
export interface AiOverview {format?:'recommendation';priceReason?:string|null;summary:string;bestFor:string|null;highlights:string[];cautions:string[]}
export interface Offer {
  review?:ReviewSummary|null;
  aiOverview?: AiOverview | null;
  activityScope?: 'single_product'|'multi_product'|'storewide'|'event'|'financial'|null;
  promotion?: {kind:'platform_sale'|'popular';quote:string}|null;
  kind: 'product_deal' | 'coupon_offer' | 'cashback_offer' | 'freebie' | 'shopping_news' | 'buying_guide' | 'recall';
  product: string | null; model: string | null; variant: string | null; condition: string | null;
  merchant: string | null; merchantId: string | null; seller: string | null; fulfillment: string | null;
  buyUrl: string | null; imageUrl: string | null; imageSource: string | null;
  listedPriceCents: number | null; checkoutPriceCents: number | null; currency: string;
  minimumSpend?: string | null; unitQuantity?: number | null; unitLabel?: string | null; unitPriceCents?: number | null;
  priceEvidence: string | null; comparison: string | null; shipping: string | null;
  cashback: string | null; giftCard: string | null; points: string | null;
  coupon: string | null; steps: string[]; restrictions: string[]; membership: string | null;
  subscription: string | null; renewal: string | null; cancellation: string | null;
  region: string | null; expiresAt: string | null; deadlineOriginal: string | null;
  warranty: string | null; returns: string | null; status: DealStatus;
  verifiedAt: string | null; lastCheckedAt: string | null; verificationNote: string;
  identity: string | null;
}
export const isOffer = (d: Pick<Offer,'kind'>) => !['shopping_news','buying_guide','recall'].includes(d.kind);
export function effectiveStatus(d: Pick<Offer,'status'|'expiresAt'|'verifiedAt'>, now = Date.now()): DealStatus {
  if (d.expiresAt && Number.isFinite(Date.parse(d.expiresAt)) && Date.parse(d.expiresAt) <= now) return 'Expired';
  if (d.status === 'Active' && (!d.verifiedAt || now - Date.parse(d.verifiedAt) > SHOPPING.verificationMaxAgeHours * 3600000)) return 'Unverified';
  return d.status;
}
export function cents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s=String(raw).trim().replace(/^\$\s*/, '').replaceAll(',', '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
  const [whole, fraction='']=s.split('.');
  const value=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function checkoutTotal(price: number, discount: number, shipping: number | null, fees = 0): number | null {
  if (![price,discount,fees].every(Number.isSafeInteger) || price < 0 || discount < 0 || discount > price || fees < 0 || shipping === null || !Number.isSafeInteger(shipping) || shipping < 0) return null;
  return price-discount+shipping+fees; // Rewards never enter the checkout calculation.
}
export function offerIdentity(d: Pick<Offer,'product'|'model'|'variant'|'condition'|'merchantId'|'seller'|'coupon'|'restrictions'|'membership'|'subscription'|'checkoutPriceCents'|'expiresAt'>): string | null {
  if (![d.product,d.model,d.variant,d.condition,d.merchantId,d.seller].every(x=>x?.trim())) return null;
  return JSON.stringify([d.model,d.variant,d.condition,d.merchantId,d.seller,d.coupon??'', [...d.restrictions].sort(),d.membership??'',d.subscription??'',d.checkoutPriceCents,d.expiresAt].map(x=>typeof x==='string'?x.trim().toLowerCase():x));
}
export function safeCopy(s: string): string {
  return s.replace(/(?:all[- ]time|historic(?:al)?|record)[ -]low(?:est)?(?: price)?|(?:30|90)[ -]day low|lowest(?:[- ]ever| price ever)|guaranteed lowest price|lowest price (?:anywhere|on the (?:web|internet))|insane deal|run,? don['’]t walk/gi,'reported offer');
}

/** Day in the site's time zone as YYYY-MM-DD. */
const dayOf=(ms:number)=>new Date(ms).toLocaleDateString('sv-SE',{timeZone:SHOPPING.timeZone});
export interface OfferTiming {
 /** When the item was posted on the site. */
 postedAt:string;
 /** Exact end (ISO 8601 with offset) when the source gave date, time and zone; else null. */
 endsAt:string|null;
 /** The calendar day (YYYY-MM-DD, site time zone) the source names as the end when no exact time exists. */
 endsDay:string|null;
 /** current: live by the evidence we have. ending: ends within two days. likely-ended: no deadline and older than the kind's shelf life. ended: deadline passed, expired or out of stock. */
 state:'current'|'ending'|'likely-ended'|'ended';
}
/**
 * What a reader needs to know about an offer's timing, from the stored deadline evidence and the
 * posting time only. No deadline is invented: without one, age against the kind's shelf life is the
 * only signal, and it is reported as "likely ended", never as a fact.
 */
export function offerTiming(d:Pick<Offer,'kind'|'status'|'expiresAt'|'deadlineOriginal'|'verifiedAt'>,postedAt:string,now=Date.now()):OfferTiming|null {
 if(!isOffer(d))return null;
 const posted=Date.parse(postedAt);if(!Number.isFinite(posted))return null;
 const status=effectiveStatus(d,now);
 const endsAt=d.expiresAt&&Number.isFinite(Date.parse(d.expiresAt))?d.expiresAt:null;
 const endsDay=endsAt?null:reportedDeadlineDay(d.deadlineOriginal,postedAt);
 const today=dayOf(now);const tomorrow=dayOf(now+86400000);
 let state:OfferTiming['state']='current';
 if(['Expired','Out of Stock'].includes(status))state='ended';
 else if(endsAt)state=Date.parse(endsAt)<=now?'ended':Date.parse(endsAt)-now<=2*86400000?'ending':'current';
 else if(endsDay)state=endsDay<today?'ended':endsDay<=tomorrow?'ending':'current';
 else{const shelf=(['product_deal','freebie'].includes(d.kind)?SHOPPING.productDealShelfDays:SHOPPING.couponShelfDays)*86400000;if(now-posted>shelf)state='likely-ended';}
 return {postedAt,endsAt,endsDay,state};
}
export interface OfferSavings {wasCents:number;nowCents:number;percent:number}
/** The reduction a reader sees on the card: both prices stated by the source, the lower one current. Tiny or implausible gaps are not shown. */
export function offerSavings(d:Pick<Offer,'listedPriceCents'|'checkoutPriceCents'>):OfferSavings|null {
 const was=d.listedPriceCents,now=d.checkoutPriceCents;
 if(was===null||now===null||!Number.isSafeInteger(was)||!Number.isSafeInteger(now)||was<=now||now<0)return null;
 const percent=Math.round((was-now)/was*100);
 return percent>=5&&percent<=95?{wasCents:was,nowCents:now,percent}:null;
}
/**
 * Headline wording for readers: the site labels sourcing separately, so "Reported at $20" reads as
 * "at $20" and an unknown price no longer carries a parenthetical. Older stored headlines keep their
 * text; this is applied where they are read.
 */
export function plainTitle(title:string):string {
 return title
  .replace(/\s*\((?:price|prices?)\s+unspecified\)/gi,'')
  .replace(/\b(at|for|from|on|starting at|starting from|to|down to)\s+a\s+reported\b/gi,'$1')
  .replace(/\breported\s+(at|for|from|on|to|starting|available|down|priced|listed|selling|offered|now)\b/gi,'$1')
  .replace(/\breported\s+(?=\$)/gi,'at ')
  .replace(/\s{2,}/g,' ').trim();
}
export function unitPrice(price:number|null, quantity:number|null):number|null { return price===null||quantity===null||!Number.isFinite(quantity)||quantity<=0?null:Math.round(price/quantity); }
export function cleanMerchantLink(raw:string):string {
 const u=new URL(raw);
 for(const key of [...u.searchParams.keys()])if(/^(utm_.+|tag|linkCode|linkId|ascsubtag|irclickid|irgwc|irpid|irext|isir|irsrc|camp|creative|ref_|clickid|afsrc|sourceid|veh|wmlspartner|affiliates_ad_id|campaign_id|sharedid|subid\d*|cm_mmc|gaOptInStatus)$/i.test(key))u.searchParams.delete(key);
 return u.href;
}

export interface FlashDealEvidence {
 currentPriceCents:number;previousPriceCents:number;previousObservedAt:string;
 expiresAt:string;observations:number;priceType:'checkout'|'listed';
}
// A recorded low is confined to comparable observations, never MSRP or reward-adjusted prices.
export function flashDealEvidence(d:Offer,history:PriceObservation[],now=Date.now()):FlashDealEvidence|null {
 if(!['product_deal','freebie'].includes(d.kind)||!d.buyUrl||d.currency!=='USD'||!['Active','Unverified'].includes(effectiveStatus(d,now)))return null;
 const deadline=d.expiresAt?Date.parse(d.expiresAt):NaN;
 if(!Number.isFinite(deadline)||deadline<=now)return null;
 const checkout=d.checkoutPriceCents!==null;const current=checkout?d.checkoutPriceCents:d.listedPriceCents;
 if(current===null||!Number.isSafeInteger(current)||current<0)return null;
 const prices=history.flatMap(h=>{const price=checkout?h.checkoutPriceCents:h.listedPriceCents;const at=Date.parse(h.at);return h.currency==='USD'&&Number.isFinite(at)&&at<=now&&price!==null&&Number.isSafeInteger(price)&&price>=0?[{price,at:h.at}]:[];}).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const latest=prices.at(-1);
 if(prices.length<2||latest?.price!==current||prices.some(p=>p.price<current))return null;
 const previous=prices.slice(0,-1).reverse().find(p=>p.price>current&&Date.parse(p.at)<Date.parse(latest.at));
 if(!previous)return null;
 return {currentPriceCents:current,previousPriceCents:previous.price,previousObservedAt:previous.at,expiresAt:d.expiresAt!,observations:prices.length,priceType:checkout?'checkout':'listed'};
}

export interface DealPick {kind:'platform_sale'|'popular'|'editorial';source:string;reason:string;expiresAt:string|null;freshUntil:string;deadline:string|null;deadlineDay:string|null}
export function reportedDeadlineDay(text:string|null,reportedAt:string):string|null {
 if(!text)return null;
 const sourceTime=Date.parse(reportedAt);if(!Number.isFinite(sourceTime))return null;
 const sourceDay=new Date(sourceTime).toLocaleDateString('sv-SE',{timeZone:SHOPPING.timeZone});
 if(/\b(?:today|tonight)\b/i.test(text))return sourceDay;
 let year:number,month:number,day:number;let m;
 if((m=/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text))){year=Number(m[1]);month=Number(m[2]);day=Number(m[3]);}
 else if((m=/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(text))){year=Number(m[3]);month=Number(m[1]);day=Number(m[2]);}
 else if((m=/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i.exec(text))){year=Number(m[3]??sourceDay.slice(0,4));month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1]!.slice(0,3).toLowerCase())+1;day=Number(m[2]);}
 else return null;
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.toISOString().slice(0,10):null;
}
export function sourceDealPick(d:Offer,sourceUrl:string,publishedAt:string,now=Date.now()):DealPick|null {
 if(!['product_deal','freebie'].includes(d.kind)||!d.product||!d.buyUrl||d.currency!=='USD'||!['Active','Unverified'].includes(effectiveStatus(d,now)))return null;
 const price=d.checkoutPriceCents??d.listedPriceCents;
 if(price===null||!Number.isSafeInteger(price)||price<0)return null;
 const published=Date.parse(publishedAt);const freshUntil=published+SHOPPING.dealDiscoveryMaxAgeDays*86400000;
 if(!Number.isFinite(published)||published>now+300000||freshUntil<=now)return null;
 const deadline=reportedDeadlineDay(d.deadlineOriginal,publishedAt);
 if(deadline&&deadline<new Date(now).toLocaleDateString('sv-SE',{timeZone:SHOPPING.timeZone}))return null;
 const guide=guideFor(sourceUrl);const merchant=merchantFor(sourceUrl);
 if(!guide&&!merchant)return null;
 const source=guide?.name??merchant!.name;
 const base={source,expiresAt:d.expiresAt,freshUntil:new Date(freshUntil).toISOString(),deadline:d.deadlineOriginal,deadlineDay:deadline};
 if(d.promotion?.quote)return {...base,kind:d.promotion.kind,reason:d.promotion.quote};
 if(guide)return {...base,kind:'editorial',reason:source+' reports this product offer. Review the stated price and conditions.'};
 return null;
}
export function supportedPromotion(raw:Offer['promotion'],material:string):Offer['promotion'] {
 if(!raw?.quote)return null;
 const quote=raw.quote.trim().split(/\s+/).slice(0,20).join(' ');
 if(quote.length<8||!material.replace(/\s+/g,' ').includes(quote))return null;
 const signal=raw.kind==='popular'?/best[ -]?seller|best[ -]?selling|trending|most popular|hot deal|frontpage/i:/flash sale|deal of the day|lightning deal|limited[ -]time|today only|clearance|sale|\boff\b|\bsave\b/i;
 return signal.test(quote)?{kind:raw.kind,quote}:null;
}

// Single-product activities are a broader feed than verified or historically discounted deals.
export function isProductActivity(d:Offer,publishedAt:string,title='',now=Date.now()):boolean {
 if(!isOffer(d)||!d.product?.trim()||!['Active','Unverified','Upcoming'].includes(effectiveStatus(d,now)))return false;
 if(d.activityScope&&d.activityScope!=='single_product')return false;
 if(!d.activityScope&&/^(?:select|selected)\b.*\b(?:products|styles|items)\b/i.test(d.product))return false;
 // Legacy extractions may put an event or a collection name in the product field.
 if(!d.activityScope&&/\b(?:storewide|sitewide|all (?:menu-priced|items|products)|select(?:ed)? (?:items|products|styles)|(?:fall|summer|winter|spring|clearance|outlet|ladder) sale|eyewear collection|build event|checking(?:℠)? account|bank account|credit card)\b/i.test(d.product+' '+title))return false;
 const day=reportedDeadlineDay(d.deadlineOriginal,publishedAt);
 return !day||day>=new Date(now).toLocaleDateString('sv-SE',{timeZone:SHOPPING.timeZone});
}
