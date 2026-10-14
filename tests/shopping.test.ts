import {offerPriceText,offerQuestions} from '@aihot/contracts/shopping-facts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isProductActivity, sourceDealPick, supportedPromotion, reportedDeadlineDay, flashDealEvidence, cents, checkoutTotal, effectiveStatus, offerIdentity, safeCopy, offerTiming, offerSavings, flashSavings, plainTitle, type Offer } from '@aihot/contracts/shopping';
import { isReviewContent, type ReviewSummary } from '@aihot/contracts/reviews';
import { localHour, beijingDate } from '@aihot/contracts/time';
import { merchantFor, guideFor, redirectorFor } from '@aihot/industry/shopping';
import { observedLinks, officialProductEvidence, resolveRedirect, resolveRedirectLinks } from '@aihot/backend/shopping/offers';
import { cleanMerchantLink } from '@aihot/contracts/shopping';
import { config } from '@aihot/backend/config';
import http from 'node:http';
const offer={kind:'product_deal',product:'Example vacuum',model:'V100',variant:'1 pack',condition:'new',merchantId:'walmart',seller:'Example Store',coupon:null,restrictions:[],membership:null,subscription:null,checkoutPriceCents:10000,expiresAt:null,cashback:null,giftCard:null,points:null} as unknown as Offer;
test('money uses cents, never subtracts rewards, and keeps unknown shipping unknown',()=>{
 assert.equal(cents('$1,234.56'),123456);assert.equal(cents('0.10'),10);assert.equal(cents('1.001'),null);assert.equal(cents('NaN'),null);assert.equal(cents('-2'),null);
 assert.equal(checkoutTotal(10000,1000,500),9500);assert.equal(checkoutTotal(10000,0,null),null);assert.equal(checkoutTotal(10000,11000,0),null);
});
test('expiry and verification freshness are independent of a failed check',()=>{
 const now=Date.parse('2026-10-11T12:00:00Z');assert.equal(effectiveStatus({status:'Active',expiresAt:'2026-10-11T11:59:59Z',verifiedAt:'2026-10-11T11:00:00Z'},now),'Expired');
 assert.equal(effectiveStatus({status:'Active',expiresAt:null,verifiedAt:'2026-10-11T06:00:00Z'},now),'Unverified');assert.equal(effectiveStatus({status:'Out of Stock',expiresAt:null,verifiedAt:null},now),'Out of Stock');
 assert.equal(effectiveStatus({status:'Unverified',expiresAt:null,verifiedAt:'2026-10-11T11:00:00Z'},now),'Unverified');
});
test('identical complete offer identities merge, but seller, variant, condition or eligibility changes do not',()=>{
 assert.equal(offerIdentity(offer),offerIdentity({...offer}));
 for(const change of [{variant:'2 pack'},{model:'V101'},{condition:'refurbished'},{seller:'Marketplace Seller'},{restrictions:['Targeted']},{merchantId:'target'},{coupon:'SAVE10'},{checkoutPriceCents:9000}])assert.notEqual(offerIdentity(offer),offerIdentity({...offer,...change}));
 assert.equal(offerIdentity({...offer,variant:null}),null);
});
test('Eastern briefing follows daylight saving rather than adding fixed hours',()=>{
 assert.equal(localHour('2026-03-08',8).toISOString(),'2026-03-08T12:00:00.000Z');assert.equal(localHour('2026-11-01',8).toISOString(),'2026-11-01T13:00:00.000Z');assert.equal(beijingDate('2026-01-01T03:00:00Z'),'2025-12-31');
});
test('merchant destinations must occur in source HTML; nested affiliate destinations resolve without inventing URLs',()=>{
 const dest='https://www.walmart.com/ip/example/123';const html=`<article><a href="https://track.example/?q=${encodeURIComponent('https://redirect.example/?ued='+encodeURIComponent(dest))}">Buy model V100</a></article>`;
 assert.equal(observedLinks(html,'https://publisher.example/deal').links[0]?.url,dest);assert.equal(merchantFor('https://walmart.com.evil.example/product'),null);assert.equal(merchantFor('javascript:alert(1)'),null);
 const tracker=`<article><a href="https://goto.walmart.com/c/116548/565706/9383?veh=aff&u=${encodeURIComponent(dest+'?clickid=abc')}">Shop</a></article>`;
 assert.equal(observedLinks(tracker,'https://publisher.example/deal').links[0]?.url,dest,'a tracker on a merchant subdomain yields the product page it carries');
});
test('publisher redirectors are followed only until a merchant appears, and the merchant page is never requested in that step',async()=>{
 assert.equal(redirectorFor('https://amzn.to/4s40LcX')?.valueOf(),'amzn.to');assert.equal(redirectorFor('https://amzn.to.evil.example/x'),null);assert.equal(redirectorFor('http://amzn.to/x'),null);
 assert.equal(merchantFor('https://podcasts.apple.com/us/podcast/x/id1'),null);assert.equal(merchantFor('https://www.apple.com/shop/buy-mac/mac-studio')?.id,'apple');
 const requested:string[]=[];
 const hops:Record<string,{status:number;location?:string}>={
  'https://amzn.to/product':{status:301,location:'https://www.amazon.com/dp/B0EXAMPLE?th=1&linkCode=sl2&tag=pub-20&linkId=abc&ref_=as_li_ss_tl'},
  'https://on.ltk.com/+wrapped':{status:302,location:'https://track.example/go?u='+encodeURIComponent('https://www.walmart.com/ip/example/123?clickid=x&afsrc=1')},
  'https://howl.link/dead':{status:302,location:'https://publisher.example/landing'},'https://publisher.example/landing':{status:200},
  'https://go.magik.ly/getonly':{status:405},'https://howl.link/loop':{status:302,location:'https://howl.link/loop'},
 };
 const fetch=async(url:string,opts:{method:string})=>{requested.push(opts.method+' '+url);const hop=hops[url]??{status:404};const status=hop.status===405&&opts.method==='GET'?302:hop.status;const location=hop.status===405&&opts.method==='GET'?'https://www.target.com/p/example/-/A-1':hop.location;return {status,headers:{get:(name:string)=>name==='location'?location??null:null}};};
 assert.equal(await resolveRedirect('https://amzn.to/product',fetch),'https://www.amazon.com/dp/B0EXAMPLE?th=1');
 assert.equal(await resolveRedirect('https://on.ltk.com/+wrapped',fetch),'https://www.walmart.com/ip/example/123');
 assert.equal(await resolveRedirect('https://howl.link/dead',fetch),null);
 assert.equal(await resolveRedirect('https://go.magik.ly/getonly',fetch),'https://www.target.com/p/example/-/A-1');
 assert.equal(await resolveRedirect('https://howl.link/loop',fetch),null);
 assert.ok(!requested.some(r=>/amazon\.com|walmart\.com|target\.com|track\.example/.test(r)),'merchant and wrapper hosts were requested: '+requested.join(', '));
 const html='<article><a href="https://amzn.to/product">brand new Mac Studio at $200 off</a><a href="https://amzn.to/product">same link again</a><a href="https://howl.link/dead">newsletter</a><a href="https://www.walmart.com/ip/direct/1">Walmart</a></article>';
 const evidence=await resolveRedirectLinks(html,'https://publisher.example/deal',observedLinks(html,'https://publisher.example/deal'),fetch);
 assert.deepEqual(evidence.links.map(x=>[x.id,x.url,x.text]),[['L1','https://www.walmart.com/ip/direct/1','Walmart'],['L2','https://www.amazon.com/dp/B0EXAMPLE?th=1','brand new Mac Studio at $200 off']]);
 assert.equal(cleanMerchantLink('https://www.walmart.com/ip/x/1?clickid=a&afsrc=1&sourceid=imp_b&veh=aff&wmlspartner=imp_1&affiliates_ad_id=5&campaign_id=9&sharedid=&subId1=t&cm_mmc=aff&gaOptInStatus=true&th=1'),'https://www.walmart.com/ip/x/1?th=1');
});
test('the guarded fetch hands back a redirect unopened when asked, so each hop still passes the network guard',async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/go'){res.writeHead(302,{location:'https://www.walmart.com/ip/example/123?tag=pub'});res.end();return;}if(req.url==='/two'){res.writeHead(302,{location:'/go'});res.end();return;}res.writeHead(200,{'content-type':'text/html'});res.end('<p>landing</p>');});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',()=>r()));const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 const previous=config.allowPrivateNetworkFetch;config.allowPrivateNetworkFetch=true;
 try{
  assert.equal(await resolveRedirect(base+'/two'),'https://www.walmart.com/ip/example/123');
  assert.equal(await resolveRedirect(base+'/page'),null);
 }finally{config.allowPrivateNetworkFetch=previous;await new Promise<void>(r=>server.close(()=>r()));}
});
test('HTTP success or an unmatched offer cannot become verified; complex membership terms prevent automatic verification',()=>{
 const html=`<script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Example V100 vacuum 1 pack',sku:'V100',offers:{'@type':'Offer',price:'100.00',priceCurrency:'USD',availability:'https://schema.org/InStock',seller:{name:'Example Store'},itemCondition:'https://schema.org/NewCondition',eligibleRegion:'US'}})}</script>`;
 assert.equal(officialProductEvidence('<h1>Sale!</h1>',offer),null);assert.equal(officialProductEvidence(html,{...offer,model:'V200'}),null);assert.equal(officialProductEvidence(html,{...offer,seller:'Other Seller'}),null);assert.equal(officialProductEvidence(html,{...offer,restrictions:['New Customers']}),null);assert.equal(officialProductEvidence(html,{...offer,membership:'Paid member'}),null);assert.equal(officialProductEvidence(html,{...offer,subscription:'Subscribe and save'}),null);assert.equal(officialProductEvidence(html,offer)?.price,10000);
 assert.equal(officialProductEvidence(html,{...offer,checkoutPriceCents:12000}),null);
 assert.equal(officialProductEvidence(html,{...offer,checkoutPriceCents:12000},true)?.price,10000);
 assert.equal(officialProductEvidence(html,{...offer,variant:'2 pack'},true),null);
});
test('unsupported price-history and hype claims are removed',()=>{assert.ok(!/all-time|90-day low|insane deal/i.test(safeCopy('An all-time low and a 90-day low. Insane deal.')));});

test('flash evidence never treats a single quote, MSRP, rewards, expired offers or higher prices as a recorded low',()=>{
 const now=Date.parse('2026-10-11T12:00:00Z');
 const d={...offer,buyUrl:'https://example.com/product',currency:'USD',status:'Unverified',checkoutPriceCents:8000,listedPriceCents:20000,expiresAt:'2026-10-11T14:00:00Z'} as Offer;
 const h=[10000,8000].map((price,i)=>({at:new Date(now-(2-i)*3600000).toISOString(),checkoutPriceCents:price,listedPriceCents:20000,currency:'USD',basis:'source-reported' as const,sourceUrl:'https://example.com/product'}));
 assert.equal(flashDealEvidence(d,h,now)?.previousPriceCents,10000);
 assert.equal(flashDealEvidence(d,h.slice(1),now),null);
 assert.equal(flashDealEvidence({...d,expiresAt:null},h,now),null);
 assert.equal(flashDealEvidence({...d,expiresAt:'2026-10-11T11:00:00Z'},h,now),null);
 assert.equal(flashDealEvidence({...d,status:'Out of Stock'},h,now),null);
 assert.equal(flashDealEvidence({...d,checkoutPriceCents:11000,cashback:'$50 later'},h,now),null);
 assert.equal(flashDealEvidence(d,[{...h[0]!,checkoutPriceCents:7000},h[1]!],now),null);
 assert.equal(flashDealEvidence(d,h.map(x=>({...x,checkoutPriceCents:null})),now),null);
 assert.equal(flashDealEvidence(d,h.map(x=>({...x,at:new Date(now+3600000).toISOString()})),now),null);
});

test('guide picks do not need price history, while popularity and platform-sale labels require source evidence',()=>{
 const now=Date.parse('2026-10-11T16:00:00Z');const published='2026-10-11T12:00:00Z';
 const d={...offer,product:'Example vacuum',buyUrl:'https://www.walmart.com/ip/example/123',listedPriceCents:11000,currency:'USD',status:'Unverified',deadlineOriginal:null} as Offer;
 assert.equal(sourceDealPick(d,'https://www.dealnews.com/example',published,now)?.kind,'editorial');
 assert.equal(sourceDealPick(d,'https://www.walmart.com/ip/example/123',published,now),null);
 const raw={kind:'popular' as const,quote:'This bestselling vacuum is available today'};
 assert.equal(supportedPromotion(raw,'Nothing about popularity here'),null);
 const promotion=supportedPromotion(raw,raw.quote+' for $100.');assert.ok(promotion);
 assert.equal(sourceDealPick({...d,promotion},'https://www.walmart.com/ip/example/123',published,now)?.kind,'popular');
 assert.equal(sourceDealPick({...d,status:'Expired'},'https://dealnews.com/example',published,now),null);
 assert.equal(sourceDealPick({...d,checkoutPriceCents:null,listedPriceCents:null},'https://dealnews.com/example',published,now),null);
 assert.equal(sourceDealPick(d,'https://dealnews.com/example','2026-09-01T12:00:00Z',now),null);
 assert.equal(sourceDealPick(d,'https://dealnews.com.evil.example/example',published,now),null);
 assert.equal(guideFor('https://hip2save.com.evil.example/'),null);
 assert.equal(sourceDealPick({...d,deadlineOriginal:'This deal ends October 9.'},'https://dealnews.com/example',published,now),null);
 assert.equal(reportedDeadlineDay('Offer ends October 15, 2026.',published),'2026-10-15');
 assert.equal(reportedDeadlineDay('Expires 12/10/2026',published),'2026-12-10');
 assert.equal(reportedDeadlineDay('Expires February 30, 2026',published),null);
 assert.equal(reportedDeadlineDay('Today only',published),'2026-10-11');
});

test('readable buying answers distinguish reference prices, checkout and later rewards',()=>{
 const d={...offer,status:'Unverified',listedPriceCents:20000,checkoutPriceCents:null,cashback:'$30 later',giftCard:null,points:null,deadlineOriginal:null} as Offer;
 assert.match(offerPriceText(d),/listed price/);assert.match(offerPriceText(d),/checkout total was not given/);
 assert.match(offerPriceText({...d,checkoutPriceCents:9000}),/\$90\.00 at checkout before tax, as stated by the source \(regular price \$200\.00\)/);
 assert.ok(offerQuestions(d).some(x=>x.answer.includes('separate from the checkout price')));
 assert.ok(offerQuestions({...d,status:'Expired'}).some(x=>x.answer.includes('expired')));
 assert.deepEqual(offerQuestions({...d,kind:'shopping_news'}),[]);
});

test('all named single-product activities qualify without a price, buy URL, preferred source or recent-history gate',()=>{
 const now=Date.parse('2026-10-11T16:00:00Z');const published='2026-09-01T12:00:00Z';
 const d={...offer,status:'Unverified',product:'Acme vacuum V100',buyUrl:null,listedPriceCents:null,checkoutPriceCents:null,expiresAt:null,deadlineOriginal:null} as Offer;
 for(const kind of ['product_deal','coupon_offer','cashback_offer','freebie'] as const)assert.equal(isProductActivity({...d,kind},published,'Acme offer',now),true);
 assert.equal(isProductActivity({...d,status:'Upcoming'},published,'Acme offer',now),true);
 for(const kind of ['shopping_news','buying_guide','recall'] as const)assert.equal(isProductActivity({...d,kind},published,'Acme offer',now),false);
 assert.equal(isProductActivity({...d,product:null},published,'Acme offer',now),false);
 for(const status of ['Expired','Out of Stock'] as const)assert.equal(isProductActivity({...d,status},published,'Acme offer',now),false);
 assert.equal(isProductActivity({...d,deadlineOriginal:'Offer ends October 10, 2026'},published,'Acme offer',now),false);
 for(const activityScope of ['multi_product','storewide','event','financial'] as const)assert.equal(isProductActivity({...d,activityScope},published,'Acme offer',now),false);
 assert.equal(isProductActivity({...d,product:'Nike Fall Sale',kind:'coupon_offer'},published,'Up to 40% off select styles',now),false);
 assert.equal(isProductActivity({...d,kind:'cashback_offer',product:'Selected Dove products'},published,'Cashback on select Dove products',now),false);
 assert.equal(isProductActivity({...d,product:'12-pack razor',activityScope:'single_product'},published,'12-pack razor coupon',now),true);
});

test('timing labels come only from stated deadlines or age, and savings only from two stated prices',()=>{
 const now=Date.parse('2026-10-14T15:00:00Z');
 const base={kind:'product_deal',status:'Unverified',expiresAt:null,deadlineOriginal:null,verifiedAt:null} as Offer;
 assert.equal(offerTiming(base,'2026-10-14T10:00:00Z',now)?.state,'current');
 assert.equal(offerTiming(base,'2026-10-10T10:00:00Z',now)?.state,'likely-ended');
 assert.equal(offerTiming({...base,kind:'coupon_offer'},'2026-10-10T10:00:00Z',now)?.state,'current');
 assert.deepEqual(offerTiming({...base,deadlineOriginal:'This deal ends October 19.'},'2026-10-13T10:00:00Z',now),{postedAt:'2026-10-13T10:00:00Z',endsAt:null,endsDay:'2026-10-19',state:'current'});
 assert.equal(offerTiming({...base,deadlineOriginal:'Today only'},'2026-10-14T10:00:00Z',now)?.state,'ending');
 assert.equal(offerTiming({...base,deadlineOriginal:'Offer ends October 11, 2026'},'2026-10-10T10:00:00Z',now)?.state,'ended');
 assert.equal(offerTiming({...base,expiresAt:'2026-10-15T03:00:00-04:00'},'2026-10-14T10:00:00Z',now)?.state,'ending');
 assert.equal(offerTiming({...base,expiresAt:'2026-10-14T03:00:00-04:00'},'2026-10-14T10:00:00Z',now)?.state,'ended');
 assert.equal(offerTiming({...base,status:'Out of Stock'},'2026-10-14T10:00:00Z',now)?.state,'ended');
 assert.equal(offerTiming({...base,kind:'shopping_news'},'2026-10-14T10:00:00Z',now),null);
 assert.deepEqual(offerSavings({listedPriceCents:2499,checkoutPriceCents:1349}),{wasCents:2499,nowCents:1349,percent:46});
 assert.equal(offerSavings({listedPriceCents:2499,checkoutPriceCents:2450}),null);
 assert.equal(offerSavings({listedPriceCents:null,checkoutPriceCents:1000}),null);
 assert.equal(offerSavings({listedPriceCents:1000,checkoutPriceCents:1200}),null);
 assert.equal(flashSavings({listedPriceCents:10000,checkoutPriceCents:8500,promotion:null}),null);
 assert.equal(flashSavings({listedPriceCents:10000,checkoutPriceCents:8000,promotion:null})?.percent,20);
 assert.equal(flashSavings({listedPriceCents:10000,checkoutPriceCents:8900,promotion:{kind:'platform_sale',quote:'Lightning deal'}})?.percent,11);
});
test('headlines read as a shopper would say them, and announcements are not shelved as reviews',()=>{
 assert.equal(plainTitle('Lisen Tablet Holder Reported at $17 at Amazon (Price Unspecified)'),'Lisen Tablet Holder at $17 at Amazon');
 assert.equal(plainTitle("Select Women's Jeans Starting at a Reported $8.45 at Walmart"),"Select Women's Jeans Starting at $8.45 at Walmart");
 assert.equal(plainTitle('Anker 35W Charger Reported $23.99 on Amazon'),'Anker 35W Charger at $23.99 on Amazon');
 assert.equal(plainTitle("Men's Shirts: Reported 2 for $12 at Walmart"),"Men's Shirts: 2 for $12 at Walmart");
 assert.equal(plainTitle("Tom's Guide Reports New Apple TV 4K at $299"),"Tom's Guide Reports New Apple TV 4K at $299");
 const review:ReviewSummary={format:'media_review',author:null,verdict:'v',bestFor:null,strengths:[],limitations:[],testingNote:null,questions:[],videoUrl:null,basis:'source_text'};
 assert.ok(!isReviewContent({kind:'buying_guide',review},"Tom's Guide Reports New Apple TV 4K at $299 Alongside $149 HomePod Mini 2"));
 assert.ok(!isReviewContent({kind:'buying_guide',review},"Tom's Guide Highlights DroidDeck App for Running Steam PC Games on Android"));
 assert.ok(!isReviewContent({kind:'buying_guide',review},'Apple HomeView Smart Display Reportedly Priced at $299 Ahead of Official Launch'));
 assert.ok(isReviewContent({kind:'buying_guide',review},'Garmin MARQ Gen3 Luxury Smartwatch Series In-Depth Review Summary'));
 assert.ok(isReviewContent({kind:'buying_guide',review},'Framework Laptop 12 after two weeks'));
});
