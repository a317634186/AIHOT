import { z } from 'zod';
import { cents,effectiveStatus, isOffer, safeCopy, truncateAtWord, type AiOverview, type Offer } from '@aihot/contracts/shopping';
import { sql } from '../db.ts';
import { modelFor } from '../editorial/models.ts';
import { promptText, promptVersion } from '../editorial/prompts.ts';
import { BudgetExceededError, ProviderRejectedError } from '../providers/receipts.ts';
import { chatJson, markReceiptsCompleted, ModelOutputError } from '../providers/llm.ts';
import { shoppingComparisons,shoppingItems,shoppingPriceHistory } from '../publication/shopping.ts';

export const RecommendationSchema=z.object({summary:z.string().trim().min(1).max(1200),bestFor:z.string().max(1600).nullable(),highlights:z.array(z.string().max(350)).max(4),priceReason:z.string().max(1600).nullable().optional(),cautions:z.array(z.string().max(350)).max(4)});
export function cleanRecommendation(value:z.infer<typeof RecommendationSchema>,recommendation=true):AiOverview {
 return {...(recommendation?{format:'recommendation' as const}:{}),summary:safeCopy(value.summary),bestFor:value.bestFor?safeCopy(value.bestFor):null,highlights:value.highlights.map(safeCopy),priceReason:value.priceReason?safeCopy(value.priceReason):null,cautions:value.cautions.map(safeCopy)};
}
/** Do not show a price analysis with invented amounts or an outdated current price. */
export function supportedPriceReason(reason:string,current:number|null,evidence:string,otherAmounts:number[]):string{
 const amounts=(text:string)=>[...text.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g)].map(m=>cents(m[1])).filter((v):v is number=>v!==null);
 const claimed=amounts(reason),allowed=new Set([...amounts(evidence),...otherAmounts,...(current===null?[]:[current])]);
 if(claimed.some(value=>!allowed.has(value))||current!==null&&claimed.length>0&&!claimed.includes(current))return 'The available price evidence needs review. Check the retailer for the current price and conditions.';
 return reason;
}

// Editorial refresh only: preserve prices, verification, identity, review fields and publication state.
export async function refreshShoppingRecommendation(articleId:string) {
 const item=(await shoppingItems({id:articleId})).items[0];
 if(!item||!isOffer(item.offer))return false;
 // A prompt/model change must not bypass an unresolved request for the same article.
 const [blocked]=await sql`SELECT 1 FROM receipts WHERE purpose='shopping_recommendation' AND subject LIKE ${'article:'+articleId+'@%'} AND status IN ('pending','unknown') LIMIT 1`;
 if(blocked)return false;
 const [a]=await sql`SELECT a.title,a.body_text,a.excerpt,a.url,a.revision,a.published_at,d.data,d.input_revision FROM articles a JOIN shopping_offers d ON d.article_id=a.id WHERE a.id=${articleId}`;
 if(!a||item.id!==articleId||item.sourceUrl!==a.url)return false;
 const offer=a.data as Offer;
 const {aiOverview,review,...facts}=item.offer;
 const [history,comparisons]=await Promise.all([shoppingPriceHistory(item),shoppingComparisons(item)]);
 const matchedRetailers=comparisons.filter(x=>x.priceDisplay.verification==='merchant-verified'&&x.priceDisplay.state==='current'&&x.priceDisplay.amountCents!==null).slice(0,4).map(x=>({retailer:x.offer.merchant,priceCents:x.priceDisplay.amountCents,currency:'USD',verifiedAt:x.priceDisplay.verifiedAt,product:x.offer.product,model:x.offer.model,variant:x.offer.variant,condition:x.offer.condition,coupon:x.offer.coupon,restrictions:x.offer.restrictions,shipping:x.offer.shipping,sourceUrl:x.sourceUrl,retailerUrl:x.offer.buyUrl}));
 const additionalEvidence=history.length>=2||matchedRetailers.length>0;
 if(offer.aiOverview?.format==='recommendation'&&offer.aiOverview.priceReason&&(!additionalEvidence||offer.aiOverview.analysisVersion==='buyer-context-v1'&&offer.aiOverview.analysisPriceCents===item.priceDisplay.amountCents))return false;
 const publicOffer=item.offer;
 const result=await chatJson({model:await modelFor('understand'),purpose:'shopping_recommendation',subject:`article:${articleId}@${a.revision}`,promptVersion:promptVersion('shopping-recommendation'),system:promptText('shopping-recommendation'),user:JSON.stringify({title:a.title,body:truncateAtWord(String(a.body_text||a.excerpt||''),22000),sourceUrl:a.url,sourcePublishedAt:a.published_at,offer:{...facts,status:effectiveStatus(publicOffer)},priceStatus:item.priceDisplay,priceArithmetic:publicOffer.listedPriceCents!==null&&publicOffer.checkoutPriceCents!==null?{listedPriceCents:publicOffer.listedPriceCents,checkoutPriceCents:publicOffer.checkoutPriceCents,differenceCents:publicOffer.listedPriceCents-publicOffer.checkoutPriceCents,currency:publicOffer.currency,basis:'Stored source-reported listed versus checkout amounts, excluding rewards; not typical market price'}:null,recordedPrices:history.slice(-30),matchedRetailers}),schema:RecommendationSchema.extend({priceReason:z.string().trim().min(1).max(1600)}),maxTokens:2200,temperature:0.1});
 const data:AiOverview={...cleanRecommendation(result.data),...(additionalEvidence?{analysisVersion:'buyer-context-v1' as const,analysisPriceCents:item.priceDisplay.amountCents}:{})};
 const relevantSource=truncateAtWord(a.title+' '+String(a.body_text||a.excerpt||'').split(/\b(?:related offers|related deals|more deals|you may also like)\b/i,1)[0],22000);
 data.priceReason=supportedPriceReason(data.priceReason??'',item.priceDisplay.amountCents,relevantSource,[...history.flatMap(h=>[h.checkoutPriceCents,h.listedPriceCents].filter((v):v is number=>v!==null)),...matchedRetailers.map(x=>x.priceCents).filter((v):v is number=>v!==null)]);
 const updated=await sql`UPDATE shopping_offers d SET data=jsonb_set(d.data,'{aiOverview}',${sql.json(data as never)}),updated_at=now()
 WHERE d.article_id=${articleId} AND d.input_revision=${a.input_revision}
 AND COALESCE(d.data->'aiOverview','null'::jsonb)=${sql.json((offer.aiOverview??null) as never)}::jsonb
 AND (d.data-ARRAY['aiOverview','lastCheckedAt','verifiedAt','verificationNote'])=(${sql.json(offer as never)}::jsonb-ARRAY['aiOverview','lastCheckedAt','verifiedAt','verificationNote'])
 AND EXISTS(SELECT 1 FROM articles a JOIN publications p ON p.article_id=a.id WHERE a.id=d.article_id AND a.revision=${a.revision} AND p.visibility='public' AND p.eligible)
 RETURNING d.article_id`;
 await markReceiptsCompleted([result.receiptId]);
 return updated.length>0;
}

export async function refreshMissingShoppingRecommendations(limit=20){
 if(!Number.isInteger(limit)||limit<1||limit>300)throw new Error('Supply a batch limit from 1 to 300');
 const missingCandidates=await sql<{article_id:string}[]>`SELECT d.article_id FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id JOIN articles a ON a.id=d.article_id JOIN sources s ON s.id=a.source_id
 WHERE p.visibility='public' AND p.eligible AND a.processing_state<>'blocked' AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes'
 AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
 AND NULLIF(d.data->>'promotionEndedAt','') IS NULL
 AND COALESCE(d.data->>'status','Unverified') NOT IN ('Expired','Out of Stock')
 AND (d.data->'aiOverview'->>'format' IS DISTINCT FROM 'recommendation' OR COALESCE(d.data->'aiOverview'->>'priceReason','')='')
 AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.purpose='shopping_recommendation' AND r.subject LIKE 'article:'||d.article_id||'@%' AND r.status IN ('pending','unknown'))
 AND COALESCE((SELECT sum(r.attempts) FROM receipts r WHERE r.purpose='shopping_recommendation' AND r.subject LIKE 'article:'||d.article_id||'@%' AND r.status='failed'),0)<3
 ORDER BY p.timeline_at DESC LIMIT ${Math.min(limit*3,300)}`;
 const missing:{article_id:string}[]=[];
 for(const candidate of missingCandidates){
  const item=(await shoppingItems({id:candidate.article_id})).items[0];
  if(!item||item.id!==candidate.article_id||!isOffer(item.offer))continue;
  missing.push(candidate);if(missing.length>=limit)break;
 }
 // Enrich a small number of recent offers only after matching price observations exist. This reuses
 // the existing hourly job and receipt/budget safeguards rather than starting searches on page views.
 const capacity=Math.min(3,Math.max(0,limit-missing.length));
 const candidates=capacity?await sql<{article_id:string;url:string}[]>`SELECT d.article_id,a.url FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id JOIN articles a ON a.id=d.article_id JOIN sources s ON s.id=a.source_id
 WHERE p.visibility='public' AND p.eligible AND a.processing_state<>'blocked' AND s.participation_mode='editorial' AND p.timeline_at>now()-interval '14 days' AND p.timeline_at<=now()+interval '5 minutes'
 AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie') AND d.data->>'status' IN ('Active','Unverified') AND NULLIF(d.data->>'buyUrl','') IS NOT NULL
 AND d.data->'aiOverview'->>'format'='recommendation' AND COALESCE(d.data->'aiOverview'->>'priceReason','')<>''
 AND (d.data->'aiOverview'->>'analysisVersion' IS DISTINCT FROM 'buyer-context-v1' OR COALESCE(d.data->'aiOverview'->>'analysisPriceCents','') IS DISTINCT FROM COALESCE(d.data->>'checkoutPriceCents',d.data->>'listedPriceCents',''))
 AND EXISTS(SELECT 1 FROM shopping_price_observations h WHERE h.article_id=d.article_id AND h.offer_context=shopping_price_context(d.data) AND h.observed_at>now()-interval '180 days' ORDER BY h.observed_at DESC OFFSET 1 LIMIT 1)
 AND NOT EXISTS(SELECT 1 FROM receipts r WHERE r.purpose='shopping_recommendation' AND r.subject LIKE 'article:'||d.article_id||'@%' AND r.status IN ('pending','unknown'))
 AND COALESCE((SELECT sum(r.attempts) FROM receipts r WHERE r.purpose='shopping_recommendation' AND r.subject LIKE 'article:'||d.article_id||'@%' AND r.status='failed'),0)<3
 ORDER BY p.timeline_at DESC LIMIT ${capacity*4}`:[];
 const enriched:{article_id:string;url:string}[]=[];
 for(const candidate of candidates){const item=(await shoppingItems({id:candidate.article_id})).items[0];
  if(!item||item.id!==candidate.article_id||item.sourceUrl!==candidate.url||!isOffer(item.offer)||item.priceDisplay.state!=='current'||item.priceDisplay.amountCents===null||!item.offer.buyUrl)continue;
  enriched.push(candidate);if(enriched.length>=capacity)break;
 }
 const rows=[...missing,...enriched];
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
