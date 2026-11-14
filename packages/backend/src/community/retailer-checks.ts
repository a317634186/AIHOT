import {sql} from '../db.ts';
import {guardedFetch} from '../lib/http-fetch.ts';
import {isCommunitySubmissionUrl} from './submissions.ts';
import {extractRetailerEvidence,sameRetailerPage,type RetailerEvidence} from './retailer-evidence.ts';

type Row={post_id:string;product_url:string;created_at:Date};
async function readRetailerPage(url:string,fetcher:typeof guardedFetch):Promise<RetailerEvidence|null>{
 let current=url;
 for(let hop=0;hop<4;hop++){
  if(!isCommunitySubmissionUrl(current,'product')||!sameRetailerPage(url,current))return null;
  const response=await fetcher(current,{redirect:'manual',timeoutMs:12000,maxBytes:2_000_000,headers:{'accept-language':'en-US,en;q=0.9'}});
  if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)return null;current=new URL(location,current).href;continue;}
  if(response.status!==200)return null;
  return extractRetailerEvidence(response.text(),current);
 }
 return null;
}

/** Work is leased in the database; visitors never trigger retailer fetches. */
export async function checkCommunityRetailerBatch(limit=10,fetcher:typeof guardedFetch=guardedFetch){
 const rows=await sql.begin(async tx=>{
  const due=await tx<Row[]>`SELECT c.post_id,p.product_url,p.created_at FROM community_retailer_checks c JOIN community_posts p ON p.id=c.post_id
   WHERE c.next_check_at<=now() AND p.kind IN ('offer_submission','review_submission') AND p.product_url IS NOT NULL AND p.status IN ('pending_ai','pending_review','reviewing','published')
   ORDER BY c.next_check_at,p.created_at DESC LIMIT ${Math.max(1,Math.min(20,Math.floor(limit)))} FOR UPDATE OF c SKIP LOCKED`;
  if(due.length)await tx`UPDATE community_retailer_checks SET next_check_at=now()+interval '15 minutes',updated_at=now() WHERE post_id=ANY(${due.map(x=>x.post_id)}::text[])`;
  return due;
 });
 let verified=0,unverified=0,outOfStock=0;
 for(const row of rows){
  let evidence:RetailerEvidence|null=null;try{evidence=await readRetailerPage(row.product_url,fetcher);}catch{/* A blocked or unavailable page is not evidence of a price. */}
  const state=evidence?.state??'unverified';if(state==='verified')verified++;else if(state==='out_of_stock')outOfStock++;else unverified++;
  const interval=Date.now()-row.created_at.getTime()>14*86400000?'24 hours':state==='unverified'?'2 hours':'6 hours';
  await sql`UPDATE community_retailer_checks SET state=${state},product_name=${evidence?.productName??null},seller=${evidence?.seller??null},price_cents=${evidence?.priceCents??null},checked_at=now(),next_check_at=now()+${interval}::interval,updated_at=now() WHERE post_id=${row.post_id}`;
 }
 return {checked:rows.length,verified,outOfStock,unverified};
}
