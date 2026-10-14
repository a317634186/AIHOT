import { SITE } from '@aihot/industry/site';
import { SHOPPING_SEO } from '@aihot/industry/seo';
import { CATEGORIES } from '@aihot/industry/taxonomy';
import { MERCHANTS } from '@aihot/industry/shopping';
import { isOffer, type Offer } from '@aihot/contracts/shopping';
import { pageMeta, siteUrl, breadcrumbLd, organizationLd } from './seo';
export function shoppingLanding(path:string){
 const category=CATEGORIES.find(c=>path==='/deals/'+c.key);
 if(category)return {title:category.label+' Deals & Shopping Updates',heading:category.label+' deals',intro:SHOPPING_SEO.categories[category.key],category:category.key,merchant:''};
 const merchant=MERCHANTS.find(m=>path==='/stores/'+m.id);
 if(merchant)return {title:merchant.name+' Deals, Offers & Shopping Updates',heading:merchant.name+' deals & offers',intro:`Browse ${merchant.name} offers reported by our sources. Compare product models, recorded prices, coupon requirements and shipping before visiting the retailer. Savlume is an independent guide.`,category:'',merchant:merchant.id};
 return null;
}
const fixed:Record<string,{title:string;description:string}>={
 '/reviews':{title:'Product Reviews, User Experiences & Buying Guides',description:'Explore independent product reviews, source-reported user experiences, video reviews and AI-assisted buying recommendations with clear pros, cons and original sources.'},
 '/':SHOPPING_SEO.home,'/all':SHOPPING_SEO.home,'/flash':SHOPPING_SEO.flash,'/news':SHOPPING_SEO.news,'/coupons':SHOPPING_SEO.coupons,
 '/archive':{title:'Past Deals & Expired Offers',description:'Browse past shopping offers and their current status. Recorded prices are for reference and may no longer be available.'},
 '/about':{title:'About Savlume: How We Find and Check Deals',description:'Learn how Savlume discovers US shopping offers, uses AI-assisted summaries, records prices and separates source-reported deals from merchant verification.'},
 '/terms':{title:'Terms of Use',description:'Read the terms for using Savlume shopping summaries, deal information and links to external retailers.'},
 '/privacy':{title:'Privacy Notice',description:'How Savlume handles advertising code, anonymous likes, feedback, browser storage and links to other websites.'},
 '/agent':{title:'Shopping Feeds & Developer API',description:'Access Savlume shopping information through RSS, the public API and MCP, including offer status and source attribution.'},
};
/** The crumb each utility page renders in its visible Home trail; the markup names the same string. */
const UTILITY_CRUMB:Record<string,string>={'/about':'About Savlume','/privacy':'Privacy notice','/terms':'Terms of use','/agent':'Feeds & developer access'};
interface SeoItem {id:string;title:string;summary:string;category:string|null;publishedAt:string;updatedAt?:string;indexable?:boolean;sourceUrl:string;offer:Offer}
function itemSearchTitle(item:SeoItem){
 const original=item.title.replace(/\bReported at\b/gi,'at').replace(/\bReported for\b/gi,'for').replace(/\bReported\s+/gi,'').replace(/\s+/g,' ').trim();
 if(original.length<=105||!item.offer.product||item.offer.kind==='buying_guide')return original;
 const d=item.offer;let name=d.product!;
 for(const part of [d.model,d.variant])if(part&&!name.toLowerCase().includes(part.toLowerCase()))name+=' '+part;
 if(d.condition&&d.condition.toLowerCase()!=='new')name+=' ('+d.condition+')';
 if(name.length>95)return original;
 return name+(d.merchant?' at '+d.merchant:'')+' — Offer Details';
}
export function shoppingMeta(input:{path:string;itemId?:string;search:string;category:string;merchant:string;offset:number;data:{items:SeoItem[];total:number}}){
 const base=siteUrl();const landing=shoppingLanding(input.path);const item=input.itemId?input.data.items[0]:undefined;
 const copy=landing?{title:landing.title,description:landing.intro}:fixed[input.path]??{title:'Shopping Information',description:SITE.description};
 const qs=new URLSearchParams();
 if(input.search)qs.set('q',input.search);
 if(input.category&&input.category!==landing?.category)qs.set('category',input.category);
 if(input.merchant&&input.merchant!==landing?.merchant)qs.set('merchant',input.merchant);
 if(input.offset)qs.set('offset',String(input.offset));
 const filtered=!!(input.search||(input.category&&input.category!==landing?.category)||(input.merchant&&input.merchant!==landing?.merchant));
 const canonicalPath=item?'/items/'+item.id:(input.path==='/all'&&!filtered?'/':input.path)+(qs.size?'?'+qs:'');
 const noindex=item?item.indexable===false:filtered||!fixed[input.path]&&!landing||(['/', '/all','/flash','/news','/reviews','/coupons','/archive'].includes(input.path)||!!landing)&&input.data.total===0;
 const compact=(text:string)=>{const clean=text.replace(/\s+/g,' ').trim();return clean.length>165?clean.slice(0,162).replace(/\s+\S*$/,'')+'…':clean;};
 const status=item&&isOffer(item.offer)&&item.offer.status!=='Unverified'?item.offer.status+': ':'';
 const description=compact(item?status+(item.summary||item.title):copy.description);
 const title=item?(['Expired','Out of Stock'].includes(item.offer.status)?item.offer.status+' — ':'')+itemSearchTitle(item):copy.title+(input.offset?' — Page '+(input.offset/24+1):'');
 const organization={...organizationLd(),'@id':base+'/#organization'};
 const website={'@context':'https://schema.org','@type':'WebSite','@id':base+'/#website',name:SITE.name,url:base+'/',description:SITE.description,inLanguage:'en-US',publisher:{'@id':base+'/#organization'}};
 const jsonLd:Record<string,unknown>[]=[organization,website];
 if(item){
  const category=CATEGORIES.find(c=>c.key===item.category);
  jsonLd.push({'@context':'https://schema.org','@type':'WebPage','@id':base+'/items/'+item.id+'#webpage',url:base+'/items/'+item.id,name:title,isPartOf:{'@id':base+'/#website'},mainEntity:{'@id':base+'/items/'+item.id+'#article'}},breadcrumbLd([{name:'Home',path:'/'},...(category?[{name:category.label,path:'/deals/'+category.key}]:[]),{name:item.title,path:'/items/'+item.id}]));
  jsonLd.push({'@context':'https://schema.org','@type':'Article','@id':base+'/items/'+item.id+'#article',headline:item.title,description,mainEntityOfPage:{'@id':base+'/items/'+item.id+'#webpage'},isPartOf:{'@id':base+'/#website'},url:base+'/items/'+item.id,datePublished:item.publishedAt,...(item.updatedAt?{dateModified:item.updatedAt}:{}),inLanguage:'en-US',author:{'@type':'Organization',name:SITE.name,url:base+'/about'},publisher:{'@id':base+'/#organization'},...(item.offer.imageUrl?{image:[item.offer.imageUrl]}:{}),citation:item.sourceUrl,...(category?{articleSection:category.label}:{}),...(item.offer.product?{about:{'@type':'Thing',name:item.offer.product}}:{})});
 }else if(input.data.items.length&&(['/', '/all','/flash','/news','/reviews','/coupons','/archive'].includes(input.path)||landing)){
  jsonLd.push({'@context':'https://schema.org','@type':'CollectionPage','@id':base+canonicalPath+'#webpage',name:title,description,url:base+canonicalPath,isPartOf:{'@id':base+'/#website'},inLanguage:'en-US',mainEntity:{'@type':'ItemList',itemListElement:input.data.items.map((x,i)=>({'@type':'ListItem',position:input.offset+i+1,name:x.title,url:base+'/items/'+x.id}))}});
  // No breadcrumb markup for listing and landing pages: the only items it could state are the site
  // root and the page itself, both of which Google says need no ListItem, and the page shows no
  // visible trail for the markup to describe. Item pages carry a real Home > category > merchant
  // trail and render it; the sticky section/category navigation marks position on these pages.
 }
 if(!item&&!input.data.items.length||['/about','/privacy','/terms','/agent'].includes(input.path)){
  jsonLd.push({'@context':'https://schema.org','@type':input.path==='/about'?'AboutPage':'WebPage','@id':base+canonicalPath+'#webpage',url:base+canonicalPath,name:title,description,isPartOf:{'@id':base+'/#website'}});
  // Utility pages state a real Home > page hierarchy, render the same trail visibly, and the markup
  // names exactly the string that trail shows rather than the longer search title.
  const crumb=UTILITY_CRUMB[input.path];
  if(crumb)jsonLd.push(breadcrumbLd([{name:'Home',path:'/'},{name:crumb,path:input.path}]));
 }
 return [...pageMeta({title,description,path:canonicalPath,noindex,type:item?'article':'website',image:item?'/og/items/'+item.id+'.png':undefined,jsonLd}),...(item?[{tagName:'link' as const,rel:'alternate',type:'text/markdown',href:base+'/items/'+item.id+'/markdown'},{property:'article:published_time',content:item.publishedAt},...(item.updatedAt?[{property:'article:modified_time',content:item.updatedAt}]:[])]:[]),...(!noindex?[{name:'robots',content:'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}]:[])];
}
