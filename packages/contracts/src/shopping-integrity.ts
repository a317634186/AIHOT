import {MERCHANTS,merchantFor,isDirectRetailerProductUrl} from '@aihot/industry/shopping';
import {cents,isOffer,offerSavings,reportedDeadlineDay,type Offer,type OfferTiming} from './shopping.ts';

const words=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const primarySource=(value:string)=>value.split(/\b(?:related offers|related deals|more deals|you may also like)\b/i,1)[0]!.replace(/\s+/g,' ').trim();
/** Recover an explicitly stated shipping charge from a source quotation, retaining its conditions. */
export function sourceShippingFromEvidence(quote:string|null|undefined):string|null{
 if(!quote)return null;
 const money=String.raw`\$\s*\d[\d,]*(?:\.\d{1,2})?(?!\d|\.\d)`;
 const matches=[...quote.matchAll(new RegExp(String.raw`(?:${money}\s*(?:for\s+)?(?:shipping|delivery)\b|\b(?:shipping|delivery)\s*(?::|is|costs?)\s*${money})`,'gi'))];
 if(matches.length!==1)return null;
 const match=matches[0]!,at=match.index??0,before=quote.slice(Math.max(0,at-50),at);
 const excerpt=(quote.slice(at).split(/[!?;\n]|\.(?!\d)/,1)[0]??'').trim();
 const after=quote.slice(at+match[0].length);
 if(/\b(?:save|saves|saving|discount|credit|up to|waive)\s*$/i.test(before)||/^\s*(?:(?:is|was)\s+)?(?:free|included|complimentary|credit|coupon|discount|savings|rebate|refund|reimbursement)\b/i.test(after)||/\b(?:waived|credited|refunded|reimbursed)\b/i.test(excerpt))return null;
 return excerpt||null;
}
/** Extract only explicit after-coupon totals, never savings, rewards or listed/reference prices. */
export function couponFinalPriceClaims(text:string):number[]{
 text=text.replace(/\b(?:down|reduced|discounted|dropped)\s+from\s+\$\s*\d[\d,]*(?:\.\d{1,2})?(?!\d|\.\d)/gi,'previously listed');
 const values:number[]=[];
 const money=/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g;
 const couponWord=String.raw`(?:coupon|promo(?:tional)?(?:\s+code)?|code|voucher)`;
 const hasCoupon=/\b(?:coupon|promo(?:tional)?(?:\s+code)?|code|voucher)\b/i;
 // Keep each sentence isolated: a coupon mention in a following article section must not
 // accidentally turn an earlier list price into an after-coupon claim.
 for(const sentence of text.split(/(?<=[.!?;])\s+|\n+/)){
  const matches=[...sentence.matchAll(money)];
  for(let i=0;i<matches.length;i++){
   const m=matches[i]!,at=m.index??0,end=at+m[0].length;
   const before=sentence.slice(Math.max(0,at-180),at),after=sentence.slice(end,Math.min(sentence.length,end+180));
   if(/\b(?:save|saving(?:s)?(?:\s+of)?|discount(?:\s+of)?|cashback(?:\s+of)?|gift\s*card(?:\s+of)?|rewards?(?:\s+of)?|(?:shipping|delivery|postage)(?:\s+(?:fee|costs?|charges?|is))?|(?:down|reduced|discounted|dropped) from|regular price|regularly|reg\.?|list price|retail price|original price|originally|was|compared (?:to|with))\s*$/i.test(before)||/[-−–]\s*$/.test(before)||/^\s*(?:[-−–]\s*\d|off\b|(?:for\s+)?(?:shipping|delivery|postage)\b|(?:in\s+)?cashback\b|(?:[A-Za-z]+\s+){0,4}gift\s*card\b|rewards?\b|savings?\b|discount\b|(?:list|regular|retail|reference|original)\s+price\b)/i.test(after))continue;
   // A face-value card discounted for purchase is ambiguous with a gift-card reward; do not
   // promote its denomination to a coupon total without a retailer-backed checkout observation.
   if(/\bgift\s*card\b/i.test(before.slice(-100)))continue;
   const sameSentence=after.split(/[$!?;]|\.(?!\d)/,1)[0]?.split('$',1)[0]??'';
   const explicitlyPreCoupon=/\b(?:before|prior to|pre[ -]coupon|without)\b.{0,45}\b(?:coupon|promo(?:tional)?(?:\s+code)?|code|voucher)\b/i.test(sameSentence);
   const connector=/\b(?:after|with|using|when|once)\b.{0,90}\b(?:coupon|promo(?:tional)?(?:\s+code)?|code|voucher)\b/i.exec(sameSentence);
   const beforeCoupon=/\b(?:before|prior to|pre[ -]coupon|without)\b.{0,45}\b(?:coupon|promo(?:tional)?(?:\s+code)?|code|voucher)\b/i.test(before);
   const priceAfterCoupon=/\b(?:after|with|using|once|when)\b.{0,70}\b(?:coupon|promo(?:tional)?(?:\s+code)?|code|voucher)\b.{0,70}\b(?:for|at|to|pay|price|cost|total|only|now)\s*$/i.test(before);
   const codeActionBefore=new RegExp(String.raw`\b(?:use|apply|enter|clip|activate|redeem)\b.{0,100}\b${couponWord}\b.{0,100}\b(?:for|at|to|pay|price|cost|total|only|now)\s*$`,'i').test(before);
   const couponLeadsToPrice=new RegExp(String.raw`\b${couponWord}\b.{0,120}\b(?:for|at|to|pay|price|cost|total|only|now|drops?\s+to|brings?\b.{0,24}\bto|comes?\s+to|makes?\s+it)\s*$`,'i').test(before);
   const couponEquation=new RegExp(String.raw`\b${couponWord}\b[^$]{0,150}=\s*$`,'i').test(before);
   const priceHasCoupon=!!connector&&!/=\s*$/.test(sameSentence)&&!/\b(?:more|features|related|buy now|shop now)\b/i.test(sameSentence.slice(0,connector.index));
   // If the sentence explicitly moves from an earlier amount to a later checkout total,
   // associate the coupon claim with the amount after that transition only.
   const followedByCouponTotal=matches.slice(i+1).some(next=>{
    const gap=sentence.slice(end,(next.index??0));
    return gap.length<=150&&hasCoupon.test(gap)&&/\b(?:for|pay|total|drops?\s+to|brings?\b.{0,24}\bto|comes?\s+to|now|price|cost|=)\s*$/.test(gap);
   });
   if(explicitlyPreCoupon||beforeCoupon||followedByCouponTotal)continue;
   if(priceHasCoupon||priceAfterCoupon||codeActionBefore||couponLeadsToPrice||couponEquation){const value=cents(m[1]);if(value!==null)values.push(value);}
  }
 }
 return [...new Set(values)];
}
export interface CouponPriceValidation {applicable:boolean;issue:'coupon-price-conflict'|'coupon-price-unconfirmed'|null;editorialConflict:boolean;sourceClaims:number[];}
/** One decision shared by extraction, public rendering and scheduled integrity checks. */
export function validateCouponPrice(input:{title:string;sourceTitle?:string|null;sourceBody?:string|null;summary?:string|null;reason?:string|null;offer:Offer}):CouponPriceValidation{
 const {offer}=input,hasCoupon=!!offer.coupon?.trim();const explicitCoupon=couponFinalPriceClaims(input.title+' '+(offer.priceEvidence??'')).length>0;
 if(!isOffer(offer)||!hasCoupon&&offer.kind!=='coupon_offer'&&!explicitCoupon)return {applicable:false,issue:null,editorialConflict:false,sourceClaims:[]};
 const amount=offer.checkoutPriceCents;
 const sourceClaims=[...new Set([
  ...couponFinalPriceClaims(primarySource(input.sourceTitle??'')),
  ...couponFinalPriceClaims(primarySource(input.sourceBody??'')),
  ...couponFinalPriceClaims(primarySource(offer.priceEvidence??'')),
 ])];
 const titleClaims=[...couponFinalPriceClaims(input.title)];
 const headline=headlineOfferPrice(input.title);if(headline!==null)titleClaims.push(headline);
 const ai=offer.aiOverview;const editorial=[input.summary,input.reason,ai?.summary,ai?.bestFor,ai?.priceReason,...(ai?.highlights??[]),...(ai?.cautions??[])].filter((x):x is string=>!!x);
 const titleConflict=amount!==null&&titleClaims.some(value=>value!==amount),sourceConflict=amount!==null&&sourceClaims.some(value=>value!==amount);
 const editorialConflict=amount!==null&&(editorial.some(text=>couponFinalPriceClaims(text).some(value=>value!==amount))||titleConflict&&!sourceConflict&&sourceClaims.includes(amount));
 const conflicting=sourceConflict||titleConflict&&!sourceClaims.includes(amount);
 return {applicable:true,issue:amount===null||!hasCoupon?'coupon-price-unconfirmed':conflicting?'coupon-price-conflict':null,editorialConflict,sourceClaims};
}
/** A sales-ad announcement is not a single-product offer just because it mentions a product. */
export function isSaleAnnouncement(title:string,offer:Pick<Offer,'product'|'model'>):boolean{
 const ad=/\b(?:ad scan|ad details|ad preview|coupon book|sales? (?:flyer|circular|catalog)|(?:black friday|holiday savings)\b.{0,80}\bad\b|\bad\b.{0,35}\b(?:released|revealed|leaked|preview)|(?:best|top)\s+\d+\s+(?:\S+\s+){0,4}(?:deals|offers)|(?:deals|offers)\s+roundup)\b/i.test(title);
 if(!ad)return false;
 const headline=' '+words(title)+' ',model=words(offer.model??'');if(model.length>=4&&headline.includes(' '+model+' '))return false;
 const terms=[...new Set(words(offer.product??'').split(' ').filter(x=>x.length>=4&&!/^(?:with|pack|inch|piece|system|product|sale)$/.test(x)))];
 return terms.filter(term=>headline.includes(' '+term+' ')).length<2;
}
/** Preserve the article and its source while removing product claims extracted from a roundup. */
export function saleAnnouncementAsNews(offer:Offer):Offer{
 return {...offer,...({listedPrice:null,checkoutPrice:null} as Record<string,null>),kind:'shopping_news',activityScope:'event',product:null,model:null,variant:null,buyUrl:null,listedPriceCents:null,checkoutPriceCents:null,priceEvidence:null,priceIssue:null,comparison:null,coupon:null,steps:[],restrictions:[],membership:null,subscription:null,renewal:null,cashback:null,giftCard:null,points:null,unitQuantity:null,unitPriceCents:null,promotion:null,aiOverview:null,expiresAt:null,deadlineOriginal:null,status:'Unverified',verifiedAt:null,identity:null};
}
export function reviewAsGuide(offer:Offer):Offer{
 return {...saleAnnouncementAsNews(offer),kind:'buying_guide',activityScope:null,product:offer.product,model:offer.model,variant:offer.variant,condition:offer.condition,review:offer.review??null};
}
/** A launch or preorder at its ordinary price is news, unless an actual offer was extracted. */
export function isNonPromotionalAnnouncement(title:string,offer:Offer):boolean{
 return /\b(?:pre[ -]?orders?|preorder|first look|preview|announces?|unveils?|launches?|introduces?|debuts?)\b/i.test(title)
  &&!offerSavings(offer)&&!offer.coupon&&!offer.cashback&&!offer.giftCard&&!offer.points&&!(offer.promotion?.kind==='platform_sale'&&/\d/.test(offer.promotion.quote));
}
/** Product feeds require a source passage for this product and its displayed offer price. */
export function sourceProductOfferEvidence(title:string,offer:Offer,body:string):boolean{
 if(!isOffer(offer)||isSaleAnnouncement(title,offer)||!offer.product?.trim())return false;
 const couponCheck=validateCouponPrice({title,sourceBody:body,offer});if(couponCheck.issue)return false;
 const primary=primarySource(body),normalized=' '+words(primary)+' ',productTerms=[...new Set(words(offer.product).split(' ').filter(x=>x.length>=3&&!/^(?:the|and|with|for|set|pack|piece|inch|product)$/.test(x)))];
 if(productTerms.length<2||productTerms.filter(term=>normalized.includes(' '+term+' ')).length<Math.max(2,Math.ceil(productTerms.length*.6)))return false;
 const quote=offer.priceEvidence?.replace(/\s+/g,' ').trim(),at=quote?primary.toLowerCase().indexOf(quote.toLowerCase()):-1;if(!quote||at<0)return false;
 const context=' '+words(primary.slice(Math.max(0,at-300),Math.min(primary.length,at+quote.length+300)))+' ';
 if(productTerms.filter(term=>context.includes(' '+term+' ')).length<Math.max(2,Math.ceil(productTerms.length*.6)))return false;
 const amount=offer.checkoutPriceCents??(!offer.coupon?offer.listedPriceCents:null);if(amount===null)return false;
 const amounts=[...primary.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)].map(m=>cents(m[1]));
 if(!amounts.includes(amount))return false;
 const headlinePrice=headlineOfferPrice(title);if(headlinePrice!==null&&headlinePrice!==amount&&!(couponCheck.applicable&&couponCheck.sourceClaims.includes(amount)))return false;
 const coupon=offer.coupon?.trim()??'',code=/^[A-Z0-9]{4,32}$/.test(coupon)?coupon:coupon.match(/\b(?=[A-Z0-9]{5,32}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+\b/)?.[0],codeContext=' '+words(primary.slice(Math.max(0,at-600),Math.min(primary.length,at+quote.length+600)))+' ';if(code&&!codeContext.includes(' '+words(code)+' '))return false;
 return true;
}
/** A checkout price alone is not evidence of a sale or incentive. */
export function sourceDealBenefitEvidence(title:string,offer:Offer,body:string):boolean{
 if(!sourceProductOfferEvidence(title,offer,body))return false;
 const primary=primarySource(body),quote=offer.priceEvidence!.replace(/\s+/g,' ').trim(),at=primary.toLowerCase().indexOf(quote.toLowerCase());
 const nearby=primary.slice(Math.max(0,at-500),Math.min(primary.length,at+quote.length+500));
 const amounts=[...nearby.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)].map(m=>cents(m[1]));
 if(offer.kind==='freebie'&&offer.checkoutPriceCents===0&&/\bfree\b/i.test(nearby))return true;
 const saving=offerSavings(offer);if(saving&&amounts.includes(saving.wasCents)&&amounts.includes(saving.nowCents))return true;
 const coupon=offer.coupon?.trim()??'';
 const code=/^[A-Z0-9]{4,32}$/.test(coupon)?coupon:coupon.match(/\b(?:[Cc]ode|[Cc]oupon)\s*[:\"']?\s*([A-Z0-9]{4,32})\b/)?.[1];
 if(code&&(' '+words(nearby)+' ').includes(' '+words(code)+' '))return true;
 if(coupon&&/\b(?:clip|apply|activate|redeem)\b.{0,60}\b(?:coupon|promo(?:tion)?|discount)\b/i.test(nearby))return true;
 for(const [value,signal] of [[offer.giftCard,/\bgift\s*card\b/i],[offer.cashback,/\bcash[ -]?back\b/i],[offer.points,/\bpoints?\b/i]] as const){
  if(!value||!signal.test(nearby))continue;
  const valueAmounts=[...value.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)].map(m=>cents(m[1]));
  if(valueAmounts.length&&valueAmounts.every(amount=>amounts.includes(amount)))return true;
  const percent=value.match(/\b(\d+(?:\.\d+)?)\s*%/);if(percent&&nearby.includes(percent[0]))return true;
  const points=value.match(/\b(\d[\d,]*)\s*(?:points?|pts)\b/i);if(points&&new RegExp('\\b'+points[1]!.replaceAll(',','\\,')+'\\s*(?:points?|pts)\\b','i').test(nearby))return true;
 }
 const promo=offer.promotion?.quote?.replace(/\s+/g,' ').trim();
 return !!promo&&nearby.toLowerCase().includes(promo.toLowerCase())&&/(?:\$\s*\d[\d,.]*\s*(?:off|discount|savings)|\b(?:save|saving)\s+\$\s*\d|\d+(?:\.\d+)?\s*%\s*(?:off|discount))/i.test(promo);
}
/** Require product, both prices, any coupon code and the actual deadline in the original offer section. */
export function limitedOfferEvidence(title:string,offer:Offer,body:string,publishedAt:string):boolean{
 if(!sourceProductOfferEvidence(title,offer,body)||offer.activityScope&&offer.activityScope!=='single_product')return false;
 const primary=primarySource(body),normalized=' '+words(primary)+' ',productTerms=[...new Set(words(offer.product??'').split(' ').filter(x=>x.length>=3&&!/^(?:the|and|with|for|set|pack|piece|inch|product)$/.test(x)))];
 if(productTerms.length<2||productTerms.filter(term=>normalized.includes(' '+term+' ')).length<Math.max(2,Math.ceil(productTerms.length*.6)))return false;
 const quote=offer.priceEvidence?.replace(/\s+/g,' ').trim(),at=quote?primary.toLowerCase().indexOf(quote.toLowerCase()):-1;if(!quote||at<0)return false;
 const nearby=primary.slice(Math.max(0,at-300),Math.min(primary.length,at+quote.length+300));
 const amounts=[...nearby.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)].map(m=>cents(m[1]));
 if(offer.checkoutPriceCents===null||offer.listedPriceCents===null||!amounts.includes(offer.checkoutPriceCents)||!amounts.includes(offer.listedPriceCents))return false;
 const deadline=words(offer.deadlineOriginal??''),deadlineContext=' '+words(primary.slice(Math.max(0,at-1200),Math.min(primary.length,at+quote.length+1200)))+' ';if(!deadline||!deadlineContext.includes(' '+deadline+' ')||!reportedDeadlineDay(offer.deadlineOriginal,publishedAt)&&!offer.expiresAt)return false;
 const dates=[...primary.matchAll(/\b(?:deal|offer|sale|promotion)?\s*(?:ends?|expires?|valid (?:through|until)|through)\s+(?:on\s+)?(?:[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/gi)].map(m=>reportedDeadlineDay(m[0],publishedAt)).filter(Boolean);
 if(new Set(dates).size>1)return false;
 const coupon=offer.coupon?.trim()??'',code=/^[A-Z0-9]{4,32}$/.test(coupon)?coupon:coupon.match(/\b(?=[A-Z0-9]{5,32}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+\b/)?.[0];if(code&&!normalized.includes(' '+words(code)+' '))return false;
 return true;
}
const headlinePricePattern=()=>/\b(?:for|from|at|now(?:\s+at)?|priced\s+at)\s+(?:(?:just|only)\s+)?\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/gi;

/** A single explicit advertised offer price; savings and reference prices are not treated as the offer. */
export function headlineOfferPrice(title:string):number|null{
 const values=[...title.matchAll(headlinePricePattern())].map(m=>cents(m[1])).filter((v):v is number=>v!==null);
 return values.length===1?values[0]!:null;
}

/** Remove a conflicting headline price instead of inventing a new claim. */
export function consistentOfferTitle(title:string,displayedPriceCents:number|null):string{
 if(displayedPriceCents===null)return title;
 const out=title.replace(headlinePricePattern(),(match,_amount:string)=>cents(_amount)===displayedPriceCents?match:'').replace(/\s+/g,' ').replace(/\s+([,.!?])/g,'$1').trim();
 return out||title;
}

/** Identify retailers explicitly named after "at", not brand names elsewhere in the title. */
export function headlineRetailers(title:string):string[]{
 const tail=/\bat\s+(.{1,180})$/i.exec(title)?.[1];if(!tail)return [];
 const text=' '+words(tail)+' ';const ids:string[]=[];
 for(const merchant of MERCHANTS){
  const aliases=[merchant.name,merchant.id.replaceAll('-',' '),...(merchant.id==='anker-solix'?['Anker']:[])];
  if(aliases.some(alias=>{const name=words(alias);return name&&text.includes(' '+name+' ');}))ids.push(merchant.id);
 }
 return [...new Set(ids)];
}
export function expectedRetailers(title:string,offer:Pick<Offer,'merchantId'>):string[]{
 const named=headlineRetailers(title);return named.length?named:offer.merchantId?[offer.merchantId]:[];
}
export function mismatchedRetailer(title:string,offer:Pick<Offer,'kind'|'buyUrl'|'merchantId'>):boolean{
 if(!isOffer(offer)||!offer.buyUrl)return false;const actual=merchantFor(offer.buyUrl);const named=headlineRetailers(title);
 return !!actual&&(named.length>0&&!named.includes(actual.id)||!!offer.merchantId&&offer.merchantId!==actual.id);
}
export function needsLinkRepair(title:string,offer:Pick<Offer,'kind'|'buyUrl'|'merchantId'|'linkIssue'>):boolean{
 return isOffer(offer)&&!!offer.buyUrl&&(!isDirectRetailerProductUrl(offer.buyUrl)||mismatchedRetailer(title,offer)||offer.linkIssue?.kind==='product_mismatch'&&offer.linkIssue.url===offer.buyUrl);
}
export function homepageEligible(offer:Pick<Offer,'kind'|'status'>,timing:OfferTiming|null|undefined):boolean{
 return !isOffer(offer)||!['Expired','Out of Stock'].includes(offer.status)&&timing?.state!=='ended'&&timing?.state!=='likely-ended';
}

/** Accept a coupon price only when its amount, code and specific model are adjacent in the source. */
export function sourceCouponPrice(title:string,offer:Pick<Offer,'kind'|'coupon'|'model'>,sourceText:string):{priceCents:number;quote:string}|null{
 const price=headlineOfferPrice(title),code=offer.coupon?.trim(),model=offer.model?.trim();
 if(!['product_deal','coupon_offer'].includes(offer.kind)||price===null||!code||!model||code.length>100)return null;
 const compact=(v:string)=>words(v).replaceAll(' ','');
 const sentences=primarySource(sourceText).split(/(?<=[.!?])\s+(?=[A-Z])/);
 for(const sentence of sentences){const at=sentence.toLowerCase().indexOf(code.toLowerCase());if(at<0||!compact(sentence).includes(compact(model)))continue;
  const amounts=[...sentence.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)].map(m=>({amount:cents(m[1]),distance:Math.abs((m.index??0)-at)})).sort((a,b)=>a.distance-b.distance);
  if(amounts[0]?.amount===price&&amounts[0].distance<=220)return {priceCents:price,quote:sentence.slice(0,1000)};
 }
 return null;
}

/** Source-reported single-product prices need the same model, retailer and sale amount in one sentence. */
export function sourceOfferPrice(title:string,offer:Offer,sourceText:string):{priceCents:number;quote:string}|null{
 const price=headlineOfferPrice(title),model=offer.model?.trim(),merchant=offer.buyUrl?merchantFor(offer.buyUrl):null;
 const product=words(offer.product??'');
 if(!['product_deal','coupon_offer'].includes(offer.kind)||offer.kind==='coupon_offer'&&!offer.coupon||price===null||!merchant||isSaleAnnouncement(title,offer)||model&&(words(model).replaceAll(' ','').length<4||!/[0-9]/.test(model))||!model&&product.split(' ').filter(x=>x.length>=3).length<3)return null;
 const matchesContext=(quote:string)=>{const line=' '+words(quote)+' ',aliases=[merchant.name.replace(/^the /i,''),...(merchant.id==='anker-solix'?['Anker']:[])];
  if(!aliases.some(name=>line.includes(' '+words(name)+' ')))return false;
  const used=/\b(?:refurb(?:ished)?|renewed|used|pre[ -]?owned|open[ -]?box)\b/i;
  if(used.test(quote)!==used.test([offer.condition,offer.variant].filter(Boolean).join(' ')))return false;
  const variant=words(offer.variant??'');return !variant||line.includes(' '+variant+' ');
 };
 if(offer.coupon){const candidate=sourceCouponPrice(title,offer,sourceText);return candidate&&matchesContext(candidate.quote)?candidate:null;}
 if(offer.membership||offer.subscription||offer.renewal||offer.minimumSpend||offer.cashback||offer.giftCard||offer.points||offer.restrictions?.length)return null;
 const retailer=words(merchant.name).replace(/^the /,'');const productModel=words(model??'');const sentences=primarySource(sourceText).split(/(?<=[.!?])\s+(?=[A-Z])/);
 for(const sentence of sentences){const line=' '+words(sentence)+' ';if(!line.includes(' '+retailer+' ')||!line.includes(' '+(model?productModel:product)+' '))continue;
  const amounts=[...sentence.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)];
  for(const amount of amounts){if(cents(amount[1])!==price)continue;const lead=sentence.slice(Math.max(0,(amount.index??0)-55),amount.index).toLowerCase();
   if(/\b(?:for|at|now|only|sale|price|down to|just)\s*(?:for\s*)?$/.test(lead)&&!/coupon|promo code|subscribe|membership|cashback|gift card/i.test(sentence)&&matchesContext(sentence))return {priceCents:price,quote:sentence.slice(0,1000)};
  }
 }
 return null;
}
