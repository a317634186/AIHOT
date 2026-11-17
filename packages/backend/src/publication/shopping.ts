// The single shopping read layer used by pages, feeds, API, MCP and briefings.
import { isReviewContent,isGuideArticle,isReviewHeadline } from '@aihot/contracts/reviews';
import { SHOPPING, MERCHANTS, isDirectRetailerEventUrl, isDirectRetailerProductUrl, merchantFor } from '@aihot/industry/shopping';
import { brandSlug, cents, effectiveStatus, flashDealEvidence, sourceDealPick, isProductActivity, isOffer, isCalibratedRegularPrice, isNavigationTitle, safeCopy, plainTitle, offerTiming, flashSavings, offerSavings, affiliateLink, cleanMerchantLink, unitPrice, type Offer, type OfferTiming, type PriceObservation, type FlashDealEvidence, type DealPick } from '@aihot/contracts/shopping';
import { canonicalProductTargetKey, eventCampaignKey, normalizedCouponKey, sameRetailerProductDeal } from '@aihot/contracts/shopping-dedup';
import {consistentOfferTitle,headlineOfferPrice,homepageEligible,needsLinkRepair,isSaleAnnouncement,isNonPromotionalAnnouncement,saleAnnouncementAsNews,reviewAsGuide,sourceDealBenefitEvidence,limitedOfferEvidence,validateCouponPrice} from '@aihot/contracts/shopping-integrity';
import { sql } from '../db.ts';
import { dealRank } from './shopping-ranking.ts';
import { proxiedImage, proxiedImageSet } from '../media/imgproxy.ts';
import { savlumeCache, staleWhileRevalidate } from './memory-cache.ts';
/**
 * Safety bound on one scan, far above the public working set so a reported total is the real total.
 * The cap exists only to stop an unbounded read if the table grows abnormally; it must never be the
 * reason a published item disappears from the API, the feeds or MCP.
 */
const SCAN_LIMIT = 20_000;
const DIRECT_LINK_REQUIRED_KINDS=new Set(['product_deal','coupon_offer','cashback_offer','freebie']);
const requiresDirectRetailerLink=(offer:Offer)=>DIRECT_LINK_REQUIRED_KINDS.has(offer.kind);
const BRAND_NAMES=['New Balance','Under Armour','KitchenAid','Instant Pot','Hewlett Packard','The North Face','Milwaukee','Craftsman','DeWalt','Kenneth Cole','Anker','Samsung','Microsoft','Nintendo','Sennheiser','Logitech','Corsair','Garmin','Hisense','Roborock','Ecovacs','Theragun','Patagonia','Columbia','CeraVe','Cetaphil','Adidas','Lenovo','Google','Amazon','Apple','Sony','Dell','Havit','Fohere','Huion','UGREEN','Baseus','Razer','Dyson','Shark','Bose','Canon','Nikon','Ninja','Keurig','Mattel','Hasbro','Lego','Nike','Ryobi','EGO','OXO','TCL','Beats','JBL','Acer','ASUS','HP','LG','Ring','eufy','iRobot','Wilson','Mido'];
function inferredBrand(offer:Offer,headline=''):string|null{
 if(offer.brand?.trim())return offer.brand.trim();
 const product=normalized([offer.product,offer.model].filter(Boolean).join(' ')),title=normalized(headline).slice(0,90);
 return BRAND_NAMES.slice().sort((a,b)=>b.length-a.length).find(name=>{const key=normalized(name);return product===key||product.startsWith(key+' ')||title.startsWith(key+' ')||title===key;})??null;
}
/** Image addresses for the page: our signed proxy (cached, resized) in front of the source image. `offer.imageUrl` stays the original for metadata. */
export interface ItemImage {src:string;srcSet:string|null;hero:string;sourceUrl:string|null;fallback?:{src:string;srcSet:string|null;hero:string;sourceUrl:string|null}}
/** Why an offer sits in the limited-time strip; every flag is backed by stored evidence. */
export interface FlashHighlight {percent:number;recordedLow:boolean;popular:boolean;clicks:number;likes:number}
export interface PriceDisplay {state:'current'|'ended'|'stale'|'unavailable';amountCents:number|null;label:string;verification:'merchant-verified'|'last-verified'|'source-reported'|'unavailable';verifiedAt:string|null;lastCheckedAt:string|null}
export interface CommunityRating {worthIt:number;notWorthIt:number;votes:number;}
export interface ShoppingItem {priceDisplay:PriceDisplay;recordedDealPriceCents?:number|null;recordedDealAt?:string|null;communityRating?:CommunityRating;flash?:FlashHighlight;thirdPartySeller?:boolean;productActivity?:boolean;indexable?:boolean;updatedAt?:string;dealPick?:DealPick;sourcePublishedAt?:string|null;flashDeal?:FlashDealEvidence;timing:OfferTiming|null;image:ItemImage|null; id:string;title:string;summary:string;reason:string|null;category:string|null;tags:string[];score:number|null;selected:boolean;source:string;sourceUrl:string;publishedAt:string;offer:Offer;sources:Array<{name:string;url:string}>; }
/** Sold by a retailer in the registry: the link resolves there, or the source names it as the seller (DealNews-style redirects). */
const retailerName=(v:string|null|undefined)=>(v??'').toLowerCase().replace(/[’']/g,'').replace(/\s+/g,' ').trim().replace(/^the /,'').replace(/[.,]?\s*(?:inc|llc|ltd|co|corp|corporation|company)\.?$/,'').trim();
const knownRetailer=(d:Offer)=>!!d.merchantId||!!d.seller&&MERCHANTS.some(m=>{const a=retailerName(m.name),b=retailerName(d.seller);return a===b||b.startsWith(a+' ')||a.startsWith(b+' ');});
/** Reviews: at most this many results from one publisher before the remaining sources get their turn. */
const REVIEW_SOURCE_CAP=6;
/**
 * A headline that weighs options against each other or ranks a shortlist: review reading, even when
 * extraction shelved the article as news. Price-drop and sale headlines are excluded.
 */
const COMPARISON_HEADLINE=/\bvs\.?\b|\bcomparison\b|\bwhich\b[^.?]{0,60}\b(?:better|should|suits?)\b|\b(?:\d+\s+)?best\b(?!\s+(?:deals?|offers?|prices?|discounts?|sales?|buy))|\bpicks?\b.*\b20\d\d\b/i;
const normalized=(value:string|null|undefined)=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const normalizedList=(values:string[]|null|undefined)=>(values??[]).map(normalized).filter(Boolean).sort().join('|');
function dedupBucketKey(item:ShoppingItem){
 const eventKey=eventCampaignKey(item.title,item.offer);
 if(eventKey)return `event|${eventKey}`;
 const urlKey=canonicalProductTargetKey(item.offer.buyUrl);
 if(urlKey)return `target|${urlKey}`;
 const d=item.offer;if(!d.merchantId)return null;
 const model=normalized(d.model),product=normalized(d.product);
 if(!model&&!product)return null;
 return `${d.kind}|${d.merchantId}|${model?'model:'+model:'product:'+product}`;
}
function sellerKey(d:Offer){const seller=normalized(d.seller),merchant=normalized(d.merchant??d.merchantId);if(!seller)return 'unknown';const base=seller.split(' via ')[0]!.replace(/\b(?:com|inc|llc|ltd|corp|corporation|company)\b/g,'').trim();const retail=merchant.replace(/\b(?:com|inc|llc|ltd|corp|corporation|company)\b/g,'').trim();return base===retail||base===normalized(d.merchantId)?'retailer':'seller:'+base;}
function sameProduct(a:Offer,b:Offer){const ap=normalized(a.product),bp=normalized(b.product),am=normalized(a.model),bm=normalized(b.model);if(ap&&bp&&ap===bp)return !am||!bm||am===bm;if(!am||am!==bm||!ap||!bp)return false;const left=new Set(ap.split(' ')),right=new Set(bp.split(' '));const overlap=[...left].filter(token=>right.has(token)).length;return overlap/Math.max(left.size,right.size)>=0.7;}
function sameOfferTerms(a:Offer,b:Offer){
 if(a.kind!==b.kind||a.merchantId!==b.merchantId||!sameProduct(a,b))return false;
 if(normalized(a.model)&&normalized(b.model)&&normalized(a.model)!==normalized(b.model))return false;
 if(normalized(a.variant)!==normalized(b.variant)||normalized(a.condition)!==normalized(b.condition))return false;
 const as=sellerKey(a),bs=sellerKey(b);if(as!==bs&&!(as==='unknown'&&bs==='retailer')&&!(bs==='unknown'&&as==='retailer'))return false;
 return normalizedCouponKey(a.coupon)===normalizedCouponKey(b.coupon)
  &&normalized(a.minimumSpend)===normalized(b.minimumSpend)
  &&normalized(a.membership)===normalized(b.membership)
  &&normalized(a.subscription)===normalized(b.subscription)
  &&normalized(a.renewal)===normalized(b.renewal)
  &&normalized(a.shipping)===normalized(b.shipping)
  &&normalized(a.fulfillment)===normalized(b.fulfillment)
  &&normalized(a.region)===normalized(b.region)
  &&normalized(a.cashback)===normalized(b.cashback)
  &&normalized(a.giftCard)===normalized(b.giftCard)
  &&normalized(a.points)===normalized(b.points)
  &&normalized(a.unitLabel)===normalized(b.unitLabel)
  &&a.unitQuantity===b.unitQuantity
  &&normalizedList(a.restrictions)===normalizedList(b.restrictions);
}
function sameOfferWindow(a:ShoppingItem,b:ShoppingItem){
 const end=(x:ShoppingItem)=>x.timing?.endsDay??x.timing?.endsAt?.slice(0,10)??null;
 const ae=end(a),be=end(b);if(ae&&be)return ae===be;
 const distance=Math.abs(Date.parse(a.publishedAt)-Date.parse(b.publishedAt));
 return ae||be?distance<=2*86400000:true;
}
export const sameRetailerDeal=sameRetailerProductDeal;
interface OfferGroup {canonical:ShoppingItem;latest:ShoppingItem;ids:string[];sources:Array<{name:string;url:string}>;updatedAt:string}
/**
 * The same product reported by several publishers is one entity for a reader, whatever retailer or
 * listing wording it came in with. Keys are built from brand plus model, then the product name's
 * distinctive words, with condition and packaging noise removed.
 */
const ENTITY_STOP=new Set(['the','and','for','with','from','new','open','box','used','refurbished','renewed','latest','model','version','edition','pack','set','bundle','count','piece','pieces','inch','inches','in','mm','cm','gb','tb','oz','lb','lbs','ml','free','shipping','prime','membership','required','amazon','walmart','target','woot','best','buy','costco','deal','deals','sale','offer','savings','percent','off']);
/** Brand plus the distinctive words of a product name, used to bucket candidates before comparing. */
function entityBucket(item:ShoppingItem):string|null{
 const d=item.offer;
 // A storewide sale or multi-product event is one entity when the source names the campaign.
 if(['event','storewide','multi_product'].includes(d.activityScope??'')){
  return `campaign:${eventCampaignKey(item.title,d)??d.activityScope}`;
 }
 // A review or guide about one product is also one entity; a roundup is not.
 if(!['product_deal','coupon_offer','cashback_offer','freebie','buying_guide','shopping_news','recall'].includes(d.kind))return null;
 const clean=(v:string|null|undefined)=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const brand=clean(d.brand);
 const words=(value:string)=>clean(value).split(' ').filter(w=>w.length>2&&!ENTITY_STOP.has(w)&&!/^\d+$/.test(w));
 const model=clean(d.model);
 // The bucket must not hinge on one word: publishers lead with different nouns ("Ferris Wheel" vs
 // "Iconic Ferris Wheel"). Intermediate comparisons happen inside the brand bucket instead.
 // A sale announcement has no brand or product, so its headline is the only identity it has; two
 // publishers covering the same sale usually post near-identical headlines.
 if(!brand&&!d.product&&!d.model){
  // Publishers punctuate the same announcement differently ("Sale:" / "gear:"), so the bucket uses
  // the sorted set of meaningful headline words rather than the raw string.
  const tokens=[...new Set(clean(item.title).split(' ').filter(w=>w.length>1&&!ENTITY_STOP.has(w)&&!/^\d+$/.test(w)))].sort();
  return tokens.length>=3?`headline:${tokens.join('')}`:null;
 }
 return brand||null;
}
/** Words that identify the product, ignoring packaging and marketing wording publishers add. */
function entityTokens(item:ShoppingItem):Set<string>{
 const clean=(v:string|null|undefined)=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const all=`${clean(item.offer.brand)} ${clean(item.offer.model)} ${clean(item.offer.product||item.title)}`.split(' ');
 return new Set(all.filter(w=>w.length>1&&!ENTITY_STOP.has(w)&&!/^\d+$/.test(w)));
}
/** Two listings describe one product when their identifying words mostly coincide. */
function sameEntity(a:ShoppingItem,b:ShoppingItem):boolean{
 const left=entityTokens(a),right=entityTokens(b);
 if(!left.size||!right.size)return false;
 // Publishers pad one name with extra marketing words, so the shorter name should be contained in
 // the longer one. Requiring three shared words keeps "AirPods Pro 3" apart from "AirPods Max".
 const shared=[...left].filter(word=>right.has(word)).length;
 const smaller=Math.min(left.size,right.size);
 return shared>=3&&shared/smaller>=0.8;
}

/** Which of two listings of one product a reader should see: a live price, a real markdown, freshest. */
function entityRank(item:ShoppingItem):number{
 const d=item.offer;
 const live=item.priceDisplay?.state==='current'&&item.priceDisplay.amountCents!==null;
 const saving=offerSavings(d);
 return (live?1000:0)+(saving?saving.percent*2:0)+(item.priceDisplay?.verification==='merchant-verified'?120:0)+(d.buyUrl?60:0)+(item.image?30:0);
}
function preferEntity(a:ShoppingItem,b:ShoppingItem):ShoppingItem{
 const ra=entityRank(a),rb=entityRank(b);
 if(ra!==rb)return ra>rb?a:b;
 return Date.parse(a.publishedAt)>=Date.parse(b.publishedAt)?a:b;
}
function dedupeProductEntities(items:ShoppingItem[]):{items:ShoppingItem[];aliases:Map<string,ShoppingItem>}{
 const winners:Array<{bucket:string;item:ShoppingItem}>=[];
 const aliases=new Map<string,ShoppingItem>();
 const out:ShoppingItem[]=[];
 for(const item of items){
  const bucket=entityBucket(item);
  if(!bucket){out.push(item);continue;}
  // A headline bucket is already an exact identity, so no token comparison is needed.
  const match=winners.find(entry=>entry.bucket===bucket&&(bucket.startsWith('headline:')||sameEntity(entry.item,item)));
  if(!match){winners.push({bucket,item});out.push(item);aliases.set(item.id,item);continue;}
  // Keep the single best listing for the product; the rest stay resolvable by id.
  const best=preferEntity(match.item,item);
  if(best!==match.item){
   const index=out.indexOf(match.item);
   if(index>=0)out[index]=best;
   match.item=best;
  }
  aliases.set(item.id,match.item);
 }
 return {items:out,aliases};
}

function consolidateOffers(items:ShoppingItem[]){
 const groups:OfferGroup[]=[];const buckets=new Map<string,OfferGroup[]>();
 for(const item of items){
  const itemIds=(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id];
  const key=dedupBucketKey(item);
  const isEventBucket=key?.startsWith('event|')??false;
  let group=key?(buckets.get(key)??[]).find(g=>{
   const distance=Math.abs(Date.parse(g.latest.publishedAt)-Date.parse(item.publishedAt));
   if(isEventBucket){
    const ended=(d:Offer)=>d.status==='Expired'||d.status==='Out of Stock';
    return ended(g.latest.offer)===ended(item.offer)&&distance<=21*86400000;
   }
   return Boolean(g.latest.offer.identity&&g.latest.offer.identity===item.offer.identity)
    ||sameOfferTerms(g.latest.offer,item.offer)&&sameOfferWindow(g.latest,item)
    ||sameRetailerDeal(g.latest.offer,item.offer)&&sameOfferWindow(g.latest,item)&&distance<=14*86400000;
  }):undefined;
  if(!group){group={canonical:item,latest:item,ids:[...itemIds],sources:[...item.sources],updatedAt:item.updatedAt??item.publishedAt};groups.push(group);if(key){const list=buckets.get(key)??[];list.push(group);buckets.set(key,list);}continue;}
  for(const id of itemIds)if(!group.ids.includes(id))group.ids.push(id);
  for(const source of item.sources)if(!group.sources.some(s=>s.url===source.url))group.sources.push(source);
  const betterCanonical=(candidate:ShoppingItem,current:ShoppingItem)=>{
   if(Boolean(candidate.indexable)!==Boolean(current.indexable))return Boolean(candidate.indexable);
   if(Boolean(candidate.image)!==Boolean(current.image))return Boolean(candidate.image);
   return Date.parse(candidate.publishedAt)<Date.parse(current.publishedAt);
  };
  if(betterCanonical(item,group.canonical))group.canonical=item;
  if(Date.parse(item.publishedAt)>Date.parse(group.latest.publishedAt))group.latest=item;
  if(Date.parse(item.updatedAt??item.publishedAt)>Date.parse(group.updatedAt))group.updatedAt=item.updatedAt??item.publishedAt;
 }
 const aliases=new Map<string,ShoppingItem>();
 const merged=groups.map(group=>{
  const base=group.canonical.image&&!group.latest.image?{...group.latest,image:group.canonical.image,offer:{...group.latest.offer,imageUrl:group.latest.offer.imageUrl??group.canonical.offer.imageUrl,imageSource:group.latest.offer.imageSource??group.canonical.offer.imageSource}}:group.latest;
  const item={...base,id:group.canonical.id,indexable:group.canonical.indexable,updatedAt:group.updatedAt,sources:group.sources};
  if(group.ids.length>1)Object.defineProperty(item,'_duplicateIds',{value:group.ids,enumerable:false});
  for(const id of group.ids)aliases.set(id,item);
  return item;
 });
 return {items:merged,aliases};
}
/** On a marketplace, the listing is sold by someone other than the retailer. */

const KNOWN_BROKEN_IMAGES = new Set([
  "https://m.media-amazon.com/images/I/61bK6PMOC3L._AC_SL1500_.jpg",
  "https://m.media-amazon.com/images/I/71+lP52nlrL._AC_SL1500_.jpg",
  "https://m.media-amazon.com/images/G/01/US-hq/2023/img/Deals/XCM_Manual_1540608_5330342_US_deals_banner_1500x300.jpg",
  "https://i5.walmartimages.com/dfw/4ff9c6c9-d264/k2-_6e632cb6-e0e9-4467-8f72-18ad134c442d.v1.jpg",
  "https://target.scene7.com/is/image/Target/GUEST_62d2948e-f1b2-4d92-9a00-1c0b39678129",
  "https://d3gqasl9vmjfd8.cloudfront.net/95bf4153-f726-444c-bc63-1463e264906f.png",
  "https://pisces.bbystatic.com/image2/BestBuy_US/dam/GL-83446-flsh-230922-der-230922_DER-3407e782-b7a4-4f33-8a70-8b176ff472dc.jpg",
  "https://m.media-amazon.com/images/I/71YvK4Z87ZL._AC_SL1500_.jpg",
  "https://www.bestbuy.com/~assets/bby/_com/header-footer/images/bby_logo-a7e90594729ed2e119331378def6c97e.png"
]);

const MERCHANT_DEFAULT_IMAGES: Record<string, string> = {
  "amazon": "https://m.media-amazon.com/images/P/B096SV8SJG.01._SCLZZZZZZZ_.jpg",
  "walmart": "https://i5.walmartimages.com/seo/Meta-Quest-3S-128GB-VR-Headset-Level-Double-Storage-2X-Graphical-Processing-Power-Virtual-Reality-Without-Wires-Access-40-Games-3-Month-Trial-Meta-Ho_027019c9-514d-461d-ae71-dba8b872d7d2.f53a12ab8bae74c4a584145b9254eb5d.jpeg",
  "best-buy": "https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6570/6570087_sd.jpg;maxHeight=919;maxWidth=1087",
  "target": "https://hip2save.com/wp-content/uploads/2026/10/target-blanket.png",
  "woot": "https://images-na.ssl-images-amazon.com/images/S/mediaservice.woot.com/b165dfa5-b7d1-405b-a0c5-37c65a6f3cc3._AC_SR882,441_.jpg"
};

const PRODUCT_IMAGE_OVERRIDES: Record<string,{url:string;source:string}> = {
  "curated-earbuds-beats-studio-buds": {
    url: "https://m.media-amazon.com/images/P/B096SV8SJG.01._SCLZZZZZZZ_.jpg",
    source: "https://www.amazon.com/dp/B096SV8SJG/",
  },
  "curated-airfryer-instant-vortex": {
    url: "https://instantpot.com/cdn/shop/files/140-3079-01_Vortex_Plus_4QT_Silo_01_ATF.png",
    source: "https://instantpot.com/products/instant-pot-vortex-plus-4qt-air-fryer",
  },
};

function isBrokenOrUnusableImage(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string' || url.trim().length === 0) return true;
  const trimmed = url.trim();
  if (KNOWN_BROKEN_IMAGES.has(trimmed)) return true;
  if (/(?:slickdeals\.net\/attachment|bestbuy\.com\/~assets|GL-83446-flsh|71YvK4Z87ZL)/i.test(trimmed)) return true;
  if (/\.(?:svg|gif)($|\?)/i.test(trimmed)) return true;
  if (/\/(?:emoji|avatar|icon|badge|gravatar)s?\//i.test(trimmed)) return true;
  return false;
}

// Deal-blog hosts that stamp watermarks or crop press images; the official merchant shot is better.
const WATERMARKED_IMAGE_HOST=/(?:9to5toys|9to5mac|hip2save|the-gadgeteer|money.?saving.?mom|bensbargains|dlnws)\.com/i;
function isThirdPartyBlogImage(url:string|null|undefined):boolean{
 return typeof url==='string'&&WATERMARKED_IMAGE_HOST.test(url);
}

/**
 * The official Amazon product image for an ASIN, which is always a clean white-background shot.
 * Derived from the offer's own buy URL so no extra request is needed at read time.
 */
function asinProductImage(buyUrl:unknown):string|null{
 if(typeof buyUrl!=='string')return null;
 // Amazon URLs carry a descriptive slug before /dp/ (".../Apple-generation-.../dp/B0HMX69N2K"), so
 // the marker can appear anywhere in the path.
 const m=/amazon\.com\/(?:.*\/)?(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(buyUrl);
 return m?`https://m.media-amazon.com/images/P/${m[1]}.01._SCLZZZZZZZ_.jpg`:null;
}

function sanitizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let url = raw.trim().replace(/&#038;/g, '&');
  if (url.includes('platform.theverge.com') && !url.includes('w=')) {
    url += (url.includes('?') ? '&' : '?') + 'w=1200';
  }
  return url;
}

export const thirdPartySeller=(d:Offer)=>!!d.merchantId&&!!d.seller&&!!d.merchant&&d.seller.length<=40&&!/[,;]|\b(?:including|various|multiple|select|retailers?|sellers?)\b/i.test(d.seller)&&retailerName(d.seller)!==retailerName(d.merchant)&&!retailerName(d.seller).startsWith(retailerName(d.merchant));
const live=(x:ShoppingItem)=>!x.timing||x.timing.state==='current'||x.timing.state==='ending';
const endsMs=(x:ShoppingItem)=>x.timing?.endsAt?Date.parse(x.timing.endsAt):x.timing?.endsDay?Date.parse(x.timing.endsDay+'T23:59:59-04:00'):Number.MAX_SAFE_INTEGER;
function itemImage(url:unknown,fallbackUrl:unknown=null,sourceUrl:unknown=null,fallbackSourceUrl:unknown=null):ItemImage|null {
 if(typeof url!=='string')return null;
 const rendition=(value:string,origin:unknown)=>{const src=proxiedImage(value,'image-720');const hero=proxiedImage(value,'image-1200');return src&&hero?{src,srcSet:proxiedImageSet(value,'card'),hero,sourceUrl:typeof origin==='string'?origin:null}:null;};
 try{const primary=rendition(url,sourceUrl);if(!primary)return null;const fallback=typeof fallbackUrl==='string'&&fallbackUrl!==url?rendition(fallbackUrl,fallbackSourceUrl):null;return {...primary,...(fallback?{fallback}:{})};}catch{return null;}
}
function productTitle(offer:Offer,amount:number|null):string{
 const merchant=offer.merchant??offer.seller??'the retailer';
 const itemName=(offer.product??offer.model)?.trim()??'';const brand=offer.brand?.trim()??'';
 const base=(itemName&&brand&&!normalized(itemName).startsWith(normalized(brand))?`${brand} ${itemName}`:itemName||brand).replace(/\s+/g,' ').trim()||'Shopping offer';
 const variant=offer.variant?.trim(),detail=variant&&!normalized(base).includes(normalized(variant))?` (${variant})`:'';
 if(amount!==null){const price=new Intl.NumberFormat('en-US',{style:'currency',currency:offer.currency||'USD'}).format(amount/100);return `${base}${detail} for ${price}${offer.coupon?' with code':''} at ${merchant}`.slice(0,180);}
 const benefit=offer.coupon?' with a coupon':offer.cashback?' with cashback':offer.giftCard?' with a gift card offer':'';
 return `${base}${detail}${benefit} at ${merchant}`.slice(0,180);
}
export type ShoppingSort='popular'|'discount'|'latest'|'ending';
function feedRankCacheKey(opts: NonNullable<Parameters<typeof shoppingItems>[0]> = {}): string | null {
 if (opts.id || opts.ids || opts.product || opts.model || opts.variant || opts.condition || opts.scanAll || opts.q) return null;
 return JSON.stringify({ view: opts.view ?? "latest", cat: opts.category ?? "", m: opts.merchant ?? "", b: opts.brand ?? "", s: opts.sort ?? "", maxPriceCents: opts.maxPriceCents ?? null, minDiscountPercent: opts.minDiscountPercent ?? null, idx: !!opts.indexableOnly });
}

async function computeShoppingItems(opts:{view?:string;category?:string;merchant?:string;brand?:string;sort?:ShoppingSort;q?:string;limit?:number;offset?:number;id?:string;ids?:string[];product?:string;model?:string;variant?:string;condition?:string;scanAll?:boolean;indexableOnly?:boolean;maxPriceCents?:number;minDiscountPercent?:number}={}): Promise<ShoppingItem[]> {
 const rows=await sql`SELECT p.article_id,p.title,p.summary,p.reason,p.category,p.tags,p.score,p.selected,p.url,p.timeline_at,p.published_at,p.seo_excluded_at,p.eligible,a.processing_state,a.media AS article_media,GREATEST(p.updated_at,d.content_updated_at) AS modified,s.name,d.data,CASE WHEN ${opts.view??''}=ANY(ARRAY['deals','flash','coupons','ending']) OR NULLIF(d.data->>'coupon','') IS NOT NULL OR d.data->>'kind'='coupon_offer' THEN COALESCE(a.title,'') || ' ' || LEFT(COALESCE(a.body_text,''),5000) ELSE '' END AS evidence_text,CASE WHEN p.timeline_at<=now()-interval '20 days' OR NULLIF(d.data->>'expiresAt','') IS NOT NULL OR NULLIF(d.data->>'deadlineOriginal','') IS NOT NULL THEN (EXISTS(SELECT 1 FROM community_posts cp WHERE cp.article_id=p.article_id AND cp.status='published') OR EXISTS(SELECT 1 FROM shopping_comparison_quotes q WHERE q.article_id=p.article_id) OR EXISTS(SELECT 1 FROM shopping_price_observations h WHERE h.article_id=p.article_id OFFSET 1 LIMIT 1)) ELSE false END AS has_unique_content,CASE WHEN p.timeline_at<=now()-interval '30 days' OR NULLIF(d.data->>'expiresAt','') IS NOT NULL OR NULLIF(d.data->>'deadlineOriginal','') IS NOT NULL THEN EXISTS(SELECT 1 FROM shopping_price_observations h WHERE h.article_id=p.article_id AND h.currency='USD' AND (h.listed_price_cents IS NOT NULL OR h.checkout_price_cents IS NOT NULL)) ELSE false END AS has_price_history,recorded.price AS recorded_deal_price,recorded.at AS recorded_deal_at
 FROM publications p JOIN articles a ON a.id=p.article_id JOIN shopping_offers d ON d.article_id=p.article_id JOIN sources s ON s.id=p.source_id LEFT JOIN LATERAL (SELECT coalesce(h.checkout_price_cents,h.listed_price_cents) AS price,h.observed_at AS at FROM shopping_price_observations h WHERE d.data->>'priceRestored'='true' AND h.article_id=p.article_id AND h.basis='source-reported' AND h.currency='USD' AND (h.checkout_price_cents IS NOT NULL OR h.listed_price_cents IS NOT NULL) ORDER BY coalesce(h.checkout_price_cents,h.listed_price_cents) ASC,h.observed_at DESC LIMIT 1) recorded ON true
 WHERE (p.visibility='public' OR (${opts.id??null}::text IS NOT NULL AND p.visibility='summary-only')) AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes'
 AND (${opts.id??null}::text IS NULL OR p.article_id=${opts.id??null} OR (p.eligible AND a.processing_state<>'blocked' AND EXISTS(
  SELECT 1 FROM shopping_offers target WHERE target.article_id=${opts.id??null}
   AND NULLIF(target.data->>'merchantId','') IS NOT NULL AND target.data->>'merchantId'=d.data->>'merchantId'
   AND target.data->>'kind'=d.data->>'kind' AND (
    (NULLIF(target.data->>'model','') IS NOT NULL AND regexp_replace(lower(target.data->>'model'),'[^a-z0-9]+','','g')=regexp_replace(lower(d.data->>'model'),'[^a-z0-9]+','','g'))
    OR (NULLIF(target.data->>'product','') IS NOT NULL AND regexp_replace(lower(target.data->>'product'),'[^a-z0-9]+','','g')=regexp_replace(lower(d.data->>'product'),'[^a-z0-9]+','','g'))
   )
 )))
 AND (${opts.id??null}::text IS NOT NULL OR (a.processing_state<>'blocked' AND (p.eligible OR (COALESCE((d.data->>'priceRestored')::boolean,false) AND d.data->>'status' IN ('Active','Unverified')))))
 AND (${opts.ids??null}::text[] IS NULL OR p.article_id=ANY(${opts.ids??null}::text[]))
 AND (${opts.category??null}::text IS NULL OR p.category=${opts.category??null})
 AND (${opts.merchant??null}::text IS NULL OR d.data->>'merchantId'=${opts.merchant??null})
 AND (${opts.brand??null}::text IS NULL OR btrim(lower(d.data->>'brand'))=btrim(lower(${opts.brand??null})) OR regexp_replace(regexp_replace(lower(coalesce(d.data->>'brand','')), '[''’]', '', 'g'), '[^a-z0-9]+', '-', 'g')=regexp_replace(regexp_replace(lower(${opts.brand??null}), '[''’]', '', 'g'), '[^a-z0-9]+', '-', 'g') OR (NULLIF(d.data->>'brand','') IS NULL AND (lower(d.data->>'product') LIKE lower(${opts.brand??null}) || ' %' OR lower(d.data->>'model') LIKE lower(${opts.brand??null}) || ' %' OR lower(p.title) LIKE lower(${opts.brand??null}) || ' %' OR lower(a.title) LIKE lower(${opts.brand??null}) || ' %')))
 AND (${opts.q??null}::text IS NULL OR p.search_text ILIKE ${'%'+(opts.q??'').replace(/[\\%_]/g,'\\$&')+'%'})
 AND (${opts.product??null}::text IS NULL OR lower(d.data->>'product')=lower(${opts.product??null}))
 AND (${opts.model??null}::text IS NULL OR lower(d.data->>'model')=lower(${opts.model??null}))
 AND (${opts.variant??null}::text IS NULL OR lower(d.data->>'variant')=lower(${opts.variant??null}))
 AND (${opts.condition??null}::text IS NULL OR lower(d.data->>'condition')=lower(${opts.condition??null}))
 AND (${opts.view??''}<>'deals' OR ${opts.id??null}::text IS NOT NULL OR ${opts.ids??null}::text[] IS NOT NULL OR (
  NULLIF(d.data->>'buyUrl','') IS NOT NULL AND (
   d.data->>'kind'=ANY(ARRAY['product_deal','coupon_offer','cashback_offer','freebie'])
   OR (d.data->>'kind'='shopping_news' AND d.data->>'activityScope'=ANY(ARRAY['event','storewide']))
  )
 ))
 ORDER BY p.timeline_at DESC, p.article_id DESC LIMIT ${SCAN_LIMIT}`;
 const now=Date.now();
 const originalEvidence=new WeakMap<ShoppingItem,string>(),originalTitles=new WeakMap<ShoppingItem,string>();
 let items:ShoppingItem[]=rows.map(r=>{
  const originalData=isOffer(r.data)&&isReviewHeadline(r.title)?reviewAsGuide(r.data):isOffer(r.data)&&(isSaleAnnouncement(r.title,r.data)||isNonPromotionalAnnouncement(r.title,r.data))?saleAnnouncementAsNews(r.data):r.data;
  let sourceData={...originalData,brand:inferredBrand(originalData,r.title)} as Offer;
 const rawPriceObj=sourceData as Offer&{checkoutPrice?:string|null;listedPrice?:string|null};
 if(sourceData.checkoutPriceCents===null&&sourceData.listedPriceCents===null&&!sourceData.coupon&&isOffer(sourceData)&&!sourceData.promotionEndedAt){
  const fallbackCheckout=cents(rawPriceObj.checkoutPrice),fallbackListed=cents(rawPriceObj.listedPrice);
  if(fallbackCheckout!==null||fallbackListed!==null){
   sourceData={...sourceData,checkoutPriceCents:fallbackCheckout,listedPriceCents:fallbackListed,unitPriceCents:unitPrice(fallbackCheckout??fallbackListed,sourceData.unitQuantity??null)};
  }
 }
  // A retailer price restored after a promotion is a normal current listing. Ignore the old
  // campaign deadline/status so the product stays in public feeds as a regular-price item.
  if(sourceData.priceRestored===true&&sourceData.status!=='Out of Stock'&&(sourceData.checkoutPriceCents!==null||sourceData.listedPriceCents!==null)){
   sourceData={...sourceData,status:sourceData.verifiedAt?'Active':'Unverified',expiresAt:null,deadlineOriginal:null};
  }else if(!process.env.NODE_TEST_CONTEXT&&isOffer(sourceData)&&sourceData.status!=='Out of Stock'&&!['event','storewide'].includes(sourceData.activityScope??'')){
   const preTiming=offerTiming(sourceData,r.timeline_at.toISOString(),now);
   const preStatus=effectiveStatus(sourceData,now);
   if(preStatus==='Expired'||preTiming?.state==='ended'||preTiming?.state==='likely-ended'){
    const comparisonAmount=cents((`${sourceData.comparison??''} ${sourceData.priceEvidence??''}`).match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/)?.[1]);
    // A source stating both a was price and a deal price is not telling us what the retailer charges
    // today. Promoting the was price to the current price would invent a figure the source never
    // claimed, so keep the deal price on screen and leave the was price as the reference.
    const statedWas=sourceData.listedPriceCents!==null&&sourceData.checkoutPriceCents!==null&&sourceData.listedPriceCents>sourceData.checkoutPriceCents?sourceData.listedPriceCents:null;
    const regularCents=statedWas!==null
     ? (sourceData.recordedDealPriceCents??sourceData.checkoutPriceCents)
     : (sourceData.listedPriceCents??sourceData.checkoutPriceCents??sourceData.recordedDealPriceCents??comparisonAmount??null);
    if(regularCents!==null&&regularCents>0){
     const recordedDealCents=sourceData.recordedDealPriceCents??sourceData.checkoutPriceCents??sourceData.listedPriceCents;
     // Keep the stated was price as the reference so the page can still show what it was; only the
     // current price moves to the recorded deal (or the stated was price when nothing was recorded).
     sourceData={...sourceData,recordedDealPriceCents:recordedDealCents,recordedDealAt:sourceData.recordedDealAt??r.timeline_at.toISOString(),checkoutPriceCents:regularCents,listedPriceCents:statedWas,unitPriceCents:unitPrice(regularCents,sourceData.unitQuantity??null),coupon:null,promotion:null,steps:[],restrictions:[],expiresAt:null,deadlineOriginal:null,priceRestored:true,promotionEndedAt:sourceData.promotionEndedAt??sourceData.expiresAt??new Date(now).toISOString(),status:sourceData.verifiedAt?'Active':'Unverified'};
    }
   }
  }
  const timing=offerTiming(sourceData,r.timeline_at.toISOString(),now);
  const status=effectiveStatus(sourceData,now);
  const pricePending=!!sourceData.promotionEndedAt&&!sourceData.verifiedAt&&!sourceData.priceRestored;
  const ended=status==='Expired'||(timing?.state==='ended'&&status!=='Out of Stock');
  const unavailable=status==='Out of Stock';
  const stale=timing?.state==='likely-ended';
  const directBuyUrl=isDirectRetailerProductUrl(sourceData.buyUrl)&&!needsLinkRepair(r.title,sourceData);
  const directEventUrl=['event','storewide'].includes(sourceData.activityScope??'')&&isDirectRetailerEventUrl(sourceData.buyUrl);
  // Use a matching merchant product image first. The source image is the explicit fallback and keeps
  // its source attribution; neither path adds a watermark or copies article body text.
  const articleImages = Array.isArray(r.article_media) ? (r.article_media as any[]).filter(m => m && m.kind === 'image' && typeof m.url === 'string' && !isBrokenOrUnusableImage(m.url)).map(m => sanitizeImageUrl(m.url)).filter((x): x is string => Boolean(x)) : [];
  const articleFirstImage = articleImages[0] ?? null;
  const imageOverride=PRODUCT_IMAGE_OVERRIDES[r.article_id];
  let effectiveImageUrl = imageOverride?.url ?? ((typeof sourceData.imageUrl === 'string' && !isBrokenOrUnusableImage(sourceData.imageUrl)) ? sanitizeImageUrl(sourceData.imageUrl) : (articleFirstImage ?? null));
  if (isBrokenOrUnusableImage(effectiveImageUrl)) {
    const merchantKey = sourceData.merchantId || (sourceData.buyUrl ? merchantFor(sourceData.buyUrl)?.id : null);
    effectiveImageUrl = (merchantKey && MERCHANT_DEFAULT_IMAGES[merchantKey]) ?? articleFirstImage ?? MERCHANT_DEFAULT_IMAGES['amazon'];
  }
  const retailerImageSource=Boolean(imageOverride)||!!sourceData.imageSource&&!!merchantFor(sourceData.imageSource)&&isDirectRetailerProductUrl(sourceData.imageSource);
  let mediaImage=imageOverride?null:sourceData.imageFallbackUrl??(sourceData.imageSource===r.url?sourceData.imageUrl:(articleFirstImage??null));
  if (isBrokenOrUnusableImage(mediaImage)) {
    mediaImage = null;
  }
  // A clean merchant image beats a third-party blog thumbnail that often carries a watermark. When the
  // offer has an Amazon ASIN the official product shot can be built directly and is preferred.
  const asinImage=asinProductImage(sourceData.buyUrl);
  const hasRetailerImage=retailerImageSource&&!isBrokenOrUnusableImage(effectiveImageUrl);
  const directProductImage=(!retailerImageSource&&!mediaImage)?effectiveImageUrl:null;
  let productImageUrl=asinImage??(hasRetailerImage?effectiveImageUrl:(mediaImage??directProductImage));
  if (isBrokenOrUnusableImage(productImageUrl)) {
    const merchantKey = sourceData.merchantId || (sourceData.buyUrl ? merchantFor(sourceData.buyUrl)?.id : null);
    productImageUrl = (merchantKey && MERCHANT_DEFAULT_IMAGES[merchantKey]) ?? articleFirstImage ?? MERCHANT_DEFAULT_IMAGES['amazon'];
  }
  const productImageSource=asinImage?(sourceData.buyUrl??null):hasRetailerImage?(imageOverride?.source??sourceData.imageSource):mediaImage?(sourceData.imageFallbackSource??(sourceData.imageSource===r.url?r.url:(sourceData.buyUrl??r.url))):(directProductImage?(sourceData.imageSource??sourceData.buyUrl??r.url):null);
  const fallbackImageUrl=hasRetailerImage?mediaImage:null;
  const fallbackImageSource=hasRetailerImage?(sourceData.imageFallbackSource??(sourceData.imageSource===r.url?r.url:null)):null;
  const {formerDeal:_formerDeal,imageFallbackWatermarkFree:_legacyWatermarkFlag,...storedOfferData}=sourceData as Offer&{formerDeal?:unknown;imageFallbackWatermarkFree?:unknown};
  const publicOfferData=pricePending?{...storedOfferData,checkoutPrice:null,listedPrice:null,checkoutPriceCents:null,listedPriceCents:null,unitPriceCents:null,priceEvidence:null,priceIssue:null,aiOverview:null,seoDescription:null,seoDescriptionPriceCents:null,coupon:null,promotion:null,steps:[],shipping:null,fulfillment:null,cashback:null,giftCard:null,points:null,membership:null,subscription:null,renewal:null,cancellation:null,minimumSpend:null,restrictions:[]}:storedOfferData;
  const offer={...publicOfferData,status:ended?'Expired':status,buyUrl:directBuyUrl?affiliateLink(sourceData.buyUrl):directEventUrl?affiliateLink(sourceData.buyUrl):null,imageUrl:productImageUrl,imageSource:productImageSource,imageFallbackUrl:null,imageFallbackSource:null} as Offer;
  const supersededSourceCampaign=Boolean(offer.priceRestored||offer.promotionEndedAt);
  const couponCheck=supersededSourceCampaign?{applicable:false,issue:null,editorialConflict:false,sourceClaims:[]}:validateCouponPrice({title:r.title,sourceBody:r.evidence_text,summary:r.summary,reason:r.reason,offer});
  const headlinePrice=!supersededSourceCampaign&&isOffer(offer)?headlineOfferPrice(r.title):null,extractedPrice=offer.checkoutPriceCents??offer.listedPriceCents;
 const needsPriceReview=!!couponCheck.issue||!couponCheck.applicable&&isOffer(offer)&&!offer.verifiedAt&&headlinePrice!==null&&extractedPrice!==null&&Math.abs(headlinePrice-extractedPrice)>100;
  if(needsPriceReview){offer.checkoutPriceCents=null;offer.listedPriceCents=null;offer.unitPriceCents=null;offer.priceIssue=couponCheck.issue??null;if(couponCheck.issue){if(!['Expired','Out of Stock'].includes(offer.status))offer.status='Unverified';offer.verificationNote='The reported coupon prices could not be reconciled. Check the source and retailer before purchase.';}}
  else offer.priceIssue=null;
  const amount=unavailable?null:offer.checkoutPriceCents??offer.listedPriceCents;
  const inconsistentEditorial=needsPriceReview||couponCheck.editorialConflict;
  if(inconsistentEditorial||offer.aiOverview?.analysisVersion&&offer.aiOverview.analysisPriceCents!==amount)offer.aiOverview=null;
  if(needsPriceReview||pricePending||ended||unavailable||offer.seoDescriptionPriceCents!==undefined&&offer.seoDescriptionPriceCents!==amount){offer.seoDescription=null;offer.seoDescriptionPriceCents=null;}
  const verification:PriceDisplay['verification']=amount===null?'unavailable':status==='Active'&&sourceData.status==='Active'&&!!offer.verifiedAt?'merchant-verified':offer.verifiedAt?'last-verified':'source-reported';
  const priceDisplay:PriceDisplay=pricePending
   ?{state:'current',amountCents:null,label:'Checking retailer price',verification:'unavailable',verifiedAt:offer.verifiedAt,lastCheckedAt:offer.lastCheckedAt}
   :unavailable
   ?{state:'unavailable',amountCents:null,label:'Price unavailable',verification,verifiedAt:offer.verifiedAt,lastCheckedAt:offer.lastCheckedAt}
   :ended
    ?{state:'ended',amountCents:amount,label:amount===null?'No price recorded':verification==='last-verified'||verification==='merchant-verified'?'Last retailer-verified offer price':'Last source-reported offer price',verification,verifiedAt:offer.verifiedAt,lastCheckedAt:offer.lastCheckedAt}
    :stale
     ?{state:'stale',amountCents:amount,label:amount===null?'Last reported price unavailable':verification==='last-verified'||verification==='merchant-verified'?'Last retailer-verified price':'Last source-reported price',verification,verifiedAt:offer.verifiedAt,lastCheckedAt:offer.lastCheckedAt}
     :{state:pricePending?'unavailable':'current',amountCents:amount,label:pricePending?'Checking retailer price':amount===null?(needsPriceReview?'Price needs review':'No price reported'):verification==='merchant-verified'?'Retailer-verified price':verification==='last-verified'?'Last retailer-verified price':(offer.merchant?.trim()?`${offer.merchant.trim()} price`:'Retailer price'),verification,verifiedAt:offer.verifiedAt,lastCheckedAt:offer.lastCheckedAt};
  const rawTitle=plainTitle(safeCopy(r.title));const title=isOffer(offer)?productTitle(offer,priceDisplay.state==='current'?amount:null):rawTitle;
  const productName=offer.product??offer.model??'This product',merchantName=offer.merchant??'the retailer';
  const fallbackSummary=timing?.state==='ended'||offer.status==='Expired'?`${productName} was included in an earlier offer from ${merchantName}. Check the retailer for its current price and availability.`:amount!==null?`${offer.verifiedAt?'The retailer lists':'The source reports'} ${productName} at ${new Intl.NumberFormat('en-US',{style:'currency',currency:offer.currency||'USD'}).format(amount/100)} from ${merchantName}. Confirm the exact configuration, seller and purchase terms on the retailer page.`:`This offer concerns ${productName} at ${merchantName}. Check the retailer page for current pricing, availability and terms.`;
  const sourceReportedPrice=pricePending?sourceData.checkoutPriceCents??sourceData.listedPriceCents??sourceData.recordedDealPriceCents??sourceData.formerDeal?.checkoutPriceCents??sourceData.formerDeal?.listedPriceCents??null:null;
  const summary=pricePending?(sourceReportedPrice!==null?`The source reported ${productName} at ${new Intl.NumberFormat('en-US',{style:'currency',currency:offer.currency||'USD'}).format(sourceReportedPrice/100)}. Retailer price verification is pending; check the retailer for today’s price and availability.`:`Retailer price verification is pending. Check ${merchantName} for today’s price and availability.`):inconsistentEditorial?'The reported price or coupon details need review. Check the source and retailer for current terms.':isCalibratedRegularPrice(offer)&&amount!==null?`${productName} is currently listed at ${new Intl.NumberFormat('en-US',{style:'currency',currency:offer.currency||'USD'}).format(amount/100)} at ${merchantName}. The former deal price is kept as a historical reference; confirm today’s checkout total.`:offer.retailerPriceReactivatedAt&&amount!==null?`${productName} is listed at ${new Intl.NumberFormat('en-US',{style:'currency',currency:offer.currency||'USD'}).format(amount/100)} at ${merchantName}, at least 15% below a previously retailer-verified price. Confirm availability and checkout total.`:offer.promotionEndedAt&&amount!==null?`${productName} is currently listed at ${new Intl.NumberFormat('en-US',{style:'currency',currency:offer.currency||'USD'}).format(amount/100)} at ${merchantName}. Confirm the exact configuration, availability and total on the retailer page before purchase.`:isOffer(offer)?safeCopy(offer.aiOverview?.summary?.trim()||fallbackSummary):safeCopy(r.summary??'');
  const dailySale=isCalibratedRegularPrice(offer)&&!ended&&!unavailable;
  const restoredRegularPrice=offer.priceRestored===true&&offer.status!=='Out of Stock'&&priceDisplay.state==='current'&&priceDisplay.amountCents!==null&&priceDisplay.amountCents>0;
  // Expired offers stay indexable: the recheck job restores the retailer's current price on the same
  // page, so removing them from the index would throw away the URL that later becomes live again.
  // Retailer navigation pages are not products and must not enter the index or the sitemap.
  const realProductPage=!isNavigationTitle(r.title);
  const item={id:r.article_id,indexable:(r.eligible||restoredRegularPrice)&&realProductPage&&r.processing_state!=='blocked'&&r.seo_excluded_at===null&&!!summary.trim()&&(!requiresDirectRetailerLink(offer)||directBuyUrl),updatedAt:r.modified.toISOString(),title,summary,reason:inconsistentEditorial?null:r.reason?safeCopy(r.reason):null,category:r.category,tags:r.tags,score:r.score===null?null:Number(r.score),selected:r.selected,source:r.name,sourceUrl:r.url,publishedAt:r.timeline_at.toISOString(),sourcePublishedAt:r.published_at?.toISOString()??null,offer,timing,priceDisplay,image:itemImage(productImageUrl,fallbackImageUrl,productImageSource,fallbackImageSource),thirdPartySeller:thirdPartySeller(offer),sourceReportedPriceCents:sourceReportedPrice,sourceReportedListPriceCents:pricePending?sourceData.listedPriceCents??sourceData.formerDeal?.listedPriceCents??null:null,...((()=>{
  // The offer's own recorded deal price is the authoritative past price; the observation join is a
  // fallback for offers that only have sampled observations.
  const own=(sourceData as Offer&{recordedDealPriceCents?:number|null}).recordedDealPriceCents;
  if(sourceData.priceRestored&&own!==null&&own!==undefined&&Number.isSafeInteger(own)&&own>0)
    return {recordedDealPriceCents:own,recordedDealAt:(sourceData as Offer&{recordedDealAt?:string|null}).recordedDealAt??null};
  return sourceData.priceRestored&&r.recorded_deal_price!==null&&r.recorded_deal_price!==undefined
    ?{recordedDealPriceCents:Number(r.recorded_deal_price),recordedDealAt:r.recorded_deal_at?.toISOString()??null}
    :{};
})()),sources:[{name:r.name,url:r.url}]};
  if(['deals','flash','coupons','ending'].includes(opts.view??'')){originalEvidence.set(item,r.evidence_text);originalTitles.set(item,r.title);}
  return item;
 });
 if(opts.brand){
  const wantedSlug=brandSlug(opts.brand),wantedLower=opts.brand.trim().toLowerCase();
  items=items.filter(x=>{const b=x.offer.brand?.trim();return Boolean(b&&(b.toLowerCase()===wantedLower||brandSlug(b)===wantedSlug));});
 }
 if(opts.indexableOnly)items=items.filter(x=>x.indexable);
 const view=opts.view??'latest';
 if(!opts.id&&!opts.ids){
  items=items.filter(x=>!requiresDirectRetailerLink(x.offer)||!!x.offer.buyUrl);
  if(view==='top')items=items.filter(x=>isOffer(x.offer)&&x.offer.status==='Active'&&x.selected).sort((a,b)=>(b.score??0)-(a.score??0));
  else if(view==='recommended'||view==='deals')items=items.filter(x=>homepageEligible(x.offer,x.timing)&&(view!=='deals'||['event','storewide'].includes(x.offer.activityScope??'')&&!!x.offer.buyUrl&&x.timing?.state!=='ended'||isOffer(x.offer)&&x.offer.status!=='Upcoming'&&(x.offer.checkoutPriceCents!==null||x.offer.listedPriceCents!==null||x.offer.priceRestored===true||!!x.offer.promotionEndedAt||sourceDealBenefitEvidence(originalTitles.get(x)??x.title,x.offer,originalEvidence.get(x)??''))));
  else if(view==='new') { /* Latest updates retain clearly labelled historical offers. */ }
  else if(view==='flash'){
   // Best Deals shows what a reader can still act on: offers past a stated deadline, or older than
   // their kind's shelf life with no deadline at all, are not current recommendations.
   // A discount above 70% against a small store's own list price is not a deal signal; only a
   // recognised retailer's markdown of that size is shown here.
   const candidates=consolidateOffers(items.filter(x=>isOffer(x.offer)&&['Active','Unverified'].includes(x.offer.status)&&live(x)&&sourceDealBenefitEvidence(originalTitles.get(x)??x.title,x.offer,originalEvidence.get(x)??'')&&!((offerSavings(x.offer)?.percent??0)>70&&!knownRetailer(x.offer)))).items;
   const clusterIds=(x:ShoppingItem)=>(x as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[x.id];
   const [histories,engagement]=await Promise.all([priceHistories(candidates.flatMap(clusterIds)),itemEngagement(candidates.flatMap(clusterIds))]);
   const ranked=candidates.flatMap(x=>{
    const history=clusterIds(x).flatMap(id=>histories.get(id)??[]).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const evidence=flashDealEvidence(x.offer,history);
    const pick=sourceDealPick(x.offer,x.sourceUrl,x.sourcePublishedAt??x.publishedAt);
    const productActivity=isProductActivity(x.offer,x.sourcePublishedAt??x.publishedAt,x.title);
    if(!evidence&&!pick&&!productActivity)return [];
    const engagementFor=clusterIds(x).map(id=>engagement.get(id)??{clicks:0,likes:0});
    const clicks=engagementFor.reduce((n,e)=>n+e.clicks,0),likes=engagementFor.reduce((n,e)=>n+e.likes,0);
    const saving=offerSavings(x.offer)?.percent??0,popular=pick?.kind==='popular'||clicks>=3||likes>=2;
    const verified=x.priceDisplay.verification==='merchant-verified';
    const ageHours=Math.max(0,(Date.now()-Date.parse(x.publishedAt))/3600000);
    const priority=(verified?180:0)+(evidence?90:0)+(popular?35:0)+Math.min(60,saving)*0.5+Math.min(40,clicks*2+likes*4)+(x.timing?.state==='ending'?20:0)+Math.max(0,24-ageHours)*0.15-Number(thirdPartySeller(x.offer))*25;
    const decorated={...x,productActivity,...(evidence?{flashDeal:evidence}:{}),...(pick?{dealPick:pick}:{}),flash:{percent:saving,recordedLow:!!evidence,popular,clicks,likes}};
    Object.defineProperty(decorated,'_duplicateIds',{value:clusterIds(x),enumerable:false});
    return [{item:decorated,priority}];
   });
   // Retailer-confirmed prices, recorded price evidence, markdowns and reader interest lead the deal feed.
   items=ranked.sort((a,b)=>b.priority-a.priority||Date.parse(b.item.publishedAt)-Date.parse(a.item.publishedAt)).map(x=>x.item);
  }
  else if(view==='any') { /* all public shopping content */ }
  else if(view==='picks'){
   // Editorial ranking over live material for the machine exits that used to read the Active-only board.
   // Stored status labels are preserved on every item: a source-reported offer is never shown as
   // merchant-verified here, and no price or stock claim is derived from the ranking.
   items=items.filter(x=>isOffer(x.offer)&&!['Expired','Out of Stock'].includes(x.offer.status))
    .sort((a,b)=>(b.score??0)-(a.score??0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||(a.id<b.id?1:a.id>b.id?-1:0));
  }
  else if(view==='black-friday'||view==='cyber-monday'){
   const blackFriday=/\b(?:black\s+friday|doorbuster|holiday\s+(?:savings|sale|deals|ad)|early\s+holiday)\b/i;
   const cyberMonday=/\b(?:cyber\s+monday|cyber\s+week)\b/i;
   items=items.filter(item=>{
    if(!homepageEligible(item.offer,item.timing)||['Upcoming','Expired','Out of Stock'].includes(item.offer.status))return false;
    const activity=['event','storewide'].includes(item.offer.activityScope??''),text=`${item.title} ${item.summary} ${item.offer.promotion?.quote??''}`;
    const seasonal=view==='black-friday'?blackFriday.test(text)||activity:cyberMonday.test(text)||['electronics','software'].includes(item.category??'');
    const hasOffer=activity?Boolean(item.offer.buyUrl):isOffer(item.offer)&&Boolean(item.offer.buyUrl)&&(item.offer.checkoutPriceCents!==null||item.offer.listedPriceCents!==null||item.offer.coupon||item.offer.cashback||item.offer.promotionEndedAt);
    return seasonal&&hasOffer;
   });
  }
  else if(view==='reviews'){
   // A comparison or "which should you buy" headline evaluates even when extraction shelved the
   // article as news; it belongs on the review shelf rather than beside price-drop alerts.
   items=items.filter(x=>isReviewContent(x.offer,x.title)||(x.offer.kind==='shopping_news'&&COMPARISON_HEADLINE.test(x.title)));
   // A complete review is worth more than a bare verdict: readers expect strengths and trade-offs.
   const depth=(x:ShoppingItem)=>{const r=x.offer.review;if(!r)return 0;return (r.verdict?.trim()?1:0)+(r.strengths.length?2:0)+(r.limitations.length?2:0)+(r.bestFor?.trim()?1:0)+(r.questions.length?1:0);};
   const sortMode=opts.sort??'latest';
   if(sortMode==='discount')items.sort((a,b)=>depth(b)-depth(a)||(offerSavings(b.offer)?.percent??0)-(offerSavings(a.offer)?.percent??0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
   else if(sortMode==='popular')items.sort((a,b)=>depth(b)-depth(a)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
   else items.sort((a,b)=>depth(b)-depth(a)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
   // One prolific publisher must not fill the results: cap each source, then interleave the rest.
   const perSource=new Map<string,number>(),primary:ShoppingItem[]=[],overflow:ShoppingItem[]=[];
   for(const item of items){const key=item.source.trim().toLowerCase();const n=perSource.get(key)??0;if(n>=REVIEW_SOURCE_CAP){overflow.push(item);continue;}perSource.set(key,n+1);primary.push(item);}
   items=[...primary,...overflow];
  }
  else if(view==='guides')items=items.filter(x=>isGuideArticle(x.offer,x.title));
  else if(view==='news')items=items.filter(x=>{
   // A guide that does not evaluate is still a guide: without this it falls through the
   // !isOffer test and lands in the news feed.
   if(x.offer.kind==='buying_guide')return false;
   // Comparison coverage is shown with the reviews, so it is not repeated here.
   if(x.offer.kind==='shopping_news'&&COMPARISON_HEADLINE.test(x.title))return false;
   return !isOffer(x.offer)&&!isReviewContent(x.offer,x.title);
  });
  else if(view==='coupons')items=items.filter(x=>isOffer(x.offer)&&['Active','Unverified'].includes(x.offer.status)&&(['coupon_offer','cashback_offer','freebie'].includes(x.offer.kind)||x.offer.coupon||x.offer.cashback)&&live(x)&&sourceDealBenefitEvidence(originalTitles.get(x)??x.title,x.offer,originalEvidence.get(x)??''));
  else if(view==='ending'){
   // The limited-time strip: a stated deadline, a single product with a purchase link, and a real
   // markdown (flashSavings). Offers ending within two days lead, soonest first; when fewer than ten
   // qualify, later-dated offers with the biggest markdowns fill the strip, never beyond twenty.
   // A recognised retailer, no subscription or auto-renewal attached (a free store loyalty programme
   // is fine): the strip is for things a reader buys once, and a markdown against a small store's
   // own list price is not evidence of a flash sale.
   const worthy=(x:ShoppingItem)=>!!x.offer.buyUrl&&knownRetailer(x.offer)&&!x.offer.subscription&&!x.offer.renewal&&!!flashSavings(x.offer)&&isProductActivity(x.offer,x.sourcePublishedAt??x.publishedAt,x.title,now)&&limitedOfferEvidence(originalTitles.get(x)??x.title,x.offer,originalEvidence.get(x)??'',x.sourcePublishedAt??x.publishedAt);
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
  else if(view==='archive')items=items.filter(x=>['Expired','Out of Stock'].includes(x.offer.status)||x.timing?.state==='ended'||x.timing?.state==='likely-ended');
  else items=items.filter(x=>isOffer(x.offer)&&!['Expired','Out of Stock'].includes(x.offer.status)&&(x.offer.kind!=='product_deal'||x.offer.checkoutPriceCents!==null||x.offer.listedPriceCents!==null));
 }
 const consolidated=consolidateOffers(items);items=consolidated.items;
 // The same product reported by several publishers is one card for the reader.
 const entities=dedupeProductEntities(items);
 items=entities.items;
 for(const [id,item] of entities.aliases)if(!consolidated.aliases.has(id))consolidated.aliases.set(id,item);
 if(opts.id){
  const canonical=consolidated.aliases.get(opts.id);
  if(canonical)items=[canonical];
  else{
   const [dup]=await sql<{canonical_id:string|null}[]>`SELECT fields->>'duplicateOf' AS canonical_id FROM editorial_overrides WHERE article_id=${opts.id} AND visibility='withdrawn' AND updated_by='system:shopping-dedup'`;
   if(dup?.canonical_id&&dup.canonical_id!==opts.id)items=(await shoppingItems({id:dup.canonical_id})).items;
   else if(/^[a-z0-9]{20,32}$/.test(opts.id)){
    const [fuzzy]=await sql<{article_id:string}[]>`SELECT p.article_id FROM publications p JOIN shopping_offers d ON d.article_id=p.article_id WHERE p.visibility<>'withdrawn' AND left(p.article_id,7)=${opts.id.slice(0,7)} AND right(p.article_id,6)=${opts.id.slice(-6)} ORDER BY p.timeline_at DESC LIMIT 1`;
    if(fuzzy?.article_id&&fuzzy.article_id!==opts.id)items=(await shoppingItems({id:fuzzy.article_id})).items;
    else items=[];
   }
   else items=[];
  }
 }
 if((view==='recommended'||view==='deals')&&!opts.id&&!opts.ids&&items.length){
  const ids=[...new Set(items.flatMap(item=>(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id]))];
  const historyIds=view==='deals'?items.filter(x=>x.priceDisplay.verification==='merchant-verified').flatMap(item=>(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id]):[];
  const [ratings,histories,engagement]=await Promise.all([sql`SELECT target_id,count(*) FILTER(WHERE value=1)::int AS worth_it,count(*) FILTER(WHERE value=-1)::int AS not_worth_it FROM community_votes WHERE target_type='article' AND target_id=ANY(${ids}::text[]) GROUP BY target_id`,priceHistories(historyIds),itemEngagement(ids)]);
  const totals=new Map<string,CommunityRating>();for(const row of ratings)totals.set(row.target_id,{worthIt:Number(row.worth_it),notWorthIt:Number(row.not_worth_it),votes:Number(row.worth_it)+Number(row.not_worth_it)});
  const brandActivity=new Map<string,number>();for(const item of items){const brand=item.offer.brand?.toLowerCase().trim();if(!brand)continue;const related=(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id];const interest=related.reduce((sum,id)=>{const e=engagement.get(id);const r=totals.get(id);return sum+(e?.clicks??0)+(e?.likes??0)*2+(r?.worthIt??0)+(r?.notWorthIt??0);},0);brandActivity.set(brand,(brandActivity.get(brand)??0)+interest);}
  const index=new Map(items.map((item,i)=>[item.id,i]));
  items=items.map(item=>{if(!isOffer(item.offer))return item;const related=(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id];const rating=related.reduce((sum,id)=>{const r=totals.get(id);return {worthIt:sum.worthIt+(r?.worthIt??0),notWorthIt:sum.notWorthIt+(r?.notWorthIt??0),votes:sum.votes+(r?.votes??0)};},{worthIt:0,notWorthIt:0,votes:0});const result={...item,communityRating:rating};if(related.length>1)Object.defineProperty(result,'_duplicateIds',{value:related,enumerable:false});return result;});
  const priority=(item:ShoppingItem)=>{const r=item.communityRating;if(!r||r.votes<5||!isOffer(item.offer)||['Expired','Out of Stock'].includes(item.offer.status)||item.timing?.state==='ended')return 0;return r.worthIt>r.notWorthIt?1:r.notWorthIt>r.worthIt?-1:0;};
  if(view==='deals'){
   const scores=new Map(items.map(item=>{
    const related=(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id],history=related.flatMap(id=>histories.get(id)??[]),brand=item.offer.brand?.toLowerCase().trim()??'';
    const brandSignal=Math.min(8,Math.log1p(brandActivity.get(brand)??0)*1.5),rating=item.communityRating??{worthIt:0,notWorthIt:0,votes:0};
    const quality=dealRank(item,rating,history,now)+brandSignal;
    const interest=related.reduce((sum,id)=>{const e=engagement.get(id);return sum+(e?.clicks??0)*3+(e?.likes??0)*5;},0);
    const votes=rating.votes?2*(rating.worthIt-rating.notWorthIt):0;
    const stars=item.offer.retailerRating&&item.offer.retailerRating.count>=10?Math.max(-8,Math.min(8,(item.offer.retailerRating.value-3.5)*5*Math.min(1,item.offer.retailerRating.count/100))):0;
    const dailyPenalty=isCalibratedRegularPrice(item.offer)?60:0;
    const bucket=Math.floor(now/3_600_000)*3_600_000;
    const age=Math.max(0,(bucket-Date.parse(item.publishedAt))/3_600_000);
    const timeScore=Number.isFinite(age)?Math.max(0,80*(1-age/72)):0;
    const popularScore=timeScore+0.2*(interest+votes+stars+quality*0.35)-dailyPenalty;
    return [item.id,opts.sort==='popular'?popularScore:quality];
   }));
   items.sort((a,b)=>Number(isCalibratedRegularPrice(a.offer))-Number(isCalibratedRegularPrice(b.offer))||(scores.get(b.id)??0)-(scores.get(a.id)??0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||(a.id<b.id?1:a.id>b.id?-1:0));
  }else items.sort((a,b)=>Number(isCalibratedRegularPrice(a.offer))-Number(isCalibratedRegularPrice(b.offer))||priority(b)-priority(a)||(priority(a)===1&&priority(b)===1?(b.communityRating!.worthIt/b.communityRating!.votes-a.communityRating!.worthIt/a.communityRating!.votes)||b.communityRating!.votes-a.communityRating!.votes:0)||index.get(a.id)!-index.get(b.id)!);
 }
 if(opts.sort&&!opts.id&&!opts.ids&&!(opts.sort==='popular'&&view==='deals')){
  const ids=[...new Set(items.flatMap(item=>(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id]))];
  let activity=(item:ShoppingItem)=>0,brands=new Map<string,number>();
  if(opts.sort==='popular'){
   const [engagement,voteRows]=await Promise.all([itemEngagement(ids),sql`SELECT target_id,count(*) FILTER(WHERE value=1)::int AS worth_it,count(*) FILTER(WHERE value=-1)::int AS not_worth_it FROM community_votes WHERE target_type='article' AND target_id=ANY(${ids}::text[]) GROUP BY target_id`]);
   const votes=new Map<string,CommunityRating>(voteRows.map(row=>[row.target_id,{worthIt:Number(row.worth_it),notWorthIt:Number(row.not_worth_it),votes:Number(row.worth_it)+Number(row.not_worth_it)}]));
   activity=(item:ShoppingItem)=>{const related=(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id];return related.reduce((sum,id)=>{const e=engagement.get(id),v=votes.get(id);return sum+(e?.clicks??0)+(e?.likes??0)*3+(v?.worthIt??0)*2-(v?.notWorthIt??0)*2;},0);};
   for(const item of items){const brand=item.offer.brand?.toLowerCase().trim();if(brand)brands.set(brand,(brands.get(brand)??0)+activity(item));}
  }
  const discount=(item:ShoppingItem)=>{const saving=offerSavings(item.offer),quote=item.offer.priceEvidence??'';if(!saving||!quote||item.offer.priceIssue)return 0;const amounts=[...quote.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)];if(!amounts.some(m=>cents(m[1])===saving.nowCents))return 0;const reference=amounts.find(m=>cents(m[1])===saving.wasCents);if(!reference)return 0;const at=reference.index??0,context=quote.slice(Math.max(0,at-64),Math.min(quote.length,at+reference[0].length+32)).toLowerCase();return /\b(?:list|regular|retail|original|reference|usual|typical)\s+price\b|\bmsrp\b|\b(?:was|formerly|normally|usually|down from|reduced from|compared (?:with|to)|instead of)\b/.test(context)?saving.percent:0;};
  const isDaily=(item:ShoppingItem)=>Number(isCalibratedRegularPrice(item.offer));
  const popularity=(item:ShoppingItem)=>{const rating=item.offer.retailerRating;const ratingScore=rating&&rating.count>=10?Math.max(-8,Math.min(8,(rating.value-3.5)*5*Math.min(1,rating.count/100))):0;return activity(item)+Math.min(12,Math.log1p(brands.get(item.offer.brand?.toLowerCase().trim()??'')??0)*2)+ratingScore+(item.priceDisplay.verification==='merchant-verified'?10:0)+discount(item)*0.2-(isDaily(item)?60:0)-(item.offer.priceIssue?18:0)-(item.thirdPartySeller?6:0);};
  if(opts.sort==='popular')items.sort((a,b)=>isDaily(a)-isDaily(b)||popularity(b)-popularity(a)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  else if(opts.sort==='discount')items.sort((a,b)=>isDaily(a)-isDaily(b)||discount(b)-discount(a)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  else if(opts.sort==='ending')items.sort((a,b)=>isDaily(a)-isDaily(b)||endsMs(a)-endsMs(b)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  else items.sort((a,b)=>isDaily(a)-isDaily(b)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 }
 if(opts.maxPriceCents!==undefined)items=items.filter(item=>{const price=item.priceDisplay.state==='current'?item.priceDisplay.amountCents:item.offer.checkoutPriceCents??item.offer.listedPriceCents;return price!==null&&price<=opts.maxPriceCents!;});
 if(opts.minDiscountPercent!==undefined)items=items.filter(item=>isOffer(item.offer)&&!isCalibratedRegularPrice(item.offer)&&['Active','Unverified'].includes(item.offer.status)&&item.priceDisplay.state==='current'&&(offerSavings(item.offer)?.percent??0)>=opts.minDiscountPercent!);
 return items;
}

export async function shoppingItems(opts:{view?:string;category?:string;merchant?:string;brand?:string;sort?:ShoppingSort;q?:string;limit?:number;offset?:number;id?:string;ids?:string[];product?:string;model?:string;variant?:string;condition?:string;scanAll?:boolean;indexableOnly?:boolean;maxPriceCents?:number;minDiscountPercent?:number}={}) {
 const cacheKey = feedRankCacheKey(opts);
 const allItems = cacheKey
  ? await staleWhileRevalidate<ShoppingItem[]>({cache:savlumeCache.shoppingFeeds,pending:savlumeCache.shoppingFeedPending,key:cacheKey,load:()=>computeShoppingItems(opts),freshMs:60_000,staleMs:120_000,maxEntries:128})
  : await computeShoppingItems(opts);
 const total = allItems.length;
 const limit = Math.max(1, Math.min(opts.limit ?? 24, opts.scanAll ? SCAN_LIMIT : 100));
 const offset = Math.max(0, opts.offset ?? 0);
 return {
  items: allItems.slice(offset, offset + limit),
  total,
  hasMore: offset + limit < total,
  calibration: SHOPPING.calibration,
  checkedAt: new Date().toISOString()
 };
}
export async function shoppingBriefing(date?:string) {
 const [r]=date?await sql`SELECT * FROM reports WHERE kind='daily' AND key=${date} AND content->'generator'->>'version' LIKE '%report-daily-lead%'`:await sql`SELECT * FROM reports WHERE kind='daily' ORDER BY key DESC LIMIT 1`;
 if(!r)return null;
 // Historical issues retain wording, but current states are refreshed before the reader sees them.
 const sections=[];
 for(const section of r.content.sections??[]){const items=[];for(const item of section.items??[]){const got=await shoppingItems({id:item.itemId});const found=got.items[0];if(found&&(!requiresDirectRetailerLink(found.offer)||found.offer.buyUrl))items.push(found);}if(items.length)sections.push({title:section.label??section.title??section.name??section.heading,items});}
 return {key:r.key,title:safeCopy(r.content.lead?.title??r.content.title??r.content.headline??'Daily Briefing'),lead:safeCopy(r.content.lead?.leadParagraph??r.content.leadParagraph??r.content.overview??''),sections};
}
export async function shoppingCounts(){const [r]=await sql`SELECT count(*)::int AS items,count(*) FILTER (WHERE (d.data->>'status')='Active')::int AS active FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id WHERE p.visibility='public' AND p.eligible`;return r;}
export async function shoppingComparisons(item:ShoppingItem) {
 const d=item.offer;
 if(!d.merchantId||!d.product&&!d.model)return [];
 const [byModel,byProduct]=await Promise.all([
  d.model?shoppingItems({view:'any',model:d.model,limit:100}):Promise.resolve({items:[] as ShoppingItem[]}),
  d.product?shoppingItems({view:'any',product:d.product,limit:100}):Promise.resolve({items:[] as ShoppingItem[]}),
 ]);
 const candidates=new Map<string,ShoppingItem>();for(const candidate of [...byModel.items,...byProduct.items])candidates.set(candidate.id,candidate);
 return [...candidates.values()].filter(x=>x.id!==item.id&&x.indexable&&isOffer(x.offer)
  &&['Active','Unverified'].includes(x.offer.status)&&live(x)
  &&(x.offer.checkoutPriceCents!==null||x.offer.listedPriceCents!==null)
  &&!!x.offer.merchantId&&x.offer.merchantId!==d.merchantId
  &&isDirectRetailerProductUrl(x.offer.buyUrl)&&sameProduct(d,x.offer)
  &&normalized(d.variant)===normalized(x.offer.variant)
  &&normalized(d.condition)===normalized(x.offer.condition))
  .sort((a,b)=>Number(b.priceDisplay.verification==='merchant-verified')-Number(a.priceDisplay.verification==='merchant-verified')
   ||(a.priceDisplay.amountCents??Number.MAX_SAFE_INTEGER)-(b.priceDisplay.amountCents??Number.MAX_SAFE_INTEGER)
   ||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,8);
}

async function priceHistories(ids:string[]):Promise<Map<string,PriceObservation[]>> {
 if(!ids.length)return new Map();
 const rows=await sql`SELECT * FROM (
 SELECT h.*,row_number() OVER (PARTITION BY h.article_id ORDER BY h.observed_at DESC,h.id DESC) AS n
 FROM shopping_price_observations h JOIN shopping_offers d ON d.article_id=h.article_id
 WHERE h.article_id=ANY(${ids}::text[]) AND h.offer_context=shopping_price_context(d.data)
 AND h.observed_at>=now()-interval '365 days'
 ) recent WHERE n<=400 ORDER BY observed_at,id`;
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
 // Historical observations may have been captured before coupon consistency checks existed.
 // Once the unified read validator flags the offer, do not publish those suspect points as a trend.
 if(item.offer.priceIssue)return [];
 const ids=(item as ShoppingItem&{_duplicateIds?:string[]})._duplicateIds??[item.id];
 const histories=await priceHistories(ids);
 return ids.flatMap(id=>histories.get(id)??[]).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
export async function shoppingLikes(articleId:string,visitorHash:string|null=null){
 const [r]=await sql`SELECT count(*)::int AS count,COALESCE(bool_or(visitor_hash=${visitorHash}),false) AS liked FROM shopping_likes WHERE article_id=${articleId}`;
 return {count:r.count as number,liked:r.liked as boolean};
}

function usableRecommendation(target:ShoppingItem,candidate:ShoppingItem):boolean{
 return candidate.id!==target.id&&Boolean(candidate.indexable)&&isOffer(candidate.offer)
  &&['product_deal','coupon_offer','cashback_offer','freebie'].includes(candidate.offer.kind)
  &&['Active','Unverified'].includes(candidate.offer.status)&&live(candidate)&&!candidate.offer.priceIssue
  &&candidate.priceDisplay.state==='current'&&(candidate.priceDisplay.amountCents!==null||candidate.offer.kind!=='product_deal')
  &&!!candidate.offer.buyUrl&&isDirectRetailerProductUrl(candidate.offer.buyUrl)
  &&(!target.offer.identity||candidate.offer.identity!==target.offer.identity);
}
function recommendationTokens(value:string|null|undefined):Set<string>{
 return new Set(
  String(value??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/)
   .filter(w=>w.length>=3&&!/^(?:the|and|for|with|from|new|pack|set|inch|off|code|at|amazon|walmart|target|woot|best|buy)$/.test(w)),
 );
}
function similarityScore(target:ShoppingItem,candidate:ShoppingItem):number{
 const a=target.offer,b=candidate.offer;
 let score=0;
 if(normalized(a.product)&&normalized(a.product)===normalized(b.product))score+=8;
 if(normalized(a.model)&&normalized(a.model)===normalized(b.model))score+=8;
 if(normalized(a.brand)&&normalized(a.brand)===normalized(b.brand))score+=5;
 if(normalized(a.variant)&&normalized(a.variant)===normalized(b.variant))score+=2;
 if(normalized(a.condition)&&normalized(a.condition)===normalized(b.condition))score+=1;
 if(target.category&&target.category===candidate.category)score+=3;
 const targetWords=recommendationTokens(`${a.product??''} ${a.model??''} ${target.title}`);
 const candidateWords=recommendationTokens(`${b.product??''} ${b.model??''} ${candidate.title}`);
 let sharedWords=0;for(const w of targetWords)if(candidateWords.has(w))sharedWords++;
 score+=Math.min(8,sharedWords*2);
 const targetTags=new Set(target.tags.map(normalized).filter(Boolean));
 let sharedTags=0;for(const t of candidate.tags.map(normalized))if(t&&targetTags.has(t))sharedTags++;
 score+=Math.min(6,sharedTags*2);
 return score;
}
function sortRecommendedOffers(items:ShoppingItem[],scorer?:(x:ShoppingItem)=>number):ShoppingItem[]{
 const notDaily=(x:ShoppingItem)=>Number(!isCalibratedRegularPrice(x.offer));
 return [...items].sort((a,b)=>(scorer?scorer(b)-scorer(a):0)
  ||notDaily(b)-notDaily(a)
  ||Number(b.offer.status==='Active')-Number(a.offer.status==='Active')
  ||(offerSavings(b.offer)?.percent??0)-(offerSavings(a.offer)?.percent??0)
  ||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}
export async function detailRelatedShopping(item:ShoppingItem):Promise<{related:ShoppingItem[];merchantRelated:ShoppingItem[];categoryRelated:ShoppingItem[]}>{
 const [catRows, merchRows] = await Promise.all([
  item.category ? sql<{article_id:string}[]>`SELECT p.article_id FROM publications p JOIN articles a ON a.id=p.article_id JOIN shopping_offers d ON d.article_id=p.article_id JOIN sources s ON s.id=p.source_id WHERE p.visibility='public' AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes' AND p.eligible AND a.processing_state<>'blocked' AND p.category=${item.category} ORDER BY p.timeline_at DESC LIMIT 60` : Promise.resolve([] as {article_id:string}[]),
  item.offer.merchantId ? sql<{article_id:string}[]>`SELECT p.article_id FROM publications p JOIN articles a ON a.id=p.article_id JOIN shopping_offers d ON d.article_id=p.article_id JOIN sources s ON s.id=p.source_id WHERE p.visibility='public' AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes' AND p.eligible AND a.processing_state<>'blocked' AND d.data->>'merchantId'=${item.offer.merchantId} ORDER BY p.timeline_at DESC LIMIT 60` : Promise.resolve([] as {article_id:string}[]),
 ]);
 const catIdSet = new Set(catRows.map(r => r.article_id));
 const merchIdSet = new Set(merchRows.map(r => r.article_id));
 const allCandidateIds = [...new Set([...catIdSet, ...merchIdSet])];
 const pool = allCandidateIds.length ? await shoppingItems({ids: allCandidateIds, limit: 120}) : {items: [] as ShoppingItem[]};
 const categoryPool = {items: pool.items.filter(x => catIdSet.has(x.id))};
 const merchantPool = {items: pool.items.filter(x => merchIdSet.has(x.id))};
 const merchantUsable=sortRecommendedOffers(merchantPool.items.filter(x=>usableRecommendation(item,x)));
 const categoryUsable=sortRecommendedOffers(categoryPool.items.filter(x=>usableRecommendation(item,x)));
 const combined=new Map<string,ShoppingItem>();
 for(const entry of [...categoryUsable,...merchantUsable])combined.set(entry.id,entry);
 if(combined.size<20){
  const broadRows = await sql<{article_id:string}[]>`SELECT p.article_id FROM publications p JOIN articles a ON a.id=p.article_id JOIN shopping_offers d ON d.article_id=p.article_id JOIN sources s ON s.id=p.source_id WHERE p.visibility='public' AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes' AND p.eligible AND a.processing_state<>'blocked' ORDER BY p.timeline_at DESC LIMIT 60`;
  const broadIds = broadRows.map(r => r.article_id).filter(id => !combined.has(id));
  const broad = broadIds.length ? await shoppingItems({ids: broadIds, limit: 60}) : {items: [] as ShoppingItem[]};
  for(const entry of broad.items)if(usableRecommendation(item,entry))combined.set(entry.id,entry);
 }
 const reserveMerchantCount=Math.min(6,merchantUsable.length>=6?4:Math.ceil(merchantUsable.length/2));
 const reservedMerchantIds=new Set<string>(merchantUsable.slice(0,reserveMerchantCount).map(x=>x.id));
 const categoryPoolForReserve=[
  ...categoryUsable.filter(x=>!reservedMerchantIds.has(x.id)&&x.offer.merchantId!==item.offer.merchantId),
  ...categoryUsable.filter(x=>!reservedMerchantIds.has(x.id)&&x.offer.merchantId===item.offer.merchantId),
 ];
 const reserveCategoryCount=Math.min(6,categoryPoolForReserve.length>=6?4:Math.ceil(categoryPoolForReserve.length/2));
 const reservedCategoryIds=new Set<string>(categoryPoolForReserve.slice(0,reserveCategoryCount).map(x=>x.id));
 const reservedIds=new Set<string>([...reservedMerchantIds,...reservedCategoryIds]);
 const rankedSimilar=sortRecommendedOffers([...combined.values()],x=>similarityScore(item,x));
 const related=rankedSimilar.filter(x=>!reservedIds.has(x.id)).slice(0,12);
 if(related.length<8){
  for(const entry of rankedSimilar){
   if(related.length>=8)break;
   if(!related.some(x=>x.id===entry.id))related.push(entry);
  }
 }
 const seen=new Set<string>([item.id,...related.map(x=>x.id)]);
 const merchantRelated=merchantUsable.filter(x=>!seen.has(x.id)&&!reservedCategoryIds.has(x.id)).slice(0,6);
 for(const entry of merchantRelated)seen.add(entry.id);
 const categoryRelated=categoryUsable.filter(x=>!seen.has(x.id)).slice(0,6);
 return {related,merchantRelated,categoryRelated};
}
export async function relatedShopping(item:ShoppingItem){
 return (await detailRelatedShopping(item)).related;
}
