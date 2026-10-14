// Crawl discovery uses the same public-shopping visibility boundaries as the web reader.
import { sql } from '../db.ts';
export const SHOPPING_SITEMAP_SIZE=5000;
const eligible=sql`p.visibility='public' AND p.eligible AND a.processing_state<>'blocked'
 AND s.participation_mode='editorial' AND p.timeline_at<=now()+interval '5 minutes'
 AND p.seo_excluded_at IS NULL AND NULLIF(btrim(p.summary),'') IS NOT NULL`;
export async function shoppingSeoCatalog(){
 const rows=await sql<{category:string|null;merchant:string|null;count:number;latest:Date}[]>`SELECT p.category,d.data->>'merchantId' AS merchant,count(*)::int AS count,
  max(GREATEST(p.updated_at,d.content_updated_at)) AS latest
 FROM publications p JOIN articles a ON a.id=p.article_id JOIN sources s ON s.id=p.source_id JOIN shopping_offers d ON d.article_id=p.article_id
 WHERE ${eligible} GROUP BY p.category,d.data->>'merchantId'`;
 // Counts and the newest real content timestamp per grouping: landing pages carry a truthful lastmod
 // instead of none, and the number is never the capped list total.
 const categories=new Map<string,{count:number;latest:Date}>();
 const merchants=new Map<string,{count:number;latest:Date}>();
 const bump=(map:Map<string,{count:number;latest:Date}>,key:string,count:number,at:Date)=>{
  const prior=map.get(key);
  map.set(key,{count:(prior?.count??0)+count,latest:prior&&prior.latest>at?prior.latest:at});
 };
 let total=0;let latest:Date|null=null;
 for(const r of rows){
  total+=r.count;
  if(!latest||r.latest>latest)latest=r.latest;
  if(r.category)bump(categories,r.category,r.count,r.latest);
  if(r.merchant)bump(merchants,r.merchant,r.count,r.latest);
 }
 return {total,latest:latest?latest.toISOString():null,
  categories:[...categories].map(([key,v])=>({key,count:v.count,latest:v.latest.toISOString()})),
  merchants:[...merchants].map(([key,v])=>({key,count:v.count,latest:v.latest.toISOString()}))};
}
export async function shoppingSitemapEntries(page:number){
 const rows=await sql`SELECT p.article_id,GREATEST(p.updated_at,d.content_updated_at) AS modified
 FROM publications p JOIN articles a ON a.id=p.article_id JOIN sources s ON s.id=p.source_id JOIN shopping_offers d ON d.article_id=p.article_id
 WHERE ${eligible} ORDER BY p.article_id LIMIT ${SHOPPING_SITEMAP_SIZE} OFFSET ${(page-1)*SHOPPING_SITEMAP_SIZE}`;
 return rows.map(r=>({path:'/items/'+r.article_id,modified:r.modified.toISOString()}));
}
