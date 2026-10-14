import { z } from 'zod';
import { effectiveStatus, isOffer, safeCopy, type AiOverview, type Offer } from '@aihot/contracts/shopping';
import { sql } from '../db.ts';
import { modelFor } from '../editorial/models.ts';
import { promptText, promptVersion } from '../editorial/prompts.ts';
import { BudgetExceededError, ProviderRejectedError } from '../providers/receipts.ts';
import { chatJson, markReceiptsCompleted, ModelOutputError } from '../providers/llm.ts';
import { shoppingItems, shoppingPriceHistory } from '../publication/shopping.ts';

export const RecommendationSchema=z.object({summary:z.string().trim().min(1).max(1200),bestFor:z.string().max(1600).nullable(),highlights:z.array(z.string().max(350)).max(4),priceReason:z.string().max(1600).nullable().optional(),cautions:z.array(z.string().max(350)).max(4)});
export function cleanRecommendation(value:z.infer<typeof RecommendationSchema>,recommendation=true):AiOverview {
 return {...(recommendation?{format:'recommendation' as const}:{}),summary:safeCopy(value.summary),bestFor:value.bestFor?safeCopy(value.bestFor):null,highlights:value.highlights.map(safeCopy),priceReason:value.priceReason?safeCopy(value.priceReason):null,cautions:value.cautions.map(safeCopy)};
}

// Editorial refresh only: preserve prices, verification, identity, review fields and publication state.
export async function refreshShoppingRecommendation(articleId:string) {
 const item=(await shoppingItems({id:articleId})).items[0];
 if(!item||!isOffer(item.offer))return false;
 // A prompt/model change must not bypass an unresolved request for the same article.
 const [blocked]=await sql`SELECT 1 FROM receipts WHERE purpose='shopping_recommendation' AND subject LIKE ${'article:'+articleId+'@%'} AND status IN ('pending','unknown') LIMIT 1`;
 if(blocked)return false;
 const [a]=await sql`SELECT a.title,a.body_text,a.excerpt,a.url,a.revision,a.published_at,d.data,d.input_revision FROM articles a JOIN shopping_offers d ON d.article_id=a.id WHERE a.id=${articleId}`;
 if(!a)return false;
 const offer=a.data as Offer;
 if(offer.aiOverview?.format==='recommendation'&&offer.aiOverview.priceReason)return false;
 const {aiOverview,review,...facts}=offer;
 const history=await shoppingPriceHistory(item);
 const result=await chatJson({model:await modelFor('understand'),purpose:'shopping_recommendation',subject:`article:${articleId}@${a.revision}`,promptVersion:promptVersion('shopping-recommendation'),system:promptText('shopping-recommendation'),user:JSON.stringify({title:a.title,body:String(a.body_text||a.excerpt||'').slice(0,22000),sourceUrl:a.url,sourcePublishedAt:a.published_at,offer:{...facts,status:effectiveStatus(offer)},priceArithmetic:offer.listedPriceCents!==null&&offer.checkoutPriceCents!==null?{listedPriceCents:offer.listedPriceCents,checkoutPriceCents:offer.checkoutPriceCents,differenceCents:offer.listedPriceCents-offer.checkoutPriceCents,currency:offer.currency,basis:'Stored source-reported listed versus checkout amounts, excluding rewards; not typical market price'}:null,recordedPrices:history.slice(-30)}),schema:RecommendationSchema.extend({priceReason:z.string().trim().min(1).max(1600)}),maxTokens:2200,temperature:0.1});
 const data=cleanRecommendation(result.data);
 const updated=await sql`UPDATE shopping_offers d SET data=jsonb_set(d.data,'{aiOverview}',${sql.json(data as never)}),updated_at=now()
 WHERE d.article_id=${articleId} AND d.input_revision=${a.input_revision}
 AND (d.data-ARRAY['aiOverview','lastCheckedAt','verifiedAt','verificationNote'])=(${sql.json(offer as never)}::jsonb-ARRAY['aiOverview','lastCheckedAt','verifiedAt','verificationNote'])
 AND EXISTS(SELECT 1 FROM articles a JOIN publications p ON p.article_id=a.id WHERE a.id=d.article_id AND a.revision=${a.revision} AND p.visibility='public' AND p.eligible)
 RETURNING d.article_id`;
 await markReceiptsCompleted([result.receiptId]);
 return updated.length>0;
}

export async function refreshMissingShoppingRecommendations(limit=20){
 if(!Number.isInteger(limit)||limit<1||limit>300)throw new Error('Supply a batch limit from 1 to 300');
 const rows=await sql`SELECT d.article_id FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id JOIN articles a ON a.id=d.article_id JOIN sources s ON s.id=a.source_id
 WHERE p.visibility='public' AND p.eligible AND a.processing_state<>'blocked' AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes'
 AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
 AND (d.data->'aiOverview'->>'format' IS DISTINCT FROM 'recommendation' OR COALESCE(d.data->'aiOverview'->>'priceReason','')='')
 AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.purpose='shopping_recommendation' AND r.subject LIKE 'article:'||d.article_id||'@%' AND r.status IN ('pending','unknown'))
 AND COALESCE((SELECT sum(r.attempts) FROM receipts r WHERE r.purpose='shopping_recommendation' AND r.subject LIKE 'article:'||d.article_id||'@%' AND r.status='failed'),0)<3
 ORDER BY p.timeline_at DESC LIMIT ${limit}`;
 let cursor=0,updated=0,failure:unknown;const failed:string[]=[],deferred:string[]=[];
 const results=await Promise.allSettled(Array.from({length:3},async()=>{
  while(!failure&&cursor<rows.length){const row=rows[cursor++]!;
   try{if(await refreshShoppingRecommendation(row.article_id)){updated++;console.log('Updated recommendation:',row.article_id);}}
   catch(error){
    if(error instanceof BudgetExceededError){failure=error;throw error;}
    const [unresolved]=await sql`SELECT 1 FROM receipts WHERE purpose='shopping_recommendation' AND subject LIKE ${'article:'+row.article_id+'@%'} AND status IN ('pending','unknown') LIMIT 1`;
    if(unresolved){deferred.push(row.article_id);continue;}
    if(error instanceof ProviderRejectedError||error instanceof ModelOutputError){failed.push(row.article_id);continue;}
    failure=error;throw error;
   }
  }
 }));
 for(const result of results)if(result.status==='rejected')throw result.reason;
 return {requested:rows.length,updated,failed,deferred};
}
