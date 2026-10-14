// Bounded backfill for public offers that have no purchase link but whose source links through a
// known redirector (industry LINK_REDIRECTORS). Re-runs the normal extraction with its receipts and
// budget; rows extracted in the last six hours already went through redirect resolution and are skipped.
import {sql,closeDb} from '@aihot/backend/db';
import {extractShopping} from '@aihot/backend/shopping/offers';
import {ProviderRejectedError} from '@aihot/backend/providers/receipts';
import {stopBoss,recordRun} from '@aihot/backend/jobs/queue';
import {LINK_REDIRECTORS} from '@aihot/industry/shopping';
const limit=Math.min(Math.max(Number(process.argv[2]??25),1),100);
const pattern='https?://(?:[a-z0-9.-]*\\.)?(?:'+LINK_REDIRECTORS.map(h=>h.replace(/\./g,'\\.')).join('|')+')/';
try{console.log(JSON.stringify(await recordRun('shopping.relink',async()=>{
 const rows=await sql`SELECT d.article_id FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id JOIN articles a ON a.id=d.article_id
  WHERE p.visibility='public' AND p.eligible AND d.data->>'buyUrl' IS NULL AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
  AND d.data->>'status' NOT IN ('Expired','Out of Stock') AND d.updated_at < now()-interval '6 hours' AND a.body_html ~* ${pattern}
  ORDER BY p.timeline_at DESC LIMIT ${limit}`;
 let linked=0,rejected=0;
 for(const r of rows){
  // A provider rejection skips this item; budget and unknown-outcome errors still stop the run.
  try{await extractShopping(r.article_id,{relink:true});}
  catch(e){if(!(e instanceof ProviderRejectedError))throw e;rejected++;console.log(r.article_id,'provider rejected:',e.message.slice(0,120));continue;}
  const [o]=await sql`SELECT data->>'buyUrl' AS url FROM shopping_offers WHERE article_id=${r.article_id}`;
  if(o?.url)linked++;
  console.log(r.article_id,o?.url??'(no merchant destination in source)');
 }
 return {candidates:rows.length,linked,rejected};
})));}finally{await stopBoss();await closeDb();}
