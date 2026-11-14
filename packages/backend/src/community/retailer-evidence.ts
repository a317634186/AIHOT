import {load} from 'cheerio';
import {cents,cleanMerchantLink} from '@aihot/contracts/shopping';
import {isCommunitySubmissionUrl} from './submissions.ts';
import {merchantFor} from '@aihot/industry/shopping';

export type RetailerEvidence={productName:string;state:'verified'|'out_of_stock'|'unverified';priceCents:number|null;seller:string|null};
const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'');
const sellerKey=(value:string)=>normalize(value).replace(/(?:corporation|company|incorporated|limited|inc|llc|ltd|corp|com)+$/,'');
export function sameRetailerPage(a:string,b:string){
 try{const x=new URL(cleanMerchantLink(a)),y=new URL(cleanMerchantLink(b));x.hash='';y.hash='';x.searchParams.sort();y.searchParams.sort();return merchantFor(x.href)?.id===merchantFor(y.href)?.id&&x.pathname.replace(/\/+$/,'')===y.pathname.replace(/\/+$/,'')&&x.search===y.search;}catch{return false;}
}

/** Only a matched retailer Product and a single unconditional, in-stock retailer Offer establish a price. */
export function extractRetailerEvidence(html:string,pageUrl:string):RetailerEvidence|null{
 if(!isCommunitySubmissionUrl(pageUrl,'product'))return null;
 const merchant=merchantFor(pageUrl)!,$=load(html),products:any[]=[];
 const walk=(x:any)=>{if(Array.isArray(x)){x.forEach(walk);return;}if(!x||typeof x!=='object')return;const type=x['@type'];if(type==='Product'||Array.isArray(type)&&type.includes('Product'))products.push(x);if(x['@graph'])walk(x['@graph']);};
 $('script[type="application/ld+json"]').each((_i,e)=>{try{walk(JSON.parse($(e).text()));}catch{}});
 const resolve=(v:unknown)=>{try{return typeof v==='string'?new URL(v,pageUrl).href:null;}catch{return null;}};
 const canonical=resolve($('link[rel="canonical"]').first().attr('href'));
 const matched=products.filter(p=>{const direct=resolve(p.url);return direct?sameRetailerPage(pageUrl,direct):products.length===1&&!!canonical&&sameRetailerPage(pageUrl,canonical);});
 if(matched.length!==1)return null;
 const p=matched[0],productName=typeof p.name==='string'?p.name.replace(/\s+/g,' ').trim().slice(0,200):'';if(!productName)return null;
 const unknown:RetailerEvidence={productName,state:'unverified',priceCents:null,seller:null};
 const offers=Array.isArray(p.offers)?p.offers:[p.offers];if(offers.length!==1)return unknown;
 const offer=offers[0];if(!offer||typeof offer!=='object'||offer['@type']==='AggregateOffer')return unknown;
 const offerUrl=resolve(offer.url);if(offerUrl&&!sameRetailerPage(pageUrl,offerUrl))return unknown;
 const seller=typeof offer.seller==='string'?offer.seller:offer.seller?.name;
 if(typeof seller!=='string'||sellerKey(seller)!==sellerKey(merchant.name))return unknown;
 const amount=cents(offer.price);if(amount===null||amount>2147483647||String(offer.priceCurrency).toUpperCase()!=='USD')return unknown;
 if(offer.priceSpecification||offer.eligibleQuantity||offer.eligibleCustomerType||offer.validForMemberTier||offer.businessFunction&&!/sell$/i.test(String(offer.businessFunction)))return unknown;
 if(offer.priceValidUntil){const raw=String(offer.priceValidUntil);const end=/^\d{4}-\d{2}-\d{2}$/.test(raw)?Date.parse(raw+'T23:59:59Z'):NaN;if(!Number.isFinite(end)||end<Date.now())return unknown;}
 const condition=normalize(String(offer.itemCondition??''));if(condition&&!condition.endsWith('newcondition')&&!condition.endsWith('new'))return unknown;
 const region=offer.eligibleRegion;if(region){const country=typeof region==='string'?region:region?.name??region?.addressCountry;if(typeof country!=='string'||!['us','usa','unitedstates'].includes(normalize(country)))return unknown;}
 const availability=String(offer.availability??'');
 if(/(?:^|\/)InStock$/i.test(availability))return {productName,state:'verified',priceCents:amount,seller:seller.slice(0,120)};
 if(/(?:^|\/)(?:OutOfStock|SoldOut)$/i.test(availability))return {productName,state:'out_of_stock',priceCents:amount,seller:seller.slice(0,120)};
 return unknown;
}
