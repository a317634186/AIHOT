// Check deployed SSR metadata and crawl discovery without executing advertising scripts.
import assert from 'node:assert/strict';
import { load } from 'cheerio';
const base=(process.argv[2]??'http://localhost:3000').replace(/\/$/,'');
const get=async(path:string)=>{const r=await fetch(base+path);assert.equal(r.status,200,path);return load(await r.text());};
const home=await get('/');const canonical=home('link[rel=canonical]').attr('href')!;const canonicalBase=new URL(canonical).origin;
assert.equal(home('h1').length,1);assert.match(home('title').text(),/US Shopping Deals/);assert.match(home('meta[name=robots]').attr('content')!,/^index/);
assert.ok(home('a[href="/?offset=24"]').length);assert.ok(home('a[href^="/deals/"]').length);assert.ok(home('a[href^="/stores/"]').length);
const index=load(await fetch(base+'/sitemap.xml').then(r=>r.text()),{xmlMode:true});assert.equal(index('sitemapindex').length,1);
const urls:string[]=[];
for(const node of index('loc').toArray()){const url=index(node).text();assert.equal(new URL(url).origin,canonicalBase);const r=await fetch(url);assert.equal(r.status,200);const $=load(await r.text(),{xmlMode:true});urls.push(...$('url>loc').toArray().map(n=>$(n).text()));for(const n of $('lastmod').toArray())assert.ok(Number.isFinite(Date.parse($(n).text())));}
assert.equal(new Set(urls).size,urls.length);
const data=await fetch(base+'/api/shopping?view=recommended&limit=100&catalog=1').then(r=>r.json());
const itemUrls=urls.filter(u=>new URL(u).pathname.startsWith('/items/'));
assert.equal(itemUrls.length,data.catalog.total);
assert.ok(urls.some(u=>u.includes('/deals/')));assert.ok(urls.some(u=>u.includes('/stores/')));
for(const url of [urls.find(u=>u.includes('/deals/'))!,urls.find(u=>u.includes('/stores/'))!,...itemUrls.slice(0,3)]){
 const path=new URL(url).pathname;const $=await get(path);assert.equal($('link[rel=canonical]').attr('href'),url);assert.equal($('h1').length,1,path);assert.ok($('meta[name=description]').attr('content')!.length>30);assert.match($('meta[name=robots]').attr('content')!,/^index/);JSON.parse($('script[type="application/ld+json"]').text());
 if(path.startsWith('/items/')){const og=await fetch($('meta[property="og:image"]').attr('content')!);assert.equal(og.status,200);assert.match(og.headers.get('content-type')!,/image\/png/);assert.ok(!$('script[type="application/ld+json"]').text().includes('aggregateRating'));}
}
const search=await get('/all?q=vacuum');assert.match(search('meta[name=robots]').attr('content')!,/noindex/);
const next=await get('/?offset=24');assert.equal(next('link[rel=canonical]').attr('href'),canonicalBase+'/?offset=24');
const tracked=await get('/?utm_source=test');assert.equal(tracked('link[rel=canonical]').attr('href'),canonical);
for(const path of ['/stores/invalid','/deals/invalid','/?offset=invalid','/?offset='+String((Math.ceil(data.total/24)+10)*24)])assert.equal((await fetch(base+path)).status,404,path);
console.log(JSON.stringify({sitemapUrls:urls.length,itemUrls:itemUrls.length,categoryAndMerchantPages:'passed',metadata:'passed',pagination:'passed',jsonLd:'passed',itemShareImages:'passed'}));
