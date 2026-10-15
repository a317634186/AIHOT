import './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {buildApp} from '../apps/api/src/app.ts';
import {sql,closeDb} from '@aihot/backend/db';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {createWatch,confirmWatch,stopWatch,checkPriceWatches,WatchRejected} from '@aihot/backend/shopping/watch';
import {pushKeys} from '@aihot/backend/notify/push';
import {stopBoss} from '@aihot/backend/jobs/queue';
const app=await buildApp();
after(async()=>{await app.close();await stopBoss();await closeDb();});
test('price watches: push is consent, e-mail needs confirmation, nothing is sent without a drop',async()=>{
 const source='watch-test-'+Math.random().toString(36).slice(2,7);
 await sql`INSERT INTO sources(id,name,kind,config,tier,participation_mode,enabled) VALUES(${source},'Watch test','rss','{}','T2','editorial',true)`;
 const {articleId:id}=await upsertMaterial({sourceId:source,url:'https://example.com/'+source,title:'DEMO watch fixture',bodyText:'Synthetic fixture only.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()} as never);
 await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${id},1,'rule','pass','home','DEMO watch fixture','Synthetic fixture only.',50,false)`;
 await publishArticle(id!);
 const offer={kind:'product_deal',product:'DEMO vacuum',model:'D-1',variant:'1 pack',condition:'new',merchant:'Target',merchantId:'target',seller:'Target',buyUrl:'https://www.target.com/p/x',listedPriceCents:12000,checkoutPriceCents:10000,currency:'USD',status:'Unverified',restrictions:[],steps:[],coupon:null,cashback:null,giftCard:null,points:null,membership:null,subscription:null,expiresAt:null,deadlineOriginal:null,verifiedAt:null,lastCheckedAt:null,verificationNote:'',identity:null,imageUrl:null,imageSource:null,priceEvidence:null,comparison:null,shipping:null,fulfillment:null,renewal:null,cancellation:null,region:null,warranty:null,returns:null};
 await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${id},1,${sql.json(offer as never)})`;
 try{
  const keys=await pushKeys();assert.ok(keys.publicKey.length>20);
  const options=await app.inject('/api/site/watch/options');assert.equal(options.statusCode,200);assert.equal(options.json().email,false);assert.equal(options.json().vapidPublicKey,keys.publicKey);
  await assert.rejects(createWatch({articleId:id!,channel:'email',email:'a@example.com'},'1.1.1.1'),(e:unknown)=>e instanceof WatchRejected&&e.status===503);
  await assert.rejects(createWatch({articleId:id!,channel:'push',subscription:{endpoint:'http://insecure'}},'1.1.1.1'),WatchRejected);
  const sub={endpoint:'https://push.example/'+source,keys:{p256dh:'k',auth:'a'}};
  const made=await createWatch({articleId:id!,channel:'push',subscription:sub},'1.1.1.1');assert.equal(made.confirmed,true);assert.equal(made.baselineCents,10000);
  const [row]=await sql`SELECT token, confirmed_at FROM price_watches WHERE article_id=${id} AND channel='push'`;assert.ok(row!.confirmed_at);
  // No drop yet: nothing is sent and the watch stays.
  await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{checkoutPriceCents}','9900') WHERE article_id=${id}`;
  const quiet=await checkPriceWatches();assert.equal(quiet.sent,0);
  assert.equal(await confirmWatch('not-a-real-token'),null);
  assert.equal(await stopWatch(row!.token),true);assert.equal(await stopWatch(row!.token),false);
  const api=await app.inject({method:'POST',url:'/api/site/watch',payload:{articleId:'missing',channel:'push',subscription:sub}});assert.equal(api.statusCode,404);
 }finally{await sql`DELETE FROM price_watches WHERE article_id=${id}`;await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${id}`;}
});
