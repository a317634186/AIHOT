// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only.
import assert from "node:assert/strict";
import { load } from "cheerio";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { mkdir,writeFile,rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CATEGORY_KEYS } from "@aihot/contracts/taxonomy";
import { releaseBoundCache } from "../app/lib/api.server.ts";

let web: ChildProcess;
let origin: string;
let logs = "";
let deadline: number;
let refreshAt: string;
let metaDelayMs = 0;
const apiCookies: Array<string | undefined> = [];
const shoppingRequests: URL[] = [];
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  apiCookies.push(req.headers.cookie);
  res.setHeader("Content-Type", "application/json");
  if (url.pathname === "/api/site/meta") {
    const respond = () => res.end(JSON.stringify({ changelogVersion: "2026-09-28T12:00" }));
    return metaDelayMs ? setTimeout(respond, metaDelayMs) : respond();
  }
  if (url.pathname === "/api/community/feed") return res.end(JSON.stringify({items:[],hasMore:false}));
  if (url.pathname === "/api/shopping") {
    shoppingRequests.push(url);
    res.setHeader("Cache-Control","no-store");
    if(url.searchParams.get('q')==='seo-fixture'||['seo-item','seo-expired'].includes(url.searchParams.get('id')??'')){
     const offset=Number(url.searchParams.get('offset')??0);
     const item={id:url.searchParams.get('id')??'seo-item',title:'DEMO vacuum at Target',summary:'A source-reported vacuum offer with a coupon and pickup restrictions. Check the exact model and retailer terms before ordering. </script><script>alert(1)</script>',category:'home',indexable:true,publishedAt:'2026-10-11T12:00:00Z',updatedAt:'2026-10-11T13:00:00Z',source:'Test source',sourceUrl:'https://example.invalid/source',sources:[],offer:{kind:'product_deal',product:'DEMO vacuum',model:'DEMO1',merchant:'Target',merchantId:'target',status:url.searchParams.get('id')==='seo-expired'?'Expired':'Unverified',listedPriceCents:10000,checkoutPriceCents:9000,restrictions:[],steps:[],buyUrl:'https://example.invalid/product',imageUrl:null}};
     return res.end(JSON.stringify({items:url.searchParams.get('id')?[item]:offset<48?Array.from({length:24},(_,i)=>({...item,id:'seo-item-'+(offset+i)})):[],total:48,hasMore:offset===0,briefing:null,catalog:{categories:[{key:'home',count:48}],merchants:[{key:'target',count:48}]}}));
    }
    return res.end(JSON.stringify({items:[],total:0,hasMore:false,briefing:null}));
  }
  if (url.pathname === "/api/site/timeline") {
    const filters = { channel: "all", category: url.searchParams.get("category"), tag: null, topic: null };
    res.setHeader("X-Accel-Expires", `@${deadline}`);
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    return res.end(JSON.stringify({ filters, cards: [], nextCursor: null, refreshAt, dayCounts: [], hot: null, generatedAt: "2026-09-28T00:00:00Z" }));
  }
  if (url.pathname === "/api/site/hot") return res.end(JSON.stringify({ entries: [] }));
  if (url.pathname === "/api/site/echo-client") return res.end(JSON.stringify({ forwarded: req.headers["x-forwarded-for"], real: req.headers["x-real-ip"] }));
  if (url.pathname === "/api/site/items/long-lived") return res.end(JSON.stringify({ id: "long-lived", title: "t" }));
  if (url.pathname === "/api/site/contact") return res.end(JSON.stringify({ wechatQr: "/qr.png", feishuQr: "/qr.png" }));
  if (url.pathname === "/api/site/stories/merged") {
    res.statusCode = 308;
    return res.end(JSON.stringify({ mergedInto: "surviving-story" }));
  }
  res.statusCode = url.pathname.startsWith("/api/admin/") ? 401 : 404;
  res.end(JSON.stringify({ code: "not_found" }));
});

before(async () => {
  deadline = Math.floor(Date.now() / 1000) + 20;
  refreshAt = new Date((deadline + 5) * 1000).toISOString();
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", TRUST_PROXY: "false", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`web did not start: ${logs}`)), 15_000);
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(`web exited: ${logs}`)); });
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await once(web, "exit");
  }
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});


test("shopping HTML and navigation always use fresh public data, independent of cookies", async () => {
  for (const path of ["/", "/_.data", "/_.data?_routes=shopping-home", "/.data", "/all", "/all.data", "/all.data?_routes=root", "/deals/electronics.data"]) {
    const r=await fetch(origin+path,{headers:{cookie:"private=test"}});
    // Public pages may sit in a shared cache briefly, but a browser revalidates on every navigation and
    // nothing in the response depends on the visitor's cookie.
    const cc=r.headers.get("cache-control")??"";assert.equal(r.status,200,path);assert.match(cc,/no-store|no-cache|max-age=0/);assert.doesNotMatch(cc,/private/);assert.equal(r.headers.get("set-cookie"),null,path);
    const body=await r.text();assert.ok(body.includes("Savlume")||body.includes("items"));
  }
  assert.ok(apiCookies.every(cookie=>!cookie));
});
test("missing and disabled pages are 404 and cannot be hidden by root-only navigation",async()=>{
 for(const path of ["/items/missing","/leaderboard","/codex-reset","/unknown"]){const r=await fetch(origin+path);assert.equal(r.status,404,path);assert.match(r.headers.get("cache-control")??"",/no-store/);}
});
test("category and retailer filters are sent to the API",async()=>{
 const r=await fetch(origin+"/all?category=electronics&merchant=target&q=vacuum");assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes("vacuum"));
});
test('shared brand text is consistent on home, reviews, news, and utility pages',async()=>{
 for(const path of ['/','/reviews','/community','/news','/about','/deals/electronics','/stores/amazon']){
  const response=await fetch(origin+path);assert.equal(response.status,200,path);
  const cc=response.headers.get('cache-control')??'';assert.match(cc,/max-age=0/);assert.match(cc,path==='/community'?/s-maxage=30/:/s-maxage=60/);
  const html=await response.text(),page=load(html);
  assert.equal(page('.db-header .db-tagline').text(),'Find Deals. Save Smarter.',path);
  assert.equal(page('.db-footer > div:first-child p').text(),'Find Deals. Save Smarter.',path);
  assert.doesNotMatch(html,/AI Picks\. Better Deals\./);
  assert.match(page('meta[property="og:image"]').attr('content')??'',/brand=Savlume-Find%20Deals\.%20Save%20Smarter\./);
 }
});
test("primary shopping navigation, directories and secondary resources lead to usable pages",async()=>{
 const home=load(await (await fetch(origin+'/')).text());
 assert.deepEqual(home('.db-primary-nav a').map((_,a)=>home(a).text()).get(),['AI Best Picks','Categories','Stores','Community','Buying Guides']);
 assert.equal(home('.db-secondary-nav').length,0);
 assert.deepEqual(home('.db-mobile-tabs a').map((_,a)=>home(a).text().replace(/^[^A-Za-z]+/,'')).get(),['Home','Stores','Community','Guides','Saved']);
 assert.equal(home('.db-mobile-search').attr('action'),'/');
 assert.equal(home('.db-header-saved').attr('href'),'/saved');assert.equal(home('.db-header-account').attr('href'),'/community/account');
 assert.ok(shoppingRequests.some(u=>u.searchParams.get('view')==='deals'));
 const categories=load(await (await fetch(origin+'/categories')).text());
 assert.equal(categories('h1').first().text(),'Shop by category');assert.equal(categories('.db-directory a[href="/deals/electronics"]').length,1);
 const stores=load(await (await fetch(origin+'/stores')).text());
 assert.equal(stores('h1').first().text(),'Shop by store');assert.equal(stores('.db-directory a[href="/stores/amazon"]').length,1);
 const more=load(await (await fetch(origin+'/more')).text());
 for(const link of ['/reviews','/saved','/community/account'])assert.ok(more('.db-directory a[href="'+link+'"]').length,link);
 assert.equal(more('.db-directory a[href="/news"]').length,0);
 for(const path of ['/deals/electronics','/stores/amazon']){const response=await fetch(origin+path);assert.equal(response.status,200);}
 assert.ok(shoppingRequests.some(u=>u.searchParams.get('view')==='deals'&&u.searchParams.get('category')==='electronics'));
 assert.ok(shoppingRequests.some(u=>u.searchParams.get('view')==='deals'&&u.searchParams.get('merchant')==='amazon'));
 for(const path of ['/best','/reviews','/news']){const guide=load(await (await fetch(origin+path)).text());assert.equal(guide('.db-primary-nav [aria-current=page]').text(),'Buying Guides');assert.deepEqual(guide('.db-secondary-nav a').map((_,a)=>guide(a).attr('href')).get(),['/reviews','/news']);assert.equal(guide('.db-secondary-nav [aria-current=page]').attr('href'),path);}
});
test("Picks requests the full feed, News keeps its original news view, and the middle tab opens flash deals",async()=>{
 for(const [path,view,label] of [["/","recommended","Recommended"],["/flash","flash","Best Deals"],["/news","news","News"]]){
  const r=await fetch(origin+path+"?category=electronics&merchant=target&q=vacuum");
  assert.equal(r.status,200);
  const html=await r.text();
  const $=load(html);const nav=$('.db-category-nav');const bottom=$('.db-mobile-tabs');
  assert.equal($('.db-nav').length,0);assert.equal(nav.find('.db-category-options a').length,10);
  assert.equal(nav.find('.db-category-options [aria-current=page]').text(),'Electronics & Gaming');
  assert.equal(bottom.find('a').length,3);
  assert.equal(bottom.find('[aria-current=page]').text().replace(/^[^A-Za-z]+/,''),path==='/'?'Recommended':label);
  assert.ok(!/\p{Script=Han}/u.test($('body').text()));
  assert.ok(bottom.find('a[href^="/news?"]').length);assert.ok(bottom.find('a[href^="/flash?"]').length);
  assert.ok(nav.find('a').toArray().every(el=>!$(el).attr('href')!.includes('offset=')));
  assert.equal($('select[name=category]').length,0);assert.equal($('input[name=category]').val(),'electronics');
  if(path==='/flash')assert.match(html,/No matching deals right now/);
  const request=shoppingRequests.at(-1)!;
  assert.equal(request.searchParams.get('view'),view);
  for(const [key,value] of Object.entries({category:'electronics',merchant:'target',q:'vacuum'}))assert.equal(request.searchParams.get(key),value);
 }
});
test("admin data remains private and client IP headers cannot be forged",async()=>{
 const r=await fetch(origin+"/admin",{redirect:"manual"});assert.ok([302,303].includes(r.status));assert.match(r.headers.get("cache-control")??"",/no-store/);
 const j=await fetch(origin+"/api/site/echo-client",{headers:{"x-forwarded-for":"1.2.3.4","x-real-ip":"1.2.3.4"}}).then(r=>r.json());assert.notEqual(j.real,"1.2.3.4");
});

test('SEO metadata is specific, canonical, safe and crawlable without JavaScript',async()=>{
 const fetchPage=async(path:string)=>{const r=await fetch(origin+path);assert.equal(r.status,200,path);return load(await r.text());};
 const home=await fetchPage('/?utm_source=test');assert.match(home('title').text(),/US Shopping Deals/);
 assert.ok(!home('link[rel=canonical]').attr('href')!.includes('utm_source'));
 assert.equal(home('script[type="application/ld+json"]').length,1);
 assert.ok(JSON.parse(home('script[type="application/ld+json"]').text()).some((x:any)=>x['@type']==='WebSite'));
 const item=await fetchPage('/items/seo-item?utm_source=test');
 assert.match(item('title').text(),/DEMO vacuum/);assert.doesNotMatch(item('meta[name=description]').attr('content')!,/^Unverified:/);assert.equal(item('.db-status').length,0);
 const expired=await fetchPage('/items/seo-expired');assert.match(expired('.db-timing.ended').text(),/^Ended/);assert.match(expired('meta[name=description]').attr('content')!,/^Expired:/);
 assert.ok(item('link[rel=canonical]').attr('href')!.endsWith('/items/seo-item'));
 assert.ok(item('meta[property="og:image"]').attr('content')!.endsWith('/og/items/seo-item.png'));
 assert.equal(item('script').toArray().filter(el=>item(el).text()==='alert(1)').length,0);
 const ld=JSON.parse(item('script[type="application/ld+json"]').text());
 const article=ld.find((x:any)=>x['@type']==='Article');assert.equal(article.headline,'DEMO vacuum at Target');
 assert.ok(ld.some((x:any)=>x['@id']?.endsWith('/#organization')));
 assert.ok(ld.some((x:any)=>x['@type']==='WebSite'));
 assert.ok(item('link[rel=alternate][type="text/markdown"]').attr('href')!.endsWith('/items/seo-item/markdown'));
 assert.ok(item('.db-source-record').text().includes('Sources & checks'));
 assert.equal(item('#buying-answers').length,0);
 assert.ok(item('body').text().includes('Content updated:'));assert.ok(!('offers' in article)&&!('aggregateRating' in article));
 assert.ok(ld.some((x:any)=>x['@type']==='BreadcrumbList'));
 assert.equal(item('h1').length,1);
 const tracked=await fetchPage('/items/seo-item?offset=24&category=invalid');assert.ok(tracked('link[rel=canonical]').attr('href')!.endsWith('/items/seo-item'));
 const search=await fetchPage('/all?q=seo-fixture&utm_source=test');assert.doesNotMatch(search('meta[name=robots]').attr('content')??'',/noindex/i);assert.equal(search('.db-status').length,0);
 assert.ok(search('a[href="/all?q=seo-fixture&offset=24"]').length>0);
 const next=await fetchPage('/all?q=seo-fixture&offset=24');assert.ok(next('link[rel=canonical]').attr('href')!.includes('offset=24'));
 assert.ok(next('a[href="/all?q=seo-fixture"]').length>0);
 const category=await fetchPage('/deals/electronics');assert.match(category('title').text(),/Electronics/);assert.equal(category('h1').length,1);assert.doesNotMatch(category('meta[name=robots]').attr('content')??'',/noindex/i);
 const merchant=await fetchPage('/stores/target');assert.match(merchant('title').text(),/Target Deals/);
 const redirect=await fetch(origin+'/all?category=electronics',{redirect:'manual'});assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),'/deals/electronics');
 for(const path of ['/deals/not-real','/stores/not-real','/?offset=-1','/?offset=foo','/?offset=23','/all?q=seo-fixture&offset=48'])assert.equal((await fetch(origin+path)).status,404,path);
});

test('top categories always select AI Picks while preserving search/retailer and clearing pagination',async()=>{
 const r=await fetch(origin+'/flash?category=electronics&merchant=target&q=vacuum');const $=load(await r.text());
 assert.equal($('.db-category-options a').length,10);
 assert.equal($('.db-category-options [aria-current=page]').text(),'Electronics & Gaming');
 const home=$('.db-category-options a').filter((_,el)=>$(el).text()==='Home & Kitchen').attr('href')!;
 const url=new URL(home,origin);assert.equal(url.pathname,'/deals/home');assert.ok(!url.searchParams.has('category'));assert.equal(url.searchParams.get('merchant'),'target');assert.equal(url.searchParams.get('q'),'vacuum');assert.ok(!url.searchParams.has('offset'));
 const all=new URL($('.db-category-options a').first().attr('href')!,origin);assert.equal(all.pathname,'/stores/target');assert.ok(!all.searchParams.has('category'));
 const main=load(await fetch(origin+'/').then(r=>r.text()));assert.equal(main('.db-category-nav a[href="/deals/electronics"]').length,1);
 const store=load(await fetch(origin+'/stores/target').then(r=>r.text()));assert.equal(store('.db-category-nav a[href="/deals/home?merchant=target"]').length,1);
 for(const section of ['/','/flash','/news','/coupons','/archive','/deals/home']){
  const page=load(await fetch(origin+section).then(r=>r.text()));
  assert.equal(page('.db-category-options a[href="/deals/electronics"]').length,1,section);
  assert.equal(page('.db-category-options a').first().attr('href'),'/',section);
 }
 const login=load(await fetch(origin+'/admin/login').then(r=>r.text()));assert.ok(!/\p{Script=Han}/u.test(login('body').text()));
});

test('Reviews & Picks follows News on top, has dedicated metadata and leaves three bottom tabs',async()=>{
 const response=await fetch(origin+'/reviews');assert.equal(response.status,200);const $=load(await response.text());
 assert.deepEqual($('.db-top-sections a').toArray().map(a=>$(a).text()),['Recommended','Best Deals','News','Reviews & Picks']);
 assert.equal($('.db-top-sections [aria-current=page]').text(),'Reviews & Picks');assert.equal($('.db-mobile-tabs a').length,3);assert.ok(!$('.db-mobile-tabs').text().includes('Reviews'));
 assert.match($('title').text(),/Product Reviews/);assert.equal($('h1').text(),'Reviews & Picks');assert.equal(shoppingRequests.at(-1)!.searchParams.get('view'),'reviews');
 assert.equal($('.db-category-options a[href="/deals/electronics"]').length,1);
});

test('encoded static paths cannot read sibling directories outside the public client build',async()=>{
 const name='client-security-'+Math.random().toString(36).slice(2);const dir=new URL('../build/'+name+'/',import.meta.url);
 await mkdir(dir,{recursive:true});await writeFile(new URL('token.txt',dir),'DEMO_PRIVATE_FILE_MUST_NOT_BE_PUBLIC');
 try{const response=await fetch(origin+'/%2e%2e%2f'+name+'/token.txt');assert.equal(response.status,404);assert.ok(!(await response.text()).includes('DEMO_PRIVATE_FILE_MUST_NOT_BE_PUBLIC'));}finally{await rm(dir,{recursive:true,force:true});}
});
