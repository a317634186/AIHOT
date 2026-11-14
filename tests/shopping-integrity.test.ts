import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consistentOfferTitle,headlineOfferPrice,headlineRetailers,homepageEligible,mismatchedRetailer,needsLinkRepair,sourceCouponPrice,sourceOfferPrice,isSaleAnnouncement,isNonPromotionalAnnouncement,saleAnnouncementAsNews,sourceProductOfferEvidence,sourceDealBenefitEvidence,limitedOfferEvidence,couponFinalPriceClaims,validateCouponPrice,sourceShippingFromEvidence} from '../packages/contracts/src/shopping-integrity.ts';
import {isReviewHeadline} from '../packages/contracts/src/reviews.ts';
import {parseRobots,robotsAllows} from '../packages/backend/src/lib/crawler-fetch.ts';
import {observedLinks,resolveRedirect,resolveRedirectLinks,retailerPageMatches,retailerProductConflict,retailerProductImage} from '../packages/backend/src/shopping/offers.ts';
import type {Offer,OfferTiming} from '../packages/contracts/src/shopping.ts';

test('only a conflicting offer price is removed from the published title',()=>{
 assert.equal(consistentOfferTitle('Anker S5000 for $2,375 with Code at Anker',250000),'Anker S5000 with Code at Anker');
 assert.equal(consistentOfferTitle('Anker S5000 for $2,375 with Code at Anker',237500),'Anker S5000 for $2,375 with Code at Anker');
 assert.equal(consistentOfferTitle('Save $200 on Anker S5000 at Anker',250000),'Save $200 on Anker S5000 at Anker');
 assert.equal(consistentOfferTitle('LEGO set from $8.92 at Amazon and Target',899),'LEGO set at Amazon and Target');
 assert.equal(headlineOfferPrice('Tool for $12.50 at Walmart'),1250);
});

test('explicit retailer conflicts do not hide a listed alternative',()=>{
 const offer={kind:'product_deal',buyUrl:'https://www.amazon.com/dp/B012345678'} as Offer;
 assert.equal(mismatchedRetailer('Anker S5000 for $2,375 at Anker',offer),true);
 assert.equal(needsLinkRepair('Tool at Walmart',{...offer,buyUrl:'https://slickdeals.net/f/example',merchantId:'walmart'}),true);
 assert.equal(needsLinkRepair('Tool at Amazon',{...offer,merchantId:'walmart'}),true);
 assert.equal(needsLinkRepair('Tool at Amazon',{...offer,merchantId:'amazon',linkIssue:{kind:'product_mismatch',url:offer.buyUrl!,expectedModel:'A1121',observedModel:'A1122',checkedAt:'2026-10-28T00:00:00Z'}}),true);
 assert.deepEqual(headlineRetailers('LEGO set at Amazon and Target').sort(),['amazon','target']);
 assert.equal(mismatchedRetailer('LEGO set at Amazon and Target',offer),false);
 assert.equal(mismatchedRetailer('Anker S5000 power station',offer),false);
 assert.equal(retailerPageMatches('<meta property="og:title" content="Anker SOLIX S5000 portable power station">',{model:'S5000',product:'Anker power station'}),true);
 assert.equal(retailerPageMatches('<meta property="og:title" content="Anker SOLIX S6000 portable power station">',{model:'S5000',product:'Anker power station'}),false);
});

test('a product link is flagged only when source and primary retailer model clearly disagree',()=>{
 const url='https://www.bestbuy.com/site/fixture/12345.p',title='Shark A1121 vacuum at Best Buy',source='Best Buy has the Shark A1121 vacuum.';
 const page=(products:unknown)=>`<link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify(products)}</script>`;
 const wrong={'@type':'Product',name:'Shark A1122 vacuum',mpn:'A1122'};
 assert.equal(retailerProductConflict(page(wrong),url,{model:'A1121'},title,source)?.observedModel,'A1122');
 assert.equal(retailerProductConflict(page(wrong),url,{model:'A1121'},title,'Source does not specify a model'),null);
 assert.equal(retailerProductConflict(page([wrong,wrong]),url,{model:'A1121'},title,source),null);
 assert.equal(retailerProductConflict(page({...wrong,mpn:'A1121B'}),url,{model:'A1121'},title,source),null);
 assert.equal(retailerProductConflict(page({'@type':'Product',name:'Generic vacuum',sku:'A1122'}),url,{model:'A1121'},title,source),null);
});

test('the retailer image is accepted only when its product metadata matches the offer',()=>{
 const url='https://www.amazon.com/dp/B0HJBF29CD',image='https://m.media-amazon.com/images/I/81yJT9EdSNL._AC_SL1500_.jpg';
 const html=`<title>Apple Watch Ultra 4 GPS + Cellular 49mm Smartwatch | Black Titanium Case, Black Titanium Milanese Loop</title><meta property="og:title" content="Amazon"><h1>Apple Watch Ultra 4 GPS + Cellular 49mm</h1><img id="landingImage" data-old-hires="${image}">`;
 assert.equal(retailerProductImage(html,url,{product:'Black Apple Watch Ultra 4 Milanese Loop',model:null}),image);
 assert.equal(retailerProductImage(html,url,{product:'Anker S5000 power station',model:'S5000'}),null);
});

test('coupon correction requires the same model, price and code in the source sentence',()=>{
 const offer={kind:'product_deal',model:'S5000',coupon:'SAVE5'} as Offer;
 const title='Anker S5000 for $2,375 with code at Anker';
 const text='The S5000 power station uses code SAVE5 to drop to $2,375 shipped, compared with $2,500.';
 assert.equal(sourceCouponPrice(title,offer,text)?.priceCents,237500);
 assert.equal(sourceCouponPrice(title,offer,'The S6000 uses code SAVE5 to drop to $2,375.'),null);
 assert.equal(sourceCouponPrice(title,offer,'The S5000 uses code SAVE5 to drop to $2,400.'),null);
 assert.equal(sourceCouponPrice(title,{...offer,coupon:'OTHER'},text),null);
});

test('price-only Amazon shortlinks are collected and resolved through each publisher hop',async()=>{
 const sourceUrl='https://9to5toys.com/2026/11/03/new-black-apple-watch-ultra-4-best-price/';
 const html='<article><ul><li>Black Apple Watch Ultra 4 Milanese Loop <a href="https://link.amazon/B0deLrgGu">$799 (Reg. $899)</a></li><li>Black Apple Watch Ultra 4 Burgundy Trail <a href="https://link.amazon/B0HJB58GXS">$699 (Reg. $799)</a></li></ul></article>';
 const links=observedLinks(html,sourceUrl).links;
 assert.deepEqual(links.map(link=>link.text),['Black Apple Watch Ultra 4 Milanese Loop $799 (Reg. $899)','Black Apple Watch Ultra 4 Burgundy Trail $699 (Reg. $799)']);
 const calls:string[]=[];
 const follow=async(url:string,opts:{method:string;redirect:'manual';timeoutMs:number;maxBytes:number})=>{
  calls.push(`${opts.method} ${new URL(url).hostname}`);
  const id=new URL(url).pathname.slice(1);const locations:Record<string,string>={'link.amazon':`https://amzlinks.in/${id}`,'amzlinks.in':`https://www.amazon.com/dp/${id}?tag=publisher-20&th=1`};
  if(opts.method==='HEAD')return {status:404,headers:{get:()=>null}};
  const location=locations[new URL(url).hostname];return location?{status:302,headers:{get:(name:string)=>name.toLowerCase()==='location'?location:null}}:{status:200,headers:{get:()=>null}};
 };
 const result=await resolveRedirect(links[0]!.url,follow);
 assert.equal(result,'https://www.amazon.com/dp/B0deLrgGu?th=1');
 const expanded={links:[...links],images:[],videos:[]};
 await resolveRedirectLinks(html,sourceUrl,expanded,follow);
 assert.equal(expanded.links[0]!.id,links[0]!.id);assert.equal(expanded.links[0]!.url,'https://www.amazon.com/dp/B0deLrgGu?th=1');
 assert.equal(expanded.links[1]!.url,'https://www.amazon.com/dp/B0HJB58GXS?th=1');
 assert.equal(calls.length,6);assert.equal(calls.filter(x=>x==='GET link.amazon').length,3);assert.equal(calls.filter(x=>x==='GET amzlinks.in').length,3);
});

test('robots crawler rules respect disallow, the most specific allow, and the matching user agent',()=>{
 const policy=parseRobots('User-agent: *\nDisallow: /private\nAllow: /private/public$\nCrawl-delay: 0.5','SavlumeBot');
 assert.equal(robotsAllows('https://publisher.example/deal/123',policy),true);
 assert.equal(robotsAllows('https://publisher.example/private/123',policy),false);
 assert.equal(robotsAllows('https://publisher.example/private/public',policy),true);
 assert.equal(robotsAllows('https://publisher.example/private/public/more',policy),false);
 assert.equal(policy.crawlDelayMs,500);
 const specific=parseRobots('User-agent: *\nDisallow: /\nUser-agent: SavlumeBot\nDisallow: /private','SavlumeBot');
 assert.equal(robotsAllows('https://publisher.example/deal/123',specific),true);
 assert.equal(robotsAllows('https://publisher.example/private/123',specific),false);
});

test('a source sale price needs matching model and retailer, and does not override conditional terms',()=>{
 const offer={kind:'product_deal',model:'A1121',buyUrl:'https://www.bestbuy.com/site/example/12345.p',merchantId:'best-buy',coupon:null,membership:null,subscription:null,renewal:null,minimumSpend:null,cashback:null,giftCard:null,points:null,restrictions:[]} as unknown as Offer;
 const source='Best Buy has the Shark vacuum (A1121) on sale for $199.99. Shipping is free.';
 assert.equal(sourceOfferPrice('Shark A1121 vacuum for $199.99 at Best Buy',offer,source)?.priceCents,19999);
 assert.equal(sourceOfferPrice('Shark A1121 vacuum for $199.99 at Best Buy',{...offer,subscription:'Required'},source),null);
 assert.equal(sourceOfferPrice('Shark A1121 vacuum for $199.99 at Best Buy',offer,'Best Buy has the Shark vacuum (A1122) on sale for $199.99.'),null);
 assert.equal(sourceOfferPrice('Shark A1121 vacuum for $199.99 at Best Buy',offer,'Best Buy has the refurbished Shark vacuum (A1121) on sale for $199.99.'),null);
 assert.equal(sourceOfferPrice('Shark A1121 vacuum for $199.99 at Best Buy',{...offer,variant:'blue'},source),null);
});

test('home excludes ended and stale offers without claiming an older unconfirmed deal is expired',()=>{
 const offer={kind:'product_deal',status:'Unverified'} as Offer;
 assert.equal(homepageEligible({...offer,status:'Expired'},null),false);
 assert.equal(homepageEligible({...offer,status:'Out of Stock'},null),false);
 assert.equal(homepageEligible(offer,{state:'ended'} as OfferTiming),false);
 assert.equal(homepageEligible(offer,{state:'likely-ended'} as OfferTiming),false);
});

test('a broad holiday ad is not turned into a product deal even if extraction picked a product',()=>{
 const offer={kind:'product_deal',product:'SimpliSafe 10-Piece Security System',model:'Outdoor Camera Series 2',buyUrl:'https://www.costco.com/p/item',listedPriceCents:19999,checkoutPriceCents:9999,activityScope:'single_product'} as Offer;
 assert.equal(isSaleAnnouncement('Costco 2026 Black Friday Holiday Savings Ad Details Released',offer),true);
 const article=saleAnnouncementAsNews(offer);assert.equal(article.kind,'shopping_news');assert.equal(article.buyUrl,null);assert.equal(article.checkoutPriceCents,null);
 assert.equal(isSaleAnnouncement('SimpliSafe Security System gets a Black Friday deal at Costco',offer),false);
 assert.equal(isSaleAnnouncement('SimpliSafe Security System in the Black Friday ad preview',offer),false);
});

test('limited offer requires price, product, conditions and deadline in the primary offer, not related content',()=>{
 const offer={kind:'product_deal',product:'Baby Bottle Washer Sterilizer Dryer',activityScope:'single_product',coupon:'Apply code UF7L6GYZ',priceEvidence:'Baby Bottle Washer Sterilizer Dryer $100 $200',listedPriceCents:20000,checkoutPriceCents:10000,deadlineOriginal:'Expires 10/29/2026',expiresAt:null} as Offer;
 const source='Baby Bottle Washer Sterilizer Dryer $100 $200. Apply code UF7L6GYZ. Expires 10/29/2026. Related Offers A different item costs $100.';
 assert.equal(limitedOfferEvidence('Baby Bottle Washer Sterilizer Dryer',offer,source,'2026-10-27T12:00:00Z'),true);
 assert.equal(limitedOfferEvidence('Baby Bottle Washer Sterilizer Dryer',offer,source.replace('Expires 10/29/2026. Related Offers','Related Offers Expires 10/29/2026.'),'2026-10-27T12:00:00Z'),false);
 assert.equal(limitedOfferEvidence('Baby Bottle Washer Sterilizer Dryer',offer,source.replace('UF7L6GYZ','OTHER123'),'2026-10-27T12:00:00Z'),false);
 assert.equal(limitedOfferEvidence('Baby Bottle Washer Sterilizer Dryer',offer,source.replace('Expires 10/29/2026.','Expires 10/29/2026. Deal ends October 30.'),'2026-10-27T12:00:00Z'),false);
 assert.equal(sourceProductOfferEvidence('Baby Bottle Washer Sterilizer Dryer for $100',offer,source),true);
 assert.equal(sourceProductOfferEvidence('Baby Bottle Washer Sterilizer Dryer for $80',offer,source),false);
 assert.equal(sourceProductOfferEvidence('Baby Bottle Washer Sterilizer Dryer',offer,source.replace('Baby Bottle Washer Sterilizer Dryer $100 $200','Unrelated product $100 $200')),false);
});

test('source price without a model still requires the full product, retailer and price in the same source sentence',()=>{
 const offer={kind:'product_deal',product:'DeWalt 4-Port Simultaneous Battery Charger',model:null,buyUrl:'https://www.amazon.com/dp/B0GQJR8RQB',coupon:null,membership:null,subscription:null,renewal:null,minimumSpend:null,cashback:null,giftCard:null,points:null,restrictions:[],condition:null,variant:null} as unknown as Offer;
 const title='DeWalt 4-Port Simultaneous Battery Charger for $119 at Amazon';
 assert.equal(sourceOfferPrice(title,offer,'At Amazon, get the DeWalt 4-Port Simultaneous Battery Charger for $119.')?.priceCents,11900);
 assert.equal(sourceOfferPrice(title,offer,'At Amazon, get the DeWalt 2-Port Battery Charger for $119.'),null);
 assert.equal(sourceOfferPrice(title,offer,'At Walmart, get the DeWalt 4-Port Simultaneous Battery Charger for $119.'),null);
 assert.equal(sourceOfferPrice(title,offer,'At Amazon, get another charger. Related Offers At Amazon, get the DeWalt 4-Port Simultaneous Battery Charger for $119.'),null);
});

test('ordinary-price preorders are news; a source-backed gift card is an incentive, not a cash discount',()=>{
 const offer={kind:'product_deal',product:'OLED iPad mini',model:'A20 Pro',coupon:null,cashback:null,giftCard:null,points:null,listedPriceCents:69900,checkoutPriceCents:69900,priceEvidence:'OLED iPad mini 128GB $699',promotion:null} as Offer;
 const title='OLED iPad mini preorders from $699 at Amazon';
 assert.equal(isNonPromotionalAnnouncement(title,offer),true);
 assert.equal(sourceDealBenefitEvidence(title,offer,'OLED iPad mini 128GB $699. Preorders are open.'),false);
 const bonus={...offer,giftCard:'$50 gift card with preorder',priceEvidence:'OLED iPad mini 128GB $699 + FREE $50 gift card'};
 assert.equal(isNonPromotionalAnnouncement(title,bonus),false);
 assert.equal(sourceDealBenefitEvidence(title,bonus,'OLED iPad mini 128GB $699 + FREE $50 gift card.'),true);
 assert.equal(sourceDealBenefitEvidence(title,bonus,'OLED iPad mini 128GB $699. Related Offers OLED iPad mini 128GB $699 + FREE $50 gift card.'),false);
 assert.equal(isReviewHeadline('xTool X1 Laser Cutter Review: Modular Speed'),true);
 assert.equal(isReviewHeadline('Best Buy offers an iPad for $699'),false);
});

test('coupon totals are recognized without mistaking savings, reference prices or rewards for checkout prices',()=>{
 assert.deepEqual(couponFinalPriceClaims('The tool is $12.50 after applying promo code SAVE5.'),[1250]);
 assert.deepEqual(couponFinalPriceClaims('Use the coupon and pay $12.50.'),[1250]);
 assert.deepEqual(couponFinalPriceClaims('Use code SAVE5 for $12.50.'),[1250]);
 assert.deepEqual(couponFinalPriceClaims('Apply coupon SAVE5 at checkout to pay $12.50.'),[1250]);
 assert.deepEqual(couponFinalPriceClaims('The item is $20 before the coupon; use code SAVE5 to pay $15.'),[1500]);
 assert.deepEqual(couponFinalPriceClaims('The item is $20, but use code SAVE5 for $15.'),[1500]);
 assert.deepEqual(couponFinalPriceClaims('LoomBasics shirts: 2 for $17 + $18 Shipping with Promo Code'),[]);
 assert.deepEqual(couponFinalPriceClaims('The item is $17 with promo code SAVE5, plus $18 shipping.'),[1700]);
 assert.deepEqual(couponFinalPriceClaims('Shipping costs $18 after applying code SAVE5.'),[]);
 assert.deepEqual(couponFinalPriceClaims('After using coupon SAVE5, pay $12.50.'),[1250]);
 assert.deepEqual(couponFinalPriceClaims('Save $5 with code SAVE5, down from $30 when applying the coupon.'),[]);
 assert.deepEqual(couponFinalPriceClaims('Get a $5 gift card with code SAVE5.'),[]);
 assert.deepEqual(couponFinalPriceClaims('On sale for $28.49 - $13.39 when you enter promo code SAVE5 at checkout = $15.10.'),[1510]);
 assert.deepEqual(couponFinalPriceClaims('On sale from $29.99 - 50% off when you apply promo code SAVE5 = $14.99.'),[1499]);
 assert.deepEqual(couponFinalPriceClaims('For $3.33 - 20% when you clip the coupon - 5% via subscription = $2.49.'),[249]);
 assert.deepEqual(couponFinalPriceClaims('For $14.99, reduced from $29.99, when applying coupon code SAVE5.'),[1499]);
 assert.deepEqual(couponFinalPriceClaims('The $65 price is against a $120 list price, with coupon code SAVE5 required.'),[]);
 assert.deepEqual(couponFinalPriceClaims('Only $60 shipped (regularly $120) when you use promo code SAVE5.'),[]);
 assert.deepEqual(couponFinalPriceClaims('$1,180 $1,400 free shipping more With promo code SAVE5, it drops to $1,180.'),[118000]);
 assert.deepEqual(couponFinalPriceClaims('With promo code SAVE5, this $100 PlayStation Store gift card drops to $85.'),[]);
 assert.deepEqual(couponFinalPriceClaims('Starts at $2,500 for $1,100 savings that get better with our code, which combines for a total $1,225 savings.'),[]);
});
test('shipping charges come from explicit source wording and retain stated conditions',()=>{
 assert.equal(sourceShippingFromEvidence('2 for $12 $72 $18 shipping'),'$18 shipping');
 assert.equal(sourceShippingFromEvidence('2 for $12 plus $18 shipping, or free with Prime.'),'$18 shipping, or free with Prime');
 assert.equal(sourceShippingFromEvidence('The item is $12; shipping costs $18.99.'),'shipping costs $18.99');
 assert.equal(sourceShippingFromEvidence('The item is $12 shipping included.'),null);
 assert.equal(sourceShippingFromEvidence('The item is $12 shipping is free.'),null);
 assert.equal(sourceShippingFromEvidence('Save $18 shipping with this coupon.'),null);
 assert.equal(sourceShippingFromEvidence('$18 shipping fee waived for members.'),null);
 assert.equal(sourceShippingFromEvidence('$18 shipping, or $9 shipping with Prime.'),null);
 assert.equal(sourceShippingFromEvidence('Shipping varies by location.'),null);
});
test('coupon price validation separates source conflicts from conflicting generated descriptions',()=>{
 const offer={kind:'coupon_offer',coupon:'SAVE5',checkoutPriceCents:1250,listedPriceCents:1750,aiOverview:null} as unknown as Offer;
 const title='Example tool for $12.50 with code SAVE5';
 const source='The example tool is $12.50 after applying code SAVE5.';
 assert.equal(validateCouponPrice({title,sourceBody:source,offer}).issue,null);
 const conflict=validateCouponPrice({title,sourceBody:'The example tool is $9 after applying code SAVE5.',offer});
 assert.equal(conflict.issue,'coupon-price-conflict');assert.deepEqual(conflict.sourceClaims,[900]);
 const editorial=validateCouponPrice({title,sourceBody:source,summary:'This tool costs $9 after applying the coupon.',offer});
 assert.equal(editorial.issue,null);assert.equal(editorial.editorialConflict,true);
 assert.equal(validateCouponPrice({title,sourceBody:source,offer:{...offer,checkoutPriceCents:null}}).issue,'coupon-price-unconfirmed');
 assert.equal(validateCouponPrice({title,sourceBody:source,offer:{...offer,coupon:null}}).issue,'coupon-price-unconfirmed');
 assert.equal(validateCouponPrice({title,sourceBody:source+' Related Offers: Another product is $9 after code SAVE5.',offer}).issue,null);
 const rounded=validateCouponPrice({title:'Example tool for $13 with code SAVE5',sourceBody:source,offer});assert.equal(rounded.issue,null);assert.equal(rounded.editorialConflict,true);
 const shippingOffer={...offer,kind:'product_deal',checkoutPriceCents:1700,coupon:'CMT17'} as Offer;
 assert.equal(validateCouponPrice({title:'LoomBasics shirts: 2 for $17 + $18 Shipping with Promo Code',sourceBody:'At $17, that is $83 off. Apply coupon code CMT17 for a savings of $83. Shipping adds $18.',offer:shippingOffer}).issue,null);
});
