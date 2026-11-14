// Crawl discovery uses the same public-shopping visibility and duplicate rules as the web reader.
import { statSync } from 'node:fs';
import path from 'node:path';
import { isReviewContent } from '@aihot/contracts/reviews';
import { brandSlug, isCalibratedRegularPrice, isOffer, itemPath } from '@aihot/contracts/shopping';
import { CATEGORIES } from '@aihot/industry/taxonomy';
import { MERCHANTS } from '@aihot/industry/shopping';
import { BEST_TOPICS } from '@aihot/industry/best-topics';
import { BLOG_POSTS_META } from '@aihot/industry/blog';
import { REPO_ROOT } from '../config.ts';
import { sql } from '../db.ts';
import { shoppingItems } from './shopping.ts';
export const SHOPPING_SITEMAP_SIZE=5000;
export const MIN_INDEXABLE_LANDING_ITEMS=3;

export interface SeoCatalog {
 total:number;
 latest:string|null;
 pagesLastmod:string|null;
 itemPageLastmods:string[];
 sections:{
  deals:string|null;
  coupons:string|null;
  reviews:string|null;
  news:string|null;
  community:string|null;
  blackFriday:string|null;
  cyberMonday:string|null;
 };
 seasonalCounts:{
  blackFriday:number;
  cyberMonday:number;
 };
 staticLastmods:{
  about:string|null;
  privacy:string|null;
  terms:string|null;
  categories:string|null;
  stores:string|null;
  brands:string|null;
 };
 categories:Array<{key:string;count:number;latest:string;seoTitle:string|null}>;
 merchants:Array<{key:string;count:number;latest:string;seoTitle:string|null}>;
 brands:Array<{key:string;slug:string;label:string;count:number;latest:string;seoTitle:string|null}>;
}
export interface ShoppingPageSitemapEntry { path: string; lastmod: string | null; priority: string; changefreq: string }
let catalogCache:{expiresAt:number;value:SeoCatalog}|null=null;
let catalogPending:Promise<SeoCatalog>|null=null;

export function resetShoppingSeoCatalogCache(){
 catalogCache=null;
 catalogPending=null;
}
function maxIso(...dates:Array<string|null|undefined>):string|null{
 let best:string|null=null;
 for(const d of dates){
  if(!d||!Number.isFinite(Date.parse(d)))continue;
  if(!best||Date.parse(d)>Date.parse(best))best=d;
 }
 return best;
}

function fileMtimeIso(...relativePaths:string[]):string|null{
 let latestMs=0;
 for(const rel of relativePaths){
  try{
   const st=statSync(path.join(REPO_ROOT,rel));
   if(st.mtimeMs>latestMs)latestMs=st.mtimeMs;
  }catch{}
 }
 return latestMs>0?new Date(latestMs).toISOString():null;
}

export async function shoppingSeoCatalog():Promise<SeoCatalog>{
 if(catalogCache&&catalogCache.expiresAt>Date.now())return catalogCache.value;
 if(catalogPending)return catalogPending;
 const pending=(async()=>{
  const [{items},[communityRow],hubRows]=await Promise.all([
   shoppingItems({view:'any',limit:20_000,scanAll:true}),
   sql<{latest:Date|null}[]>`SELECT max(coalesce(published_at,updated_at)) AS latest FROM community_posts WHERE status='published'`,
   sql<{path:string;seo_title:string}[]>`SELECT path, seo_title FROM shopping_hub_seo_titles`,
  ]);
  const eligible=items.filter(item=>item.indexable);
  const categories=new Map<string,{count:number;latest:string}>();
  const merchants=new Map<string,{count:number;latest:string}>();
  const brands=new Map<string,{label:string;count:number;latest:string}>();
  const bump=(map:Map<string,{count:number;latest:string}>,key:string,count:number,at:string)=>{
   const prior=map.get(key);map.set(key,{count:(prior?.count??0)+count,latest:prior&&Date.parse(prior.latest)>Date.parse(at)?prior.latest:at});
  };
  let latest:string|null=null;
  let dealsLatest:string|null=null,couponsLatest:string|null=null,reviewsLatest:string|null=null,newsLatest:string|null=null;
  let bfLatest:string|null=null,cmLatest:string|null=null,bfCount=0,cmCount=0;
  const bfPattern=/\b(?:black\s+friday|doorbuster|holiday\s+(?:savings|sale|deals|ad)|early\s+holiday)\b/i;
  const cmPattern=/\b(?:cyber\s+monday|cyber\s+week)\b/i;
  const itemPageLastmods:string[]=[];
  for(const item of eligible){
   const at=item.updatedAt??item.publishedAt;
   latest=maxIso(latest,at);
   const isReview=isReviewContent(item.offer,item.title);
   const offerLike=isOffer(item.offer)||['event','storewide'].includes(item.offer.activityScope??'');
   const liveOffer=!['Expired','Out of Stock'].includes(item.offer.status)&&item.timing?.state!=='ended'&&item.timing?.state!=='likely-ended';
   const regularPrice=isOffer(item.offer)&&isCalibratedRegularPrice(item.offer)&&item.priceDisplay?.state==='current'&&item.priceDisplay.amountCents!==null;
   const browseableOffer=liveOffer||regularPrice;
   if(offerLike)dealsLatest=maxIso(dealsLatest,at);
   if(isOffer(item.offer)&&(['coupon_offer','cashback_offer','freebie'].includes(item.offer.kind)||item.offer.coupon||item.offer.cashback))couponsLatest=maxIso(couponsLatest,at);
   if(isReview)reviewsLatest=maxIso(reviewsLatest,at);
   if(!isOffer(item.offer)&&!isReview)newsLatest=maxIso(newsLatest,at);
   if(liveOffer&&!regularPrice&&(bfPattern.test(`${item.title} ${item.summary}`)||['event','storewide'].includes(item.offer.activityScope??''))){bfCount++;bfLatest=maxIso(bfLatest,at);}
   if(liveOffer&&!regularPrice&&(cmPattern.test(`${item.title} ${item.summary}`)||['electronics','software'].includes(item.category??''))){cmCount++;cmLatest=maxIso(cmLatest,at);}
   if(browseableOffer&&item.category)bump(categories,item.category,1,at);
   if(browseableOffer&&item.offer.merchantId)bump(merchants,item.offer.merchantId,1,at);
   if(item.offer.brand&&isOffer(item.offer)&&browseableOffer){const key=item.offer.brand.trim().toLowerCase(),prior=brands.get(key);brands.set(key,{label:prior?.label??item.offer.brand.trim(),count:(prior?.count??0)+1,latest:prior&&Date.parse(prior.latest)>Date.parse(at)?prior.latest:at});}
  }
  for(let start=0;start<eligible.length;start+=SHOPPING_SITEMAP_SIZE){
   let sliceMax:string|null=null;
   for(const item of eligible.slice(start,start+SHOPPING_SITEMAP_SIZE))sliceMax=maxIso(sliceMax,item.updatedAt??item.publishedAt);
   if(sliceMax)itemPageLastmods.push(sliceMax);
  }
  const staticLastmods={
   about:fileMtimeIso('industry/site.ts','industry/shopping.ts'),
   privacy:fileMtimeIso('industry/pages/privacy.md'),
   terms:fileMtimeIso('industry/pages/terms.md'),
   categories:fileMtimeIso('industry/taxonomy.ts'),
   stores:fileMtimeIso('industry/shopping.ts'),
   brands:fileMtimeIso('packages/contracts/src/shopping.ts'),
  };
  const communityLatest=communityRow?.latest?communityRow.latest.toISOString():null;
  const minLanding=eligible.length>=10?MIN_INDEXABLE_LANDING_ITEMS:1;
  const hubTitles=new Map(hubRows.map(row=>[row.path,row.seo_title]));
  const categoryList=[...categories].map(([key,v])=>({key,...v,seoTitle:hubTitles.get('/deals/'+key)??null}));
  const merchantList=[...merchants].map(([key,v])=>({key,...v,seoTitle:hubTitles.get('/stores/'+key)??null}));
  const brandList=[...brands]
   .map(([key,v])=>{const slug=brandSlug(v.label);return {key,slug,...v,seoTitle:hubTitles.get('/brands/'+slug)??null};})
   .filter(b=>b.slug.length>=2)
   .sort((a,b)=>a.label.localeCompare(b.label));
  const pagesLastmod=maxIso(
   dealsLatest,couponsLatest,reviewsLatest,newsLatest,communityLatest,bfLatest,cmLatest,
   staticLastmods.about,staticLastmods.privacy,staticLastmods.terms,staticLastmods.categories,staticLastmods.stores,staticLastmods.brands,
   ...categoryList.filter(c=>c.count>=minLanding).map(c=>c.latest),
   ...merchantList.filter(m=>m.count>=minLanding).map(m=>m.latest),
   ...brandList.filter(b=>b.count>=minLanding).map(b=>b.latest),
  );
  const value:SeoCatalog={
   total:eligible.length,
   latest,
   pagesLastmod,
   itemPageLastmods,
   sections:{deals:dealsLatest,coupons:couponsLatest,reviews:reviewsLatest,news:newsLatest,community:communityLatest,blackFriday:bfLatest,cyberMonday:cmLatest},
   seasonalCounts:{blackFriday:bfCount,cyberMonday:cmCount},
   staticLastmods,
   categories:categoryList,
   merchants:merchantList,
   brands:brandList,
  };
  catalogCache={expiresAt:Date.now()+600_000,value};return value;
 })();
 catalogPending=pending;
 try{return await pending;}finally{if(catalogPending===pending)catalogPending=null;}
}

export async function shoppingSitemapEntries(page:number){
 const {items}=await shoppingItems({view:'any',limit:SHOPPING_SITEMAP_SIZE,offset:(page-1)*SHOPPING_SITEMAP_SIZE,scanAll:true,indexableOnly:true});
 return items.map(item=>({path:itemPath(item),modified:item.updatedAt??item.publishedAt}));
}

export function shoppingPagesSitemapEntries(catalog:SeoCatalog,bestPages:Array<{slug:string;lastmod:string}>,comparisonPages:Array<{slug:string;lastmod?:string}> = []):ShoppingPageSitemapEntry[]{
 const minCount=catalog.total>=10?MIN_INDEXABLE_LANDING_ITEMS:1;
 const categories=new Map(catalog.categories.map(c=>[c.key,c.latest]));
 const merchants=new Map(catalog.merchants.map(m=>[m.key,m.latest]));
 const brands=catalog.brands.filter(b=>b.count>0);
 const priority=(path:string):[string,string]=>path==='/'?['1.0','hourly']:path==='/best'||path==='/compare'?['0.9','daily']:path.startsWith('/best/')||path.startsWith('/compare/')?['0.85','daily']:path.startsWith('/deals/')||path.startsWith('/stores/')?['0.8','daily']:['/about','/privacy','/terms'].includes(path)?['0.5','monthly']:['0.6','daily'];
 const entries:Array<ShoppingPageSitemapEntry>=[];
 const add=(path:string,lastmod:string|null)=>{const [rank,changefreq]=priority(path);entries.push({path,lastmod,priority:rank,changefreq});};
 add('/',catalog.sections.deals??catalog.latest);
 add('/black-friday',catalog.sections.blackFriday??catalog.latest);
 add('/cyber-monday',catalog.sections.cyberMonday??catalog.latest);
 add('/categories',catalog.staticLastmods.categories);
 add('/stores',catalog.staticLastmods.stores);
 if(brands.length)add('/brands',catalog.staticLastmods.brands);
 add('/coupons',catalog.sections.coupons??catalog.latest);
 add('/reviews',catalog.sections.reviews??catalog.latest);
 add('/news',catalog.sections.news??catalog.latest);
 if(catalog.sections.community)add('/community',catalog.sections.community);
 add('/about',catalog.staticLastmods.about);
 add('/privacy',catalog.staticLastmods.privacy);
 add('/terms',catalog.staticLastmods.terms);
 add('/compare',catalog.latest);
 add('/blog',BLOG_POSTS_META.map(post=>post.modified).sort().at(-1)??catalog.latest);
 const bestPageMap=new Map(bestPages.map(page=>[page.slug,page.lastmod]));
 const defaultBestLastmod=catalog.latest??catalog.staticLastmods.categories??new Date().toISOString();
 for(const topic of BEST_TOPICS)if(!bestPageMap.has(topic.slug))bestPageMap.set(topic.slug,defaultBestLastmod);
 const completeBestPages=[...bestPageMap].map(([slug,lastmod])=>({slug,lastmod}));
 add('/best',completeBestPages.map(page=>page.lastmod).sort().at(-1)??defaultBestLastmod);
 for(const category of CATEGORIES)add('/deals/'+category.key,categories.get(category.key)??catalog.staticLastmods.categories);
 for(const merchant of MERCHANTS)if(merchants.has(merchant.id))add('/stores/'+merchant.id,merchants.get(merchant.id)!);
 for(const brand of brands)add('/brands/'+brand.slug,brand.latest);
 for(const page of completeBestPages)add('/best/'+page.slug,page.lastmod);
 for(const page of comparisonPages)add('/compare/'+page.slug,page.lastmod??catalog.latest);
 for(const post of BLOG_POSTS_META)add('/blog/'+post.slug,post.modified);
 return [...new Map(entries.map(entry=>[entry.path,entry])).values()];
}
