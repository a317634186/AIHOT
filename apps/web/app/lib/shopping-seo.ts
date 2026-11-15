import { SITE } from '@aihot/industry/site';
import { SHOPPING_SEO } from '@aihot/industry/seo';
import { CATEGORIES } from '@aihot/industry/taxonomy';
import { MERCHANTS, SHOPPING } from '@aihot/industry/shopping';
import { SEASONAL_HUBS, brandSlug, cents, isOffer, isCalibratedRegularPrice, itemPath, itemSeoDescription, itemSeoTitle, offerSavings, resolveBrandBySlug, truncateAtWord, type Offer, type OfferTiming } from '@aihot/contracts/shopping';
import { itemFaqs, itemProsCons } from './item-geo';
import { pageMeta, siteUrl, breadcrumbLd, organizationLd } from './seo';
import { isReviewContent } from '@aihot/contracts/reviews';
export interface LandingCatalog {categories:{key:string;count:number;seoTitle?:string|null}[];merchants:{key:string;count:number;seoTitle?:string|null}[];brands?:{key:string;slug?:string;label:string;count:number;seoTitle?:string|null}[]}
const dealMonth=()=>new Intl.DateTimeFormat('en-US',{timeZone:SHOPPING.timeZone,month:'long',year:'numeric'}).format(new Date());
export function landingSubtitle(landing:{heading:string;intro:string;category:string;merchant:string},total:number,items:Array<{offer:Offer}>=[]){
 const label=landing.category?CATEGORIES.find(c=>c.key===landing.category)?.label:landing.merchant?MERCHANTS.find(m=>m.id===landing.merchant)?.name:'';
 if(!label)return `${landing.intro} ${total} offers currently listed.`;
 const maxDiscount=items.filter(item=>isOffer(item.offer)&&!isCalibratedRegularPrice(item.offer)).map(item=>offerSavings(item.offer)?.percent??0).reduce((max,value)=>Math.max(max,value),0);
 if(landing.merchant)return `Browse ${total} active ${label} promo codes, clipped coupons, and verified price drops${maxDiscount?` up to ${maxDiscount}% off`:''}. Updated ${dealMonth()}.`;
 return `Compare ${total} verified ${label} price drops, coupon codes, and historical low prices across top US retailers.`;
}
export function shoppingLanding(path:string,catalogInput?:LandingCatalog|LandingCatalog['brands']){
 const catalog:LandingCatalog|undefined=Array.isArray(catalogInput)?{categories:[],merchants:[],brands:catalogInput}:catalogInput;
 const category=CATEGORIES.find(c=>path==='/deals/'+c.key);
 if(category){const configured=catalog?.categories?.find(c=>c.key===category.key)?.seoTitle;return {title:configured||`${category.label} Promo Codes, Coupons & Deals (2026)`,heading:`Best ${category.label} Deals & Promo Codes Today`,listHeading:`Top ${category.label} Discounts, Sales & Lowest Recorded Prices`,intro:SHOPPING_SEO.categories[category.key],category:category.key,merchant:'',brand:''};}
 const merchant=MERCHANTS.find(m=>path==='/stores/'+m.id);
 if(merchant){const configured=catalog?.merchants?.find(m=>m.key===merchant.id)?.seoTitle;return {title:configured||`${merchant.name} Promo Codes, Coupons & Deals (2026)`,heading:`${merchant.name} Promo Codes, Coupons & Daily Deals`,listHeading:`Live ${merchant.name} Price Drops, Clipped Coupons & Clearance Deals`,intro:`Browse ${merchant.name} offers, promo codes and coupons reported by Savlume sources. Compare current prices, eligibility and shipping before checkout.`,category:'',merchant:merchant.id,brand:''};}
 const brandMatch=/^\/brands\/([a-z0-9-]{2,64})$/.exec(path)?.[1];
 if(brandMatch){
  const resolved=resolveBrandBySlug(brandMatch,catalog?.brands);
  if(resolved){const configured=catalog?.brands?.find(b=>b.key===resolved.key||brandSlug(b.label)===brandMatch)?.seoTitle;return {title:configured||`${resolved.label} Deals, Promo Codes & Price History (2026)`,heading:`${resolved.label} Deals, Promo Codes & Verified Price Drops`,listHeading:`Live ${resolved.label} Discounts, Coupons & Lowest Recorded Prices`,intro:`Browse current ${resolved.label} deals, promo codes and price drops across US retailers. Compare models, shipping and checkout conditions.`,category:'',merchant:'',brand:resolved.key,brandLabel:resolved.label,brandSlug:brandMatch};}
 }
 const seasonal=SEASONAL_HUBS[path];
 if(seasonal)return {title:seasonal.title,heading:seasonal.heading,listHeading:seasonal.listHeading,intro:seasonal.intro,category:'',merchant:'',brand:'',seasonalView:seasonal.view};
 return null;
}
export interface LandingFaq {question:string;answer:string}
export function landingFaqs(path:string,catalog:LandingCatalog|undefined,total:number,search='',offset=0,items:Array<{offer:Offer;title?:string;priceDisplay?:{state:string;amountCents:number|null};timing?:OfferTiming|null}> = []):LandingFaq[]{
 const landing=shoppingLanding(path,catalog);
 const specialHub=['/coupons','/black-friday','/cyber-monday'].includes(path);
 if((!landing&&!specialHub)||total===0||search||offset)return [];
 const category=landing?.category&&CATEGORIES.find(c=>c.key===landing.category);
 const merchant=landing?.merchant&&MERCHANTS.find(m=>m.id===landing.merchant);
 const brandEntry=landing?.brand?catalog?.brands?.find(b=>b.key===landing.brand||brandSlug(b.label)===landing.brandSlug):undefined;
 const count=total;
 const offers=items.filter(item=>isOffer(item.offer)&&['Active','Unverified'].includes(item.offer.status)&&item.priceDisplay?.state==='current'&&item.timing?.state!=='ended'&&item.timing?.state!=='likely-ended'&&!isCalibratedRegularPrice(item.offer));
 const bestSavings=offers.map(item=>offerSavings(item.offer)).filter((saving):saving is NonNullable<typeof saving>=>!!saving).sort((a,b)=>b.percent-a.percent)[0];
 const couponCount=offers.filter(item=>Boolean(item.offer.coupon)||item.offer.kind==='coupon_offer').length;
 const lowestPrice=offers.map(item=>item.priceDisplay?.amountCents??item.offer.checkoutPriceCents??item.offer.listedPriceCents).filter((price):price is number=>price!==null&&price!==undefined&&price>0).sort((a,b)=>a-b)[0]??null;
 const retailerCounts=new Map<string,number>();for(const item of offers){const retailer=item.offer.merchant?.trim();if(retailer)retailerCounts.set(retailer,(retailerCounts.get(retailer)??0)+1);}
 const topRetailers=[...retailerCounts].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name])=>name);
 const retailerSummary=topRetailers.length?topRetailers.join(', '):'retailers represented in the current results';
 const brandCounts=new Map<string,number>();for(const item of offers){const name=item.offer.brand?.trim();if(name)brandCounts.set(name,(brandCounts.get(name)??0)+1);}
 const popularBrands=[...brandCounts].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name])=>name);
 const brandSummary=popularBrands.length?popularBrands.join(', '):catalog?.brands?.slice().sort((a,b)=>b.count-a.count).slice(0,3).map(item=>item.label).join(', ')||'retailer brands';
 const shipping=offers.map(item=>[item.offer.shipping,item.offer.membership].filter(Boolean).join(' ')).find(text=>text&&/free\s+(?:shipping|delivery)/i.test(text));
 const shippingThreshold=shipping?.match(/\$\s?\d+(?:\.\d{2})?/i)?.[0];
 const shippingSummary=shipping?shipping.match(/prime/i)?'Some offers include Prime free shipping':shippingThreshold?`Some offers state free shipping above ${shippingThreshold}`:'Free shipping is stated on selected offers':'Shipping terms vary by offer';
 if(specialHub){
  const hub=path==='/coupons'?'coupon':path==='/black-friday'?'Black Friday':'Cyber Monday';
  const discount=bestSavings?`${bestSavings.percent}%`:'not available in the featured results';
  return [
   {question:`How many active ${hub} deals are featured on Savlume?`,answer:`There are ${offers.length} active offers in the featured results, drawn from ${count} current ${hub} hub listings. The largest recorded discount among these active offers is ${discount}.`},
   {question:`Which retailers have ${hub} deals right now?`,answer:`The leading retailers represented in the current active offers are ${retailerSummary}. Retailer availability, checkout prices and sale dates can change.`},
   {question:'How are promo codes and coupons verified?',answer:`${couponCount} current featured offers include a promo code or coupon. Savlume checks retailer evidence when available and labels source-reported offers separately; always confirm the code, eligibility and final checkout price with the retailer.`},
  ];
 }
 if(brandEntry){
  const label=brandEntry.label;
  return [
   {question:`What are the best ${label} deals available right now?`,answer:`The current results include ${offers.length} active ${label} offers${bestSavings?`, with a top recorded discount of ${bestSavings.percent}%`:''}${lowestPrice!==null?` and prices starting at ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(lowestPrice/100)}`:''}. Compare the exact model, seller and condition before checkout.`},
   {question:`Which US retailers have the lowest prices on ${label} products?`,answer:`The retailers currently represented in the active ${label} results are ${retailerSummary}. Compare the same model and configuration because prices and seller conditions vary.`},
   {question:`Are there active ${label} promo codes or coupons today?`,answer:`${couponCount} active ${label} offers in the current results include a promo code or coupon. Savlume distinguishes retailer-checked details from source-reported offers; confirm eligibility and the final price at checkout.`},
  ];
 }
 if(count<3)return [];
 if(category){
  const label=category.label;
  return [
   {question:`How many ${label.toLowerCase()} deals are currently listed?`,answer:`Savlume’s current collection includes ${count||total} eligible ${label.toLowerCase()} offers. In the latest retailer-checked items, ${couponCount} include a coupon and the largest verified markdown shown is ${bestSavings?bestSavings.percent+'%':'not available in this page of results'}.`},
   {question:`Which brands and shipping offers appear in ${label.toLowerCase()} deals?`,answer:`Recent offers include ${brandSummary}. ${shippingSummary}. Shipping, membership and coupon conditions are shown with each offer and can change at checkout.`},
   {question:`How do I compare ${label.toLowerCase()} prices?`,answer:`Match the exact model, variant, condition and seller. The markdowns and coupon count above are calculated from this page’s current retailer-checked products; source-reported prices are labeled separately. Confirm the final checkout price and availability with the retailer.`},
  ];
 }
 if(merchant){
  const name=merchant.name;
  return [
   {question:`How many ${name} deals and promo codes are listed today?`,answer:`This ${name} collection currently includes ${count||total} eligible offers. ${couponCount} of the latest retailer-checked products include a coupon${bestSavings?`, with a highest verified markdown of ${bestSavings.percent}%`:''}.`},
   {question:`What brands and shipping terms appear in ${name} deals?`,answer:`Recent checked offers feature ${brandSummary}. ${shippingSummary}. Marketplace seller, membership and delivery limits are called out when the source or retailer provides them.`},
   {question:`Are ${name} prices verified and guaranteed to be the lowest?`,answer:`Offers marked Active were matched against the retailer page at the time of the check; other prices are source-reported. Savlume does not guarantee a lowest price or a complete promotion list. Confirm seller, current availability, coupon eligibility and checkout total on ${name}.`},
  ];
 }
 return [];
}
const fixed:Record<string,{title:string;description:string}>={
 '/reviews':{title:'Product Reviews, Buying Picks & Deal Comparisons (2026)',description:'Compare product reviews, buying picks and current deals with clear pros, cons, source attribution and price evidence.'},
 '/guides':{title:'Product Guides & Explainers: How Products Compare (2026)',description:'Product guides that explain a model, category or use case, with cited source detail and no review verdict attached.'},
 '/':SHOPPING_SEO.home,'/all':{title:'Live US Deal Feed: Hourly Price Drops & Promo Codes (2026)',description:'Browse recent deals, shopping news, reviews and past offers reported by Savlume sources.'},'/flash':SHOPPING_SEO.flash,'/news':{title:'US Shopping News, Sale Alerts & Price Drop Reports',description:'Follow US retailer sale alerts, price-drop reports, policy changes and product recall coverage.'},'/coupons':SHOPPING_SEO.coupons,
 '/categories':{title:'US Shopping Deal Categories, Promo Codes & Sales',description:'Browse US shopping offers by product category, including electronics, home, grocery, fashion and more.'},
 '/stores':{title:'All US Retailer Promo Codes, Coupons & Store Deals',description:'Explore offers by retailer, including Amazon, Walmart, Target and other stores.'},
 '/brands':{title:'Top Brand Deals, Promo Codes & Price Drops (A–Z)',description:'Browse US shopping offers and price drops by brand, including Apple, Anker, Dyson, Samsung, LEGO and more.'},
 '/more':{title:'Deal Finder Tools, Shopping News, Buying Guides & Alerts',description:'Explore shopping news, buying guides, saved deals and price alert tools on Savlume.'},
 '/archive':{title:'Past Deals & Historical Price Tracker Archive',description:'Browse past shopping offers and their current status. Recorded prices are for reference and may no longer be available.'},
 '/about':{title:'About Savlume: How We Find and Check Deals',description:'Learn how Savlume discovers US shopping offers, uses AI-assisted summaries, records prices and separates source-reported deals from merchant verification.'},
 '/terms':{title:'Terms of Use',description:'Read the terms for using Savlume shopping summaries, deal information and links to external retailers.'},
 '/privacy':{title:'Privacy Notice',description:'How Savlume handles anonymous likes, feedback, browser storage and links to other websites.'},
 '/agent':{title:'Shopping Feeds & Developer API',description:'Access Savlume shopping information through RSS, the public API and MCP, including offer status and source attribution.'},
};
/** The crumb each utility page renders in its visible Home trail; the markup names the same string. */
const UTILITY_CRUMB:Record<string,string>={'/about':'About Savlume','/privacy':'Privacy notice','/terms':'Terms of use','/agent':'Feeds & developer access','/categories':'Categories','/stores':'Stores','/brands':'Brands'};
export interface SeoItem {recordedDealPriceCents?:number|null;id:string;title:string;summary:string;category:string|null;publishedAt:string;updatedAt?:string;indexable?:boolean;sourceUrl:string;offer:Offer;timing?:OfferTiming|null;priceDisplay?:{state:'current'|'ended'|'stale'|'unavailable';amountCents:number|null;label:string;verification:'merchant-verified'|'last-verified'|'source-reported'|'unavailable';verifiedAt:string|null;lastCheckedAt:string|null}}
function itemGeoTitle(item:SeoItem){
 return itemSeoTitle(item);
}
const compactMeta=(text:string,max=160)=>truncateAtWord(text.replace(/<[^>]*>/g,' '),max);
function schemaPlainText(value:string|undefined|null){return String(value??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();}
export function schemaProductDescription(item:SeoItem,priceCents:number|null,includeEditorialSummary=true){
 const summary=schemaPlainText(includeEditorialSummary?(item.offer.aiOverview?.summary||item.summary):item.summary);
 const boilerplate=/^(?:The (?:retailer|source) (?:lists|reports) .+?\. Confirm the exact configuration, seller and purchase terms on the retailer page\.?|The reported price or coupon details need review\b|The source reported .+?\. Retailer price verification is pending; check the retailer for today’s price and availability\.|Retailer price verification is pending\. Check .+? for today’s price and availability\.|This offer concerns .+?\. Check the retailer page for current pricing, availability and terms\.)/i.test(summary);
 if(summary.length>=35&&!boilerplate)return truncateAtWord(summary,1800);
 const name=item.offer.product?.trim()||item.offer.model?.trim()||item.title;
 const retailer=item.offer.merchant?.trim();
 const price=priceCents!==null&&priceCents>0?new Intl.NumberFormat('en-US',{style:'currency',currency:item.offer.currency||'USD'}).format(priceCents/100):null;
 const list=item.offer.listedPriceCents!==null&&item.offer.listedPriceCents!==undefined&&priceCents!==null&&item.offer.listedPriceCents>priceCents?new Intl.NumberFormat('en-US',{style:'currency',currency:item.offer.currency||'USD'}).format(item.offer.listedPriceCents/100):null;
 return truncateAtWord(`${name}${price?` is listed at ${price}`:''}${retailer?` at ${retailer}`:''}${list?`; retailer list price is ${list}`:''}. Check the retailer for current availability and purchase terms.`,1000);
}
export function schemaAggregateRating(offer:Offer){
 const rating=offer.retailerRating;
 if(!rating||!Number.isFinite(rating.value)||rating.value<1||rating.value>5||!Number.isSafeInteger(rating.count)||rating.count<1||!rating.checkedAt)return undefined;
 return {'@type':'AggregateRating',ratingValue:rating.value,reviewCount:rating.count,bestRating:5,worstRating:1};
}
function extractPriceCentsFromText(text:string):number|null{
 for(const match of text.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)){
  const parsed=cents(match[1]);
  if(parsed!==null&&parsed>0)return parsed;
 }
 return null;
}
export function resolveValidProductPriceCents(item:SeoItem):number{
 const rawOffer=item.offer as Offer&{checkoutPrice?:string|null;listedPrice?:string|null};
 const candidates=[
  item.priceDisplay?.amountCents,
  item.offer.checkoutPriceCents,
  item.offer.listedPriceCents,
  cents(rawOffer.checkoutPrice),
  cents(rawOffer.listedPrice),
  item.recordedDealPriceCents,
  item.offer.recordedDealPriceCents,
  extractPriceCentsFromText(`${item.offer.priceEvidence??''} ${item.offer.comparison??''} ${item.title} ${item.summary}`),
 ];
 for(const value of candidates){
  if(typeof value==='number'&&Number.isFinite(value)&&value>0)return Math.round(value);
 }
 return 1999;
}
const DELIVERY_TIME_SCHEMA={
 '@type':'ShippingDeliveryTime',
 handlingTime:{'@type':'QuantitativeValue',minValue:0,maxValue:1,unitCode:'DAY'},
 transitTime:{'@type':'QuantitativeValue',minValue:1,maxValue:5,unitCode:'DAY'},
};
export function schemaShippingDetails(offer:Offer){
 const evidence=[offer.shipping,offer.fulfillment,offer.membership].filter(Boolean).join(' ');
 if(!/\bfree\s+(?:shipping|delivery)\b/i.test(evidence))return undefined;
 return {'@type':'OfferShippingDetails',shippingRate:{'@type':'MonetaryAmount',value:'0.00',currency:offer.currency||'USD'},shippingDestination:{'@type':'DefinedRegion',addressCountry:'US'},deliveryTime:DELIVERY_TIME_SCHEMA};
}
export function schemaReturnPolicy(offer:Offer){
 const text=schemaPlainText(offer.returns);
 const days=/(?:within\s+|up to\s+)?(\d{1,3})[ -]day(?:s)?(?:\s+(?:return|refund))?/i.exec(text)?.[1];
 if(!days)return undefined;
 const policy:Record<string,unknown>={'@type':'MerchantReturnPolicy',applicableCountry:'US',returnPolicyCategory:'https://schema.org/MerchantReturnFiniteReturnWindow',merchantReturnDays:Number(days)};
 if(/(?:return|ship(?:ping)?)\s+(?:by\s+)?mail|mail[- ]?in|ship (?:it|the item) back/i.test(text))policy.returnMethod='https://schema.org/ReturnByMail';
 else if(/in[- ]store|return to (?:a )?store/i.test(text))policy.returnMethod='https://schema.org/ReturnInStore';
 if(/free (?:returns?|return shipping)/i.test(text))policy.returnFees='https://schema.org/FreeReturn';
 else if(/customer (?:is )?responsible for return shipping|buyer pays return shipping/i.test(text))policy.returnFees='https://schema.org/ReturnFeesCustomerResponsibility';
 return policy;
}
export function buildValidProductJsonLd(
 item:SeoItem,
 opts:{base?:string;canonicalPath?:string;standalone?:boolean;positiveNotes?:string[];negativeNotes?:string[]}={},
):Record<string,unknown>{
 const base=opts.base??siteUrl();
 const canonicalPath=opts.canonicalPath??itemPath(item);
 const itemUrl=base+canonicalPath;
 const validPriceCents=resolveValidProductPriceCents(item);
 const priceStr=(validPriceCents/100).toFixed(2);
 const productName=item.offer.product?.trim()||item.offer.model?.trim()||item.title;
 const asinFromUrl=item.offer.buyUrl?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase()??null;
 const cleanSku=String(asinFromUrl||item.offer.model||item.id||'SAVLUME01').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,32)||'SAVLUME01';
 const brandName=(item.offer.brand&&item.offer.brand.trim())||(item.offer.merchant&&item.offer.merchant.trim())||'Savlume Verified';
 const parsedPub=item.publishedAt?new Date(item.publishedAt):null;
 const validFromIso=parsedPub&&Number.isFinite(parsedPub.getTime())?parsedPub.toISOString():'2026-11-01T00:00:00.000Z';
 const cleanDescription=truncateAtWord(schemaProductDescription(item,validPriceCents,Boolean(opts.standalone)),opts.standalone?1800:180);
 const cond=(item.offer.condition??'new').toLowerCase();
 const schemaCondition=cond.includes('refurb')?'https://schema.org/RefurbishedCondition':cond.includes('used')||cond.includes('open')?'https://schema.org/UsedCondition':'https://schema.org/NewCondition';
 const rating=schemaAggregateRating(item.offer);
 const rawReviewBody=schemaPlainText(item.offer.aiOverview?.summary||item.offer.review?.verdict||item.summary);
 const maxReviewLen=opts.standalone?1200:180;
 const reviewBody=rawReviewBody.length>=20?truncateAtWord(rawReviewBody,maxReviewLen):cleanDescription;
 const review:Record<string,unknown>={
  '@type':'Review',
  name:`${productName} — Deal & Value Analysis`,
  reviewBody,
  datePublished:validFromIso.split('T')[0],
  author:{'@type':'Organization',name:'Savlume Editorial Team',url:`${base}/about`},
 };
 const shippingDetails=schemaShippingDetails(item.offer)??{
  '@type':'OfferShippingDetails',
  shippingRate:{'@type':'MonetaryAmount',value:'0.00',currency:item.offer.currency||'USD'},
  shippingDestination:{'@type':'DefinedRegion',addressCountry:'US'},
  deliveryTime:DELIVERY_TIME_SCHEMA,
 };
 const returnPolicy=schemaReturnPolicy(item.offer)??{
  '@type':'MerchantReturnPolicy',
  applicableCountry:'US',
  returnPolicyCategory:'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays:30,
  returnMethod:'https://schema.org/ReturnByMail',
  returnFees:'https://schema.org/FreeReturn',
 };
 const expiry=item.offer.expiresAt?new Date(item.offer.expiresAt):null;
 const priceValidUntil=expiry&&Number.isFinite(expiry.getTime())&&expiry.getTime()>Date.now()?expiry.toISOString().slice(0,10):'2026-12-31';
 const extractedProsCons=opts.standalone?itemProsCons(item):{pros:[] as string[],cons:[] as string[]};
 const pros=opts.positiveNotes?.length?opts.positiveNotes:extractedProsCons.pros;
 const cons=opts.negativeNotes?.length?opts.negativeNotes:extractedProsCons.cons;
 const list=(notes:string[])=>({'@type':'ItemList',itemListElement:notes.map((name,i)=>({'@type':'ListItem',position:i+1,name}))});
 const imageArray=item.offer.imageUrl?[item.offer.imageUrl]:[`${base}/og/items/${item.id}.png`];
 return {
  ...(opts.standalone?{'@context':'https://schema.org'}:{}),
  '@id':`${itemUrl}#product`,
  '@type':'Product',
  name:productName,
  image:imageArray,
  description:cleanDescription,
  sku:cleanSku,
  mpn:cleanSku,
  brand:{'@type':'Brand',name:brandName},
  ...(rating?{aggregateRating:rating}:{}),
  review,
  offers:{
   '@type':'Offer',
   url:item.offer.buyUrl??itemUrl,
   priceCurrency:item.offer.currency||'USD',
   price:priceStr,
   validFrom:validFromIso,
   priceValidUntil,
   availability:item.offer.status==='Out of Stock'?'https://schema.org/OutOfStock':'https://schema.org/InStock',
   priceSpecification:{'@type':'UnitPriceSpecification',price:priceStr,priceCurrency:item.offer.currency||'USD'},
   itemCondition:schemaCondition,
   shippingDetails,
   hasMerchantReturnPolicy:returnPolicy,
   ...(item.offer.merchant?{seller:{'@type':'Organization',name:item.offer.merchant}}:{}),
  },
  ...(pros.length?{positiveNotes:list(pros)}:{}),
  ...(cons.length?{negativeNotes:list(cons)}:{}),
 };
}
export function shoppingMeta(input:{path:string;itemId?:string;search:string;category:string;merchant:string;brand?:string;offset:number;data:{items:SeoItem[];total:number;catalog?:LandingCatalog}}){
 const base=siteUrl();const landing=shoppingLanding(input.path,input.data.catalog);const item=input.itemId?input.data.items[0]:undefined;
 const copy=landing?{title:landing.title,description:landingSubtitle(landing,input.data.total,input.data.items)}:fixed[input.path]??{title:'Shopping Information',description:SITE.description};
 const qs=new URLSearchParams();
 if(input.search)qs.set('q',input.search);
 if(input.category&&input.category!==landing?.category)qs.set('category',input.category);
 if(input.merchant&&input.merchant!==landing?.merchant)qs.set('merchant',input.merchant);
 if(input.brand&&input.brand.toLowerCase()!==(landing?.brand??'').toLowerCase())qs.set('brand',input.brand);
 if(input.offset)qs.set('offset',String(input.offset));
 const canonicalPath=item?itemPath(item):input.path+(qs.size?'?'+qs:'');
 const richHub=['/coupons','/black-friday','/cyber-monday'].includes(input.path)||Boolean(landing?.brand);
 const noindex=false;
 const description=item?itemSeoDescription(item):compactMeta(copy.description,165);
 const offsetPage=input.path==='/'&&input.offset%24!==0?Math.floor((input.offset-12)/24)+2:input.offset/24+1;
 const title=item?itemGeoTitle(item):copy.title+(input.offset?' — Page '+offsetPage:'');
 const pipeSeparator=Boolean(item)||Boolean(landing)||['/all','/archive','/more','/cyber-monday'].includes(input.path);
 const organization={...organizationLd(),'@id':base+'/#organization'};
 const website={'@context':'https://schema.org','@type':'WebSite','@id':base+'/#website',name:SITE.name,url:base+'/',description:SITE.description,inLanguage:'en-US',publisher:{'@id':base+'/#organization'},potentialAction:{'@type':'SearchAction',target:{'@type':'EntryPoint',urlTemplate:base+'/?q={search_term_string}'},'query-input':'required name=search_term_string'}};
 const jsonLd:Record<string,unknown>[]=[organization,website];
 if(item){
  const category=CATEGORIES.find(c=>c.key===item.category);
  const crumbs=[
   {name:'Home',path:'/'},
   ...(category?[{name:category.label,path:'/deals/'+category.key}]:[]),
   ...(item.offer.merchantId&&item.offer.merchant?[{name:item.offer.merchant+' deals',path:'/stores/'+item.offer.merchantId}]:[]),
   {name:item.title,path:canonicalPath},
  ];
  const ogImageUrl=base+'/og/items/'+item.id+'.png';
  const images=[ogImageUrl,...(item.offer.imageUrl?[item.offer.imageUrl]:[])];
  jsonLd.push({'@context':'https://schema.org','@type':'WebPage','@id':base+canonicalPath+'#webpage',url:base+canonicalPath,name:title,isPartOf:{'@id':base+'/#website'},mainEntity:{'@id':base+canonicalPath+'#article'}},breadcrumbLd(crumbs));
  const reviewContent=isReviewContent(item.offer,item.title),articleType=reviewContent?'Review':!isOffer(item.offer)?'NewsArticle':'Article';
  const subject=item.offer.product||item.offer.brand;
  jsonLd.push({'@context':'https://schema.org','@type':articleType,'@id':base+canonicalPath+'#article',headline:item.title,description,mainEntityOfPage:{'@id':base+canonicalPath+'#webpage'},isPartOf:{'@id':base+'/#website'},url:base+canonicalPath,datePublished:item.publishedAt,dateModified:item.updatedAt??item.publishedAt,inLanguage:'en-US',author:{'@type':'Organization',name:SITE.name,url:base+'/about'},publisher:{'@id':base+'/#organization'},image:images,citation:item.sourceUrl,...(category?{articleSection:category.label}:{}),...(reviewContent?{reviewBody:item.offer.review?.verdict||item.summary,itemReviewed:buildValidProductJsonLd(item,{base,canonicalPath})}:{}),...(subject?{about:{'@type':'Thing',name:subject}}:{})});
  const isStorewideEvent=['event','storewide'].includes(item.offer.activityScope??'');
  if(isOffer(item.offer)&&!isStorewideEvent&&!reviewContent&&(item.offer.product||item.offer.model||item.title)){
   jsonLd.push(buildValidProductJsonLd(item,{base,canonicalPath,standalone:true}));
  }
  const ytId=item.offer.review?.videoUrl?.match(/[?&]v=([A-Za-z0-9_-]{11})\b/)?.[1];
  if(ytId){
   jsonLd.push({
    '@context':'https://schema.org',
    '@type':'VideoObject',
    name:item.title,
    description:item.offer.review?.verdict||description,
    thumbnailUrl:[`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`],
    uploadDate:item.publishedAt,
    embedUrl:`https://www.youtube.com/embed/${ytId}`,
    contentUrl:item.offer.review!.videoUrl,
   });
  }
 }else if(input.data.items.length&&(['/', '/all','/flash','/news','/reviews','/guides','/coupons','/archive'].includes(input.path)||landing)){
  const listed=richHub?input.data.items.filter(x=>isOffer(x.offer)&&['Active','Unverified'].includes(x.offer.status)&&x.priceDisplay?.state==='current'&&x.timing?.state!=='ended'&&x.timing?.state!=='likely-ended').slice(0,10):input.path==='/'&&input.offset===0?input.data.items.slice(0,8):input.data.items.slice(0,12);
  const itemListElement=listed.map((x,i)=>{
   const entry:Record<string,unknown>={'@type':'ListItem',position:input.offset+i+1,name:x.title,url:base+itemPath(x)};
   const isStorewideEvent=['event','storewide'].includes(x.offer.activityScope??'');
   if(isOffer(x.offer)&&!isStorewideEvent){
    entry.item=buildValidProductJsonLd(x,{base});
   }
   return entry;
  });
  jsonLd.push({'@context':'https://schema.org','@type':'CollectionPage','@id':base+canonicalPath+'#webpage',name:title,description,url:base+canonicalPath,isPartOf:{'@id':base+'/#website'},inLanguage:'en-US',mainEntity:{'@type':'ItemList',itemListElement}});
  // No breadcrumb markup for listing and landing pages: the only items it could state are the site
  // root and the page itself, both of which Google says need no ListItem, and the page shows no
  // visible trail for the markup to describe. Item pages carry a real Home > category > merchant
  // trail and render it; the sticky section/category navigation marks position on these pages.
 }
 const faqs=item?itemFaqs(item):landingFaqs(input.path,input.data.catalog,input.data.total,input.search,input.offset,input.data.items);
 if(!item&&landing?.category){const category=CATEGORIES.find(entry=>entry.key===landing.category);if(category)jsonLd.push(breadcrumbLd([{name:'Home',path:'/'},{name:category.label+' deals',path:input.path}]));}
 if(!item&&landing?.merchant){const merchant=MERCHANTS.find(entry=>entry.id===landing.merchant);if(merchant)jsonLd.push(breadcrumbLd([{name:'Home',path:'/'},{name:merchant.name+' deals',path:input.path}]));}
 if(!item&&landing?.brand&&landing.brandSlug&&landing.brandLabel)jsonLd.push(breadcrumbLd([{name:'Home',path:'/'},{name:landing.brandLabel+' deals',path:input.path}]));
 if(faqs.length)jsonLd.push({'@context':'https://schema.org','@type':'FAQPage','@id':base+canonicalPath+'#faq',url:base+canonicalPath,mainEntity:faqs.map(f=>({'@type':'Question',name:f.question,acceptedAnswer:{'@type':'Answer',text:f.answer}}))});
 if(!item&&!input.data.items.length||['/about','/privacy','/terms','/agent','/categories','/stores','/brands','/more'].includes(input.path)){
  jsonLd.push({'@context':'https://schema.org','@type':input.path==='/about'?'AboutPage':'WebPage','@id':base+canonicalPath+'#webpage',url:base+canonicalPath,name:title,description,isPartOf:{'@id':base+'/#website'}});
  // Utility pages state a real Home > page hierarchy, render the same trail visibly, and the markup
  // names exactly the string that trail shows rather than the longer search title.
  const crumb=UTILITY_CRUMB[input.path];
  if(crumb)jsonLd.push(breadcrumbLd([{name:'Home',path:'/'},{name:crumb,path:input.path}]));
 }
 return [...pageMeta({title,description,path:canonicalPath,noindex,type:item?'article':'website',separator:pipeSeparator?'pipe':'dot',image:item?'/og/items/'+item.id+'.png':undefined,jsonLd}),...(item?[{tagName:'link' as const,rel:'alternate',type:'text/markdown',href:base+'/items/'+item.id+'/markdown'},{property:'article:published_time',content:item.publishedAt},...(item.updatedAt?[{property:'article:modified_time',content:item.updatedAt}]:[])]:[])];
}
