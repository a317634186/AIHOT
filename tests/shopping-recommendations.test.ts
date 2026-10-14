import {stub,tag} from './setup.ts';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {stopBoss} from '@aihot/backend/jobs/queue';
import {sql,closeDb} from '@aihot/backend/db';
import {SHOPPING} from '@aihot/industry/shopping';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {publishArticle} from '@aihot/backend/publication/publish';
import {refreshShoppingRecommendation} from '@aihot/backend/shopping/recommendations';
import {shoppingItems} from '@aihot/backend/publication/shopping';
import {shoppingText} from '@aihot/backend/publication/shopping-text';
Object.defineProperty(SHOPPING,'enabled',{value:true,configurable:true});
const source='recommendation-'+tag();
await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${source},'DEMO recommendation source','external','T2','editorial')`;
let raceId='',calls=0;const inputs:any[]=[];
const generated={summary:'Worth considering if cordless cleaning fits your household.',bestFor:'Households needing cordless cleaning',highlights:['A cordless design avoids a trailing power cable.'],priceReason:'The reported $90 is below the source reference of $100; this does not prove a market low. Shipping is unspecified.',cautions:['Check shipping before ordering.']};
const provider=await stub(async(_hit,req)=>{
 calls++;const request=JSON.parse(req.body);inputs.push(JSON.parse(request.messages.at(-1).content));
 if(raceId)await sql`UPDATE shopping_offers SET data=jsonb_set(data,'{checkoutPriceCents}','9500') WHERE article_id=${raceId}`;
 return {choices:[{message:{content:JSON.stringify(generated)}}],usage:{prompt_tokens:1,completion_tokens:1}};
});
Object.assign(process.env,{LLM_BASE_URL:provider.url+'/v1',LLM_API_KEY:'test-key',LLM_MODEL:'test-recommendations',UNDERSTAND_MODEL:'default',COLLECT_ENABLED:'false'});
const ids:string[]=[];
async function fixture(kind='product_deal'){
 const {articleId}=await upsertMaterial({sourceId:source,url:'https://example.com/'+tag(),title:'DEMO cordless vacuum',bodyText:'DEMO: cordless vacuum offered for $90 against a $100 retailer reference. Shipping not specified.',bodyStatus:'ok',via:'fetch',publishedAt:new Date()});ids.push(articleId);
 await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,title_zh,summary_zh,score,selected) VALUES(${articleId},1,'rule','pass','home','DEMO cordless vacuum','Synthetic fixture, not a real offer.',90,true)`;
 await publishArticle(articleId);
 const data={kind,product:'DEMO vacuum',model:'DEMO1',variant:'1 pack',condition:'new',merchantId:'target',seller:'DEMO seller',status:'Unverified',listedPriceCents:10000,checkoutPriceCents:9000,currency:'USD',restrictions:[],expiresAt:null,verifiedAt:null,buyUrl:'https://example.com/buy',identity:null,aiOverview:{summary:'Old introduction',bestFor:null,highlights:[],cautions:[]}};
 await sql`INSERT INTO shopping_offers(article_id,input_revision,data) VALUES(${articleId},1,${sql.json(data)})`;
 return {articleId,data};
}
after(async()=>{await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=ANY(${ids}::text[])`;await provider.close();await stopBoss();await closeDb();});

test('AI refresh supplies source and limited history, preserves offer facts and price records, and exports the rationale',async()=>{
 const {articleId,data}=await fixture();
 const before=await sql`SELECT * FROM shopping_price_observations WHERE article_id=${articleId}`;
 assert.equal(await refreshShoppingRecommendation(articleId),true);
 const [row]=await sql`SELECT data FROM shopping_offers WHERE article_id=${articleId}`;
 const {aiOverview,...facts}=row!.data;const {aiOverview:old,...oldFacts}=data;
 assert.deepEqual(facts,oldFacts);assert.equal(aiOverview.format,'recommendation');assert.equal(aiOverview.priceReason,generated.priceReason);
 assert.equal(inputs.at(-1).priceArithmetic.differenceCents,1000);assert.equal(inputs.at(-1).recordedPrices.length,1);assert.match(inputs.at(-1).body,/\$90/);assert.equal(inputs.at(-1).offer.aiOverview,undefined);
 assert.deepEqual(await sql`SELECT * FROM shopping_price_observations WHERE article_id=${articleId}`,before);
 const item=(await shoppingItems({id:articleId})).items[0]!;
 assert.match(shoppingText(item,'https://example.com'),/Why the Price Makes Sense/);
 assert.match(shoppingText(item,'https://example.com'),/does not prove a market low/);
 const count=calls;assert.equal(await refreshShoppingRecommendation(articleId),false);assert.equal(calls,count);
});
test('recalls and withdrawn content never trigger a purchase recommendation call',async()=>{
 const count=calls;const recall=await fixture('recall');assert.equal(await refreshShoppingRecommendation(recall.articleId),false);
 const hidden=await fixture();await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${hidden.articleId}`;
 assert.equal(await refreshShoppingRecommendation(hidden.articleId),false);assert.equal(calls,count);
});
test('a concurrent price change discards a stale recommendation without overwriting the new price',async()=>{
 const {articleId}=await fixture();raceId=articleId;
 try{assert.equal(await refreshShoppingRecommendation(articleId),false);}finally{raceId='';}
 const [row]=await sql`SELECT data FROM shopping_offers WHERE article_id=${articleId}`;
 assert.equal(row!.data.checkoutPriceCents,9500);assert.equal(row!.data.aiOverview.summary,'Old introduction');
});
test('an unresolved paid request prevents a resend even after changing the model or prompt',async()=>{
 const {articleId}=await fixture();const count=calls;
 const [receipt]=await sql`INSERT INTO receipts(logical_key,service,model,purpose,subject,status,request,attempts) VALUES(${tag()},'llm','previous-model','shopping_recommendation',${'article:'+articleId+'@1'},'unknown','{}',1) RETURNING id`;
 try{assert.equal(await refreshShoppingRecommendation(articleId),false);assert.equal(calls,count);}finally{await sql`DELETE FROM receipts WHERE id=${receipt!.id}`;}
});
