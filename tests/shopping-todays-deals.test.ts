import {tag} from './setup.ts';
import {SHOPPING} from '@aihot/industry/shopping';
Object.defineProperty(SHOPPING,'enabled',{value:true,configurable:true});
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {sql,closeDb} from '@aihot/backend/db';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {shoppingItems} from '@aihot/backend/publication/shopping';
import {stopBoss} from '@aihot/backend/jobs/queue';
import {randomUUID} from 'node:crypto';

after(async()=>{await stopBoss();await closeDb();});
test('today’s deals includes current offers but excludes news and expired offers while retaining the all-information feed',async()=>{
 const key=tag(),source='deals-'+key;
 await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${source},'Synthetic source','external','T2','editorial')`;
 const ids:string[]=[];
 for(const [kind,status] of [['product_deal','Unverified'],['shopping_news','Unverified'],['product_deal','Expired'],['product_deal','Upcoming']] as const){
  const title=`Navigation fixture ${key} ${ids.length} Acme cordless drill for $15 at Target`;
  const {articleId}=await upsertMaterial({sourceId:source,url:`https://example.invalid/${key}/${ids.length}`,title,bodyText:'Target offers the Acme cordless drill for $15, down from $20.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});ids.push(articleId);
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${articleId},1,'rule','pass','home',${title},'Synthetic fixture.',80,true)`;
  await publishArticle(articleId);
  const offer={kind,product:'Acme cordless drill',model:`M1234${ids.length}`,variant:null,condition:'new',merchant:'Target',merchantId:'target',seller:'Target',fulfillment:null,buyUrl:`https://www.target.com/p/example/-/A-1234567${ids.length}`,imageUrl:null,imageSource:null,listedPriceCents:2000,checkoutPriceCents:1500,currency:'USD',priceEvidence:'Target offers the Acme cordless drill for $15, down from $20.',comparison:null,shipping:null,cashback:null,giftCard:null,points:null,coupon:null,steps:[],restrictions:[],membership:null,subscription:null,renewal:null,cancellation:null,region:'US',expiresAt:null,deadlineOriginal:null,warranty:null,returns:null,status,verifiedAt:null,lastCheckedAt:null,verificationNote:'Fixture',identity:null};
  await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${articleId},1,${sql.json(offer)})`;
 }
 const current=await shoppingItems({view:'deals',q:key});assert.deepEqual(current.items.map(x=>x.id),[ids[0]]);
 const all=await shoppingItems({view:'new',q:key});assert.deepEqual(new Set(all.items.map(x=>x.id)),new Set(ids));
});

test('community feedback can move a supported older deal above a newer one without synthetic public activity',async()=>{
 const key=tag(),source='rank-'+key;
 await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${source},'Synthetic source','external','T2','editorial')`;
 const ids:string[]=[];
 for(const age of [0,2*60*60*1000]){
  const title=`Ranking fixture ${key} Acme cordless drill for $15 at Target ${ids.length}`;
  const {articleId}=await upsertMaterial({sourceId:source,url:`https://example.invalid/${key}/${ids.length}`,title,bodyText:'Target offers the Acme cordless drill for $15, down from $20.',bodyStatus:'ok',via:'fetch',publishedAt:new Date(Date.now()-age)});ids.push(articleId);
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${articleId},1,'rule','pass','home',${title},'Synthetic fixture.',80,true)`;
  await publishArticle(articleId);
  await sql`UPDATE publications SET timeline_at=${new Date(Date.now()-age)} WHERE article_id=${articleId}`;
  const offer={kind:'product_deal',product:'Acme cordless drill',model:`M1234${ids.length}`,variant:null,condition:'new',merchant:'Target',merchantId:'target',seller:'Target',fulfillment:null,buyUrl:`https://www.target.com/p/example/-/A-1234567${ids.length}`,imageUrl:null,imageSource:null,listedPriceCents:2000,checkoutPriceCents:1500,currency:'USD',priceEvidence:'Target offers the Acme cordless drill for $15, down from $20.',comparison:null,shipping:null,cashback:null,giftCard:null,points:null,coupon:null,steps:[],restrictions:[],membership:null,subscription:null,renewal:null,cancellation:null,region:'US',expiresAt:null,deadlineOriginal:null,warranty:null,returns:null,status:'Unverified',verifiedAt:null,lastCheckedAt:null,verificationNote:'Fixture',identity:null};
  await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${articleId},1,${sql.json(offer)})`;
 }
 assert.equal((await shoppingItems({view:'deals',q:key})).items[0]?.id,ids[0]);
 for(let i=0;i<5;i++){const id=randomUUID(),handle=`test_${key}_${i}`;await sql`INSERT INTO community_users(id,handle,handle_key,password_salt,password_hash) VALUES(${id},${handle},${handle},'fixture','fixture')`;await sql`INSERT INTO community_votes(user_id,target_type,target_id,value) VALUES(${id},'article',${ids[1]!},1)`;}
 const ranked=await shoppingItems({view:'deals',q:key});assert.equal(ranked.items[0]?.id,ids[1]);assert.equal(ranked.items[0]?.communityRating?.worthIt,5);
});
