import {tag} from './setup.ts';
import {SHOPPING} from '@aihot/industry/shopping';
Object.defineProperty(SHOPPING,'enabled',{value:true,configurable:true});
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {sql,closeDb} from '@aihot/backend/db';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {shoppingItems,shoppingPriceHistory} from '@aihot/backend/publication/shopping';
import {maintainShoppingIntegrity,verifyShopping} from '@aihot/backend/shopping/offers';
import type {guardedFetch} from '@aihot/backend/lib/http-fetch';
import {stopBoss} from '@aihot/backend/jobs/queue';

const source='integrity-'+tag();
await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${source},'Synthetic integrity source','external','T2','editorial')`;
const sourceUrl=`https://example.invalid/${source}`;
const title='Anker S5000 for $2,375 with Code at Anker';
const text='The Anker S5000 power station uses code SAVE5 to drop to $2,375 shipped, compared with $2,500.';
const {articleId}=await upsertMaterial({sourceId:source,url:sourceUrl,title,bodyText:text,bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${articleId},1,'rule','pass','electronics',${title},'Synthetic fixture for source and product matching.',80,true)`;
await publishArticle(articleId);
const data={kind:'product_deal',product:'Anker S5000 power station',model:'S5000',variant:null,condition:null,merchant:'Amazon',merchantId:'amazon',seller:'Anker',fulfillment:'Shipping',buyUrl:'https://www.amazon.com/dp/B012345678',imageUrl:null,imageSource:null,listedPriceCents:250000,checkoutPriceCents:null,currency:'USD',priceEvidence:null,comparison:null,shipping:'Free shipping',cashback:null,giftCard:null,points:null,coupon:'SAVE5',steps:[],restrictions:[],membership:null,subscription:null,renewal:null,cancellation:null,region:'US',expiresAt:null,deadlineOriginal:null,warranty:null,returns:null,status:'Unverified',verifiedAt:null,lastCheckedAt:null,verificationNote:'Synthetic fixture',identity:null};
await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${articleId},1,${sql.json(data)})`;
after(async()=>{await stopBoss();await closeDb();});

test('source link and coupon evidence repair the item while retaining the original history',async()=>{
 const before=(await shoppingItems({id:articleId})).items[0]!;assert.equal(before.offer.buyUrl,null);assert.equal(before.priceDisplay.amountCents,null);assert.equal(before.priceDisplay.label,'Price needs review');
 const [historyBefore]=await sql`SELECT count(*)::int AS count FROM shopping_price_observations WHERE article_id=${articleId}`;
 const target='https://www.ankersolix.com/products/s5000-portable-power-station';
 const calls:string[]=[];const mock:typeof guardedFetch=async url=>{calls.push(url);const text=url===sourceUrl?`<a href="${target}">S5000 offer</a>`:'<meta property="og:title" content="Anker SOLIX S5000 Portable Power Station">';return {status:200,url,headers:new Headers(),body:Buffer.from(text),text:()=>text};};
 const result=await maintainShoppingIntegrity(5,articleId,mock);assert.equal(result.linkRepaired,1);assert.equal(result.sourcePricesCorrected,1);assert.deepEqual(calls,[sourceUrl,target]);
 const item=(await shoppingItems({id:articleId})).items[0]!;assert.equal(item.offer.merchantId,'anker-solix');assert.equal(item.offer.checkoutPriceCents,237500);assert.equal(item.priceDisplay.verification,'source-reported');assert.match(item.offer.buyUrl!,/ankersolix\.com/);
 const checks=await sql`SELECT status,url FROM shopping_checks WHERE article_id=${articleId} ORDER BY id`;assert.deepEqual(checks.map(x=>x.status),['LinkRepaired','SourcePriceCorrected']);assert.match(checks[0]!.url,/amazon\.com/);
 const [historyAfter]=await sql`SELECT count(*)::int AS count FROM shopping_price_observations WHERE article_id=${articleId}`;assert.ok(Number(historyAfter.count)>=Number(historyBefore.count));
});

test('a source conflict between the card amount and code price hides both the price and its trend',async()=>{
 const headline='Example tool for $12.50 with code SAVE5';
 const body='The example tool is $9 after applying code SAVE5.';
 const {articleId:id}=await upsertMaterial({sourceId:source,url:sourceUrl+'-coupon-conflict',title:headline,bodyText:body,bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
 await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','electronics',${headline},'A synthetic coupon price conflict.',80,true)`;
 await publishArticle(id);
 await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json({...data,kind:'product_deal',product:'Example tool',model:'TOOL5',listedPriceCents:1500,checkoutPriceCents:1250,coupon:'SAVE5',priceEvidence:body})})`;
 const item=(await shoppingItems({id})).items[0]!;
 assert.equal(item.priceDisplay.amountCents,null);
 assert.equal(item.priceDisplay.label,'Price needs review');
 assert.equal(item.offer.checkoutPriceCents,null);
 assert.equal(item.offer.priceIssue,'coupon-price-conflict');
 assert.deepEqual(await shoppingPriceHistory(item),[]);
});

test('a separate shipping charge in the title is not treated as the coupon price',async()=>{
 const headline='Example shirts: 2 for $17 + $18 Shipping with Promo Code';
 const body='Example shirts 2 for $17 $100 $18 shipping. Apply coupon code CMT17 for a savings of $83. Shipping adds $18.';
 const {articleId:id}=await upsertMaterial({sourceId:source,url:sourceUrl+'-shipping',title:headline,bodyText:body,bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
 await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','fashion',${headline},'A synthetic source-reported offer.',80,true)`;
 await publishArticle(id);
 await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json({...data,product:'Example shirts',model:'SHIRT1',coupon:'CMT17',listedPriceCents:10000,checkoutPriceCents:1700,shipping:'$18 shipping',priceEvidence:'2 for $17 $100 $18 shipping'})})`;
 const item=(await shoppingItems({id})).items[0]!;
 assert.equal(item.priceDisplay.amountCents,1700);assert.equal(item.offer.priceIssue,null);assert.equal(item.offer.shipping,'$18 shipping');
});

test('a retailer showing a different primary model pauses the link without deleting the page',async()=>{
 const mock:typeof guardedFetch=async url=>{const html=`<link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify({'@type':'Product',name:'Anker SOLIX S6000',mpn:'S6000'})}</script>`;return {status:200,url,headers:new Headers(),body:Buffer.from(html),text:()=>html};};
 await verifyShopping(articleId,mock);
 const [row]=await sql`SELECT data FROM shopping_offers WHERE article_id=${articleId}`;
 assert.equal(row.data.linkIssue?.kind,'product_mismatch');assert.match(row.data.buyUrl,/ankersolix\.com/);
 const item=(await shoppingItems({id:articleId})).items[0]!;assert.equal(item.offer.buyUrl,null);
 const checks=await sql`SELECT status FROM shopping_checks WHERE article_id=${articleId} ORDER BY id DESC LIMIT 1`;assert.equal(checks[0]?.status,'ProductMismatch');
});

test('a confirmed ended offer leaves the home feed but the existing page remains available',async()=>{
 await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{status}','"Expired"') WHERE article_id=${articleId}`;
 assert.equal((await shoppingItems({view:'recommended',q:'Anker S5000'})).items.some(x=>x.id===articleId),false);
 assert.equal((await shoppingItems({id:articleId})).items[0]?.offer.status,'Expired');
});

test('a multi-product ad stays a news article and does not expose an extracted product price',async()=>{
 const headline='Costco 2026 Black Friday Holiday Savings Ad Details Released';
 const {articleId:id}=await upsertMaterial({sourceId:source,url:sourceUrl+'-roundup',title:headline,bodyText:'The holiday savings ad describes multiple products on different dates.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
 await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','electronics',${headline},'A source-reported holiday ad.',80,true)`;
 await publishArticle(id);
 await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json({...data,product:'SimpliSafe 10-Piece Security System',model:'Outdoor Camera Series 2',activityScope:'single_product',listedPriceCents:19999,checkoutPriceCents:9999})})`;
 const item=(await shoppingItems({id})).items[0]!;assert.equal(item.offer.kind,'shopping_news');assert.equal(item.offer.buyUrl,null);assert.equal(item.priceDisplay.amountCents,null);
 assert.equal((await shoppingItems({view:'deals',q:headline})).items.some(x=>x.id===id),false);
 assert.equal((await shoppingItems({view:'news',q:headline})).items.some(x=>x.id===id),true);
});
test('mislabeled reviews and ordinary-price preorders are routed to guides and news',async()=>{
 for(const [title,expected,view] of [['Laser Cutter Review: What We Learned','buying_guide','reviews'],['Tablet Preorders from $699 at Amazon','shopping_news','news']] as const){
  const headline=title+' '+source;
  const {articleId:id}=await upsertMaterial({sourceId:source,url:sourceUrl+'-'+view,title:headline,bodyText:'A synthetic editorial fixture.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','electronics',${headline},'Synthetic editorial fixture.',80,true)`;
  await publishArticle(id);
  await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json({...data,product:'Example tablet',model:null,coupon:null,listedPriceCents:69900,checkoutPriceCents:69900})})`;
  const item=(await shoppingItems({id})).items[0]!;assert.equal(item.offer.kind,expected);assert.equal(item.priceDisplay.amountCents,null);
  assert.equal((await shoppingItems({view:'deals',q:headline})).items.some(x=>x.id===id),false);
  assert.equal((await shoppingItems({view,q:headline})).items.some(x=>x.id===id),true);
 }
});
