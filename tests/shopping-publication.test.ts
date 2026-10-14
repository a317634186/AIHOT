import {tag} from './setup.ts';
import {SHOPPING} from '@aihot/industry/shopping';
Object.defineProperty(SHOPPING,'enabled',{value:true,configurable:true});
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {sql,closeDb} from '@aihot/backend/db';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {shoppingItems,shoppingPriceHistory} from '@aihot/backend/publication/shopping';
import {buildApp} from '../apps/api/src/app.ts';
import {stopBoss} from '@aihot/backend/jobs/queue';
const source='shopping-contract-'+tag();
await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${source},'Demo fixture — not a live deal','external','T2','editorial')`;
const {articleId}=await upsertMaterial({sourceId:source,url:'https://example.com/demo-'+source,title:'DEMO vacuum fixture',bodyText:'Synthetic fixture only. This is not a real offer.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${articleId},1,'rule','pass','home','DEMO vacuum fixture','Synthetic fixture only. This is not a real offer.',90,true)`;
await publishArticle(articleId);
const offer={kind:'product_deal',product:'DEMO vacuum',model:'DEMO-1',variant:'1 pack',condition:'new',merchant:'Target',merchantId:'target',seller:'Target',fulfillment:'Target',buyUrl:'https://www.target.com/p/demo',imageUrl:null,imageSource:null,listedPriceCents:10000,checkoutPriceCents:9000,currency:'USD',priceEvidence:'DEMO $90',comparison:null,shipping:null,cashback:'DEMO $10 after purchase',giftCard:'DEMO $5 later',points:null,coupon:null,steps:[],restrictions:[],membership:null,subscription:null,renewal:null,cancellation:null,region:'US',expiresAt:null,deadlineOriginal:null,warranty:null,returns:null,status:'Active',verifiedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),verificationNote:'Synthetic test evidence',identity:null};
await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${articleId},1,${sql.json(offer)})`;
const app=await buildApp();
test('unified feeds include news and unverified unselected offers, with newest-first ordering regardless of score',async()=>{
 const ids:string[]=[];
 try{
  for(const [kind,score,age] of [['product_deal',20,0],['shopping_news',90,3600000]] as const){
   const {articleId:id}=await upsertMaterial({sourceId:source,url:'https://example.com/unified-'+kind+'-'+source,title:'DEMO unified feed '+kind,bodyText:'Synthetic feed fixture only.',bodyStatus:'ok',via:'fetch',publishedAt:new Date(Date.now()-age),discoveredAt:new Date(Date.now()-age)});
   ids.push(id);
   await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','home',${'DEMO unified feed '+kind},'Synthetic feed fixture only.',${score},false)`;
   await publishArticle(id);
   await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json({...offer,kind,status:'Unverified',listedPriceCents:null,checkoutPriceCents:null,verifiedAt:null})})`;
  }
  const query={q:'DEMO unified feed',category:'home',merchant:'target'};
  assert.deepEqual((await shoppingItems({...query,view:'new'})).items.map(x=>x.id),ids);
  assert.deepEqual((await shoppingItems({...query,view:'recommended'})).items.map(x=>x.id),ids);
  const page=await shoppingItems({...query,view:'recommended',limit:1});
  assert.equal(page.total,2);assert.equal(page.hasMore,true);
  assert.equal((await shoppingItems({...query,view:'recommended',limit:1,offset:1})).items[0]!.id,ids[1]);
  assert.equal((await shoppingItems({...query,view:'top'})).total,0);
  assert.equal((await shoppingItems({...query,view:'new',merchant:'walmart'})).total,0);
  await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{status}','"Expired"') WHERE article_id=${ids[0]!}`;
  for(const view of ['new','recommended'])assert.deepEqual((await shoppingItems({...query,view})).items.map(x=>x.id),ids);
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${ids[1]!}`;
  for(const view of ['new','recommended'])assert.deepEqual((await shoppingItems({...query,view})).items.map(x=>x.id),[ids[0]]);
 }finally{await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=ANY(${ids}::text[])`;}
});
after(async()=>{await app.close();await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${articleId}`;await stopBoss();await closeDb();});
test('flash historical badge still requires recorded reductions; unverified single products remain in the feed',async()=>{
 const ids:string[]=[];
 try{
  for(const age of [0,3600000]){
   const {articleId:id}=await upsertMaterial({sourceId:source,url:'https://example.com/flash-'+age+'-'+source,title:'DEMO flash fixture '+age,bodyText:'Synthetic fixture only.',bodyStatus:'ok',via:'fetch',publishedAt:new Date(Date.now()-age),discoveredAt:new Date(Date.now()-age)});
   ids.push(id);
   await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','home','DEMO flash fixture','Synthetic fixture only.',50,false)`;
   await publishArticle(id);
   const d={...offer,status:'Unverified',cashback:null,giftCard:null,checkoutPriceCents:10000,expiresAt:new Date(Date.now()+3600000).toISOString()};
   await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json(d)})`;
   const first=(await shoppingItems({view:'flash',q:'DEMO flash fixture'})).items.find(x=>x.id===id);assert.ok(first?.productActivity);assert.equal(first?.flashDeal,undefined);
   await sql`UPDATE shopping_price_observations SET observed_at=now()-interval '2 hours' WHERE article_id=${id}`;
   await sql`UPDATE shopping_offers SET data=${sql.json({...d,checkoutPriceCents:8000})} WHERE article_id=${id}`;
  }
  const query={view:'flash',q:'DEMO flash fixture'};
  const found=await shoppingItems(query);assert.deepEqual(found.items.map(x=>x.id),ids);assert.equal(found.items[0]!.flashDeal!.previousPriceCents,10000);
  assert.equal((await shoppingItems({...query,limit:1})).hasMore,true);assert.equal((await shoppingItems({...query,limit:1,offset:1})).items[0]!.id,ids[1]);
  assert.equal((await shoppingItems({...query,merchant:'walmart'})).total,0);
  await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{variant}','"different variant"') WHERE article_id=${ids[0]!}`;
  const variants=await shoppingItems(query);assert.deepEqual(variants.items.map(x=>x.id),ids);assert.equal(variants.items[0]!.flashDeal,undefined);
  await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{expiresAt}',to_jsonb(${new Date(Date.now()-1000).toISOString()}::text)) WHERE article_id=${ids[1]!}`;
  assert.deepEqual((await shoppingItems(query)).items.map(x=>x.id),[ids[0]]);
  assert.equal((await shoppingItems({view:'recommended',q:'DEMO flash fixture'})).total,2);
 }finally{await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=ANY(${ids}::text[])`;}
});
test('flash feed retains editorial picks and allows older single-product offers unless known expired',async()=>{
 const {articleId:id}=await upsertMaterial({sourceId:source,url:'https://www.dealnews.com/demo-'+source,title:'DEMO guide pick',bodyText:'Synthetic source fixture, not a real deal.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
 try{
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','home','DEMO guide pick','Synthetic source fixture.',40,false)`;
  await publishArticle(id);
  const d={...offer,status:'Unverified',expiresAt:null};
  await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json(d)})`;
  let result=await shoppingItems({view:'flash',q:'DEMO guide pick'});assert.equal(result.total,1);assert.equal(result.items[0]!.dealPick!.kind,'editorial');assert.equal(result.items[0]!.flashDeal,undefined);
  assert.equal((await shoppingItems({view:'flash',q:'DEMO guide pick',merchant:'walmart'})).total,0);
  await sql`UPDATE shopping_offers SET data=${sql.json({...d,deadlineOriginal:'Expires January 1, 2020'})} WHERE article_id=${id}`;
  assert.equal((await shoppingItems({view:'flash',q:'DEMO guide pick'})).total,0);
  await sql`UPDATE shopping_offers SET data=${sql.json(d)} WHERE article_id=${id}`;
  await sql`UPDATE publications SET published_at=now()-interval '8 days' WHERE article_id=${id}`;
  const older=await shoppingItems({view:'flash',q:'DEMO guide pick'});assert.equal(older.total,1);assert.equal(older.items[0]!.productActivity,true);assert.equal(older.items[0]!.dealPick,undefined);
 }finally{await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${id}`;}
});
test('flash includes named product coupon/cashback/freebie activities without price or merchant destination',async()=>{
 const ids:string[]=[];
 try{
  for(const kind of ['coupon_offer','cashback_offer','freebie']){
   const {articleId:id}=await upsertMaterial({sourceId:source,url:'https://example.com/activity-'+kind+'-'+source,title:'DEMO product activity '+kind,bodyText:'Synthetic product fixture.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});ids.push(id);
   await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','home',${'DEMO product activity '+kind},'Synthetic product fixture.',30,false)`;
   await publishArticle(id);
   await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json({...offer,kind,activityScope:'single_product',status:'Unverified',buyUrl:null,listedPriceCents:null,checkoutPriceCents:null,expiresAt:null})})`;
  }
  const found=await shoppingItems({view:'flash',q:'DEMO product activity'});assert.equal(found.total,3);assert.ok(found.items.every(x=>x.productActivity&&!x.flashDeal&&!x.dealPick));
  const page=await shoppingItems({view:'flash',q:'DEMO product activity',limit:1});assert.equal(page.hasMore,true);
  assert.equal((await shoppingItems({view:'flash',q:'DEMO product activity',category:'electronics'})).total,0);
  await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{activityScope}','"storewide"') WHERE article_id=${ids[0]!}`;
  assert.equal((await shoppingItems({view:'flash',q:'DEMO product activity'})).total,2);
  assert.equal((await shoppingItems({view:'recommended',q:'DEMO product activity'})).total,3);
 }finally{await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=ANY(${ids}::text[])`;}
});
test('price records capture actual changes, ignore failed checks, and separate product conditions',async()=>{
 const item=(await shoppingItems({id:articleId})).items[0]!;
 const initial=await shoppingPriceHistory(item);assert.equal(initial.length,1);assert.equal(initial[0]!.checkoutPriceCents,9000);
 await sql`UPDATE shopping_offers SET data=${sql.json({...offer,status:'Unverified',lastCheckedAt:new Date().toISOString()})} WHERE article_id=${articleId}`;
 assert.equal((await shoppingPriceHistory(item)).length,1);
 await sql`UPDATE shopping_offers SET data=${sql.json({...offer,status:'Unverified',checkoutPriceCents:8000})} WHERE article_id=${articleId}`;
 const changed=await shoppingPriceHistory(item);assert.equal(changed.length,2);assert.equal(changed[1]!.checkoutPriceCents,8000);assert.equal(changed[1]!.basis,'source-reported');
 await sql`UPDATE shopping_offers SET data=${sql.json({...offer,variant:'2 pack',checkoutPriceCents:15000})} WHERE article_id=${articleId}`;
 const variant=await shoppingPriceHistory(item);assert.equal(variant.length,1);assert.equal(variant[0]!.checkoutPriceCents,15000);
 await sql`UPDATE shopping_offers SET data=${sql.json(offer)} WHERE article_id=${articleId}`;
 const detail=(await app.inject('/api/shopping?id='+articleId)).json();assert.ok(detail.priceHistory.length>=2);assert.equal(detail.likes,0);
});
test('likes are idempotent per browser, reversible, validated and private to public items',async()=>{
 const visitorId='a'.repeat(32);const endpoint='/api/shopping/'+articleId+'/likes';
 const send=(liked:boolean)=>app.inject({method:'POST',url:endpoint,payload:{visitorId,liked}});
 const responses=await Promise.all(Array.from({length:5},()=>send(true)));assert.ok(responses.every(r=>r.statusCode===200));
 const read=(await app.inject({url:endpoint,headers:{'x-dealbrief-visitor':visitorId}})).json();assert.deepEqual(read,{count:1,liked:true});
 assert.deepEqual((await app.inject(endpoint)).json(),{count:1,liked:false});
 assert.equal((await app.inject({method:'POST',url:endpoint,headers:{origin:'https://elsewhere.invalid'},payload:{visitorId,liked:true}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:endpoint,payload:{visitorId:'bad',liked:true}})).statusCode,400);
 await send(false);assert.deepEqual((await send(false)).json(),{count:0,liked:false});
 assert.equal((await app.inject({method:'POST',url:'/api/shopping/missing/likes',payload:{visitorId,liked:true}})).statusCode,404);
});
test('all shopping exits share current eligibility and preserve checkout/reward separation',async()=>{
 const top=await shoppingItems({view:'top',q:'DEMO vacuum'});assert.equal(top.items.length,1);assert.equal(top.items[0]!.offer.checkoutPriceCents,9000);assert.equal(top.items[0]!.offer.cashback,'DEMO $10 after purchase');
 const api=await app.inject('/api/v1/items');assert.equal(api.statusCode,200);assert.ok(api.json().items.some((x:any)=>x.id===articleId));
 const rss=await app.inject('/feed.xml');assert.ok(rss.body.includes('DEMO vacuum'));
 await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{expiresAt}',to_jsonb(${new Date(Date.now()-1000).toISOString()}::text)) WHERE article_id=${articleId}`;
 assert.equal((await shoppingItems({view:'top',q:'DEMO vacuum'})).items.length,0);
 assert.equal((await shoppingItems({view:'latest',q:'DEMO vacuum'})).items.length,0);
 assert.equal((await shoppingItems({id:articleId})).items[0]!.offer.status,'Expired');
 assert.ok(!(await app.inject('/feed.xml')).body.includes('DEMO vacuum'));
 assert.ok(!(await app.inject('/api/v1/items')).json().items.some((x:any)=>x.id===articleId));
});
test('shopping sitemaps cover news and older offers, honor explicit SEO exclusion, and emit valid metadata',async()=>{
 const index=await app.inject('/sitemap.xml');assert.equal(index.statusCode,200);assert.match(index.body,/<sitemapindex/);assert.match(index.body,/sitemaps\/items-1.xml/);
 const before=await app.inject('/sitemaps/items-1.xml');assert.match(before.body,new RegExp(articleId));assert.match(before.body,/<lastmod>/);
 const pages=await app.inject('/sitemaps/pages.xml');assert.match(pages.body,/\/deals\/home/);assert.match(pages.body,/\/stores\/target/);
 for(const url of ['/sitemaps/items-0.xml','/sitemaps/items-999999.xml','/sitemaps/unknown.xml'])assert.equal((await app.inject(url)).statusCode,404,url);
 await sql`UPDATE publications SET seo_excluded_at=now() WHERE article_id=${articleId}`;
 assert.ok(!(await app.inject('/sitemaps/items-1.xml')).body.includes('/items/'+articleId));
 assert.equal((await shoppingItems({id:articleId})).items[0]!.indexable,false);
 await sql`UPDATE publications SET seo_excluded_at=NULL WHERE article_id=${articleId}`;
 const og=await app.inject('/og/items/'+articleId+'.png');assert.equal(og.statusCode,200);assert.match(og.headers['content-type']!,/image\/png/);
 assert.equal((await app.inject('/og/items/missing.png')).statusCode,404);
 assert.match(String((await app.inject('/api/shopping')).headers['x-robots-tag']),/noindex/);
});
test('GEO text and all-item API share visibility, provenance and pagination',async()=>{
 const item=(await shoppingItems({id:articleId})).items[0]!;
 const text=await app.inject('/items/'+articleId+'/markdown');assert.equal(text.statusCode,200);assert.match(String(text.headers['content-type']),/text\/markdown/);assert.match(String(text.headers.link),new RegExp('/items/'+articleId));assert.match(String(text.headers['x-robots-tag']),/noindex/);assert.match(text.body,/Canonical page:/);assert.match(text.body,/Source publication time:/);assert.match(text.body,/Cashback/);
 assert.equal((await app.inject('/items/missing/markdown')).statusCode,404);
 const first=(await app.inject('/api/v1/items?mode=all&limit=1')).json();const next=(await app.inject('/api/v1/items?mode=all&limit=1&offset=1')).json();
 if(first.hasMore)assert.notEqual(first.items[0].id,next.items[0].id);
 const all=(await app.inject('/api/v1/items?mode=all&limit=100')).json();assert.ok(all.items.some((x:any)=>x.id===item.id));
 const guide=(await app.inject('/llms.txt')).body;assert.match(guide,/mode=all/);assert.match(guide,/Unverified/);assert.match(guide,/markdown/);
});
test('routine verification timestamps cannot change content lastmod but real offer edits do',async()=>{
 const [before]=await sql`SELECT data,content_updated_at FROM shopping_offers WHERE article_id=${articleId}`;
 await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{lastCheckedAt}',to_jsonb(${new Date().toISOString()}::text)),updated_at=now() WHERE article_id=${articleId}`;
 const [check]=await sql`SELECT content_updated_at FROM shopping_offers WHERE article_id=${articleId}`;assert.equal(check.content_updated_at.toISOString(),before.content_updated_at.toISOString());
 await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{checkoutPriceCents}','7500'),updated_at=now() WHERE article_id=${articleId}`;
 const [edit]=await sql`SELECT content_updated_at FROM shopping_offers WHERE article_id=${articleId}`;assert.ok(edit.content_updated_at>before.content_updated_at);
 await sql`UPDATE shopping_offers SET data=${sql.json(before.data)} WHERE article_id=${articleId}`;
});
test('reviews channel is public, included in AI Picks, excluded from deal/news feeds and preserves video attribution in text',async()=>{
 const {articleId:id}=await upsertMaterial({sourceId:source,url:'https://example.com/review-'+source,title:'DEMO source review',bodyText:'Synthetic review fixture.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});
 try{
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','home','DEMO source review','Synthetic review of the demo product.',60,false)`;
  await publishArticle(id);
  const review={format:'video_review',author:'DEMO author',verdict:'The source describes this demo product.',bestFor:'DEMO use',strengths:['DEMO strength'],limitations:['DEMO limit'],testingNote:'The source reports a demo test.',questions:[{question:'What does this fixture show?',answer:'A source-attributed review.'}],videoUrl:'https://www.youtube.com/watch?v=abcdefghijk',basis:'source_text'};
  await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json({...offer,kind:'buying_guide',review})})`;
  for(const view of ['reviews','recommended'])assert.equal((await shoppingItems({view,q:'DEMO source review'})).total,1);
  for(const view of ['flash','news','top'])assert.equal((await shoppingItems({view,q:'DEMO source review'})).total,0);
  assert.equal((await shoppingItems({view:'reviews',q:'DEMO source review',category:'electronics'})).total,0);
  assert.ok((await app.inject('/feed/reviews.xml')).body.includes('DEMO source review'));
  assert.equal((await app.inject('/api/v1/items?mode=reviews&q=DEMO%20source%20review')).json().total,1);
  const text=(await app.inject('/items/'+id+'/markdown')).body;assert.match(text,/Original video:/);assert.match(text,/DEMO author/);assert.match(text,/not a Savlume hands-on test/);
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${id}`;
  assert.equal((await shoppingItems({view:'reviews',q:'DEMO source review'})).total,0);assert.equal((await app.inject('/items/'+id+'/markdown')).statusCode,404);
 }finally{await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${id}`;}
});
test('withdrawal removes the history detail and every shopping exit immediately',async()=>{
 await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${articleId}`;
 assert.equal((await shoppingItems({id:articleId})).items.length,0);
 assert.equal((await app.inject('/api/v1/items/'+articleId)).statusCode,404);
 assert.ok(!(await app.inject('/sitemaps/items-1.xml')).body.includes('/items/'+articleId));
 assert.equal((await app.inject('/og/items/'+articleId+'.png')).statusCode,404);
 assert.equal((await app.inject('/items/'+articleId+'/markdown')).statusCode,404);
 assert.equal((await app.inject('/api/shopping/'+articleId+'/likes')).statusCode,404);
 assert.equal((await app.inject({method:'POST',url:'/api/shopping/'+articleId+'/likes',payload:{visitorId:'a'.repeat(32),liked:true}})).statusCode,404);
});
