// Real browser + built web server, using only a local synthetic API. No external services.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';

const chrome = process.env.CHROME_BIN || ['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
const pause = (ms:number) => new Promise(resolve => setTimeout(resolve,ms));
async function started(child:ChildProcess, pattern:RegExp, stream:'stdout'|'stderr') {
 return new Promise<string>((resolve,reject)=>{
  let output='';
  const timeout=setTimeout(()=>reject(new Error('Server/browser startup timed out: '+output.slice(-1000))),15000);
  child[stream]!.on('data',chunk=>{output+=chunk;const match=output.match(pattern);if(match){clearTimeout(timeout);resolve(match[1]!);}});
  child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Process exited: '+code));});
 });
}

test('infinite feed appends, retries, deduplicates, ends, and resets across views and filters', {skip:!chrome,timeout:60000}, async t=>{
 const requests:URL[]=[];let failNext=true;let delayedNews=false;
 const api=createServer((req,res)=>{
  const url=new URL(req.url!,'http://local');res.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:'test'}));
  if(url.pathname!=='/api/shopping'){res.statusCode=404;return res.end('{}');}
  requests.push(url);const offset=Number(url.searchParams.get('offset')||0);const view=url.searchParams.get('view');
  if(offset===24&&view==='recommended'&&failNext){failNext=false;res.statusCode=503;return res.end('{}');}
  const filter=['q','category','merchant'].map(k=>url.searchParams.get(k)||'').join('-');
  // The second batch repeats one item, simulating an insertion during an offset-based read.
  const indices=offset===0?Array.from({length:24},(_,i)=>i):offset===24?Array.from({length:24},(_,i)=>i+23):[47,48,49];
  const items=indices.map(i=>({id:`${view}-${filter}-${i}`,productActivity:view==='flash'?true:undefined,title:`DEMO ${view} ${filter} item ${i}`,summary:'Synthetic fixture only',source:'Test source',sourceUrl:'https://example.invalid',publishedAt:'2026-10-11T00:00:00Z',sources:[],offer:{kind:view==='news'?'shopping_news':'product_deal',product:'Fixture',merchant:'Test retailer',status:'Unverified',listedPriceCents:1000,checkoutPriceCents:null,restrictions:[],imageUrl:null,buyUrl:null}}));
  const respond=()=>res.end(JSON.stringify({items,total:50,hasMore:offset<48,briefing:null}));
  if(view==='news'&&offset===24){delayedNews=true;setTimeout(respond,1000);}else respond();
 });
 api.listen(0,'127.0.0.1');await once(api,'listening');
 t.after(()=>{api.closeAllConnections();api.close();});
 const apiPort=(api.address() as {port:number}).port;
 const web=spawn(process.execPath,['apps/web/server.ts'],{cwd:new URL('../../..',import.meta.url),env:{...process.env,WEB_PORT:'0',API_BASE_URL:`http://127.0.0.1:${apiPort}`},stdio:['ignore','pipe','pipe']});
 t.after(()=>web.kill('SIGTERM'));
 const port=await started(web,/"msg":"web started","port":(\d+)/,'stdout');
 const origin=`http://127.0.0.1:${port}`;
 const profile=await mkdtemp(join(tmpdir(),'dealbrief-scroll-test-'));
 const browser=spawn(chrome!,['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','pipe','pipe']});
 t.after(async()=>{browser.kill('SIGTERM');if(browser.exitCode===null)await once(browser,'exit');await rm(profile,{recursive:true,force:true,maxRetries:3});});
 const browserWs=await started(browser,/DevTools listening on (ws:\/\/[^\s]+)/,'stderr');
 const targets=await fetch(new URL('/json',browserWs.replace('ws:','http:'))).then(r=>r.json()) as {type:string;webSocketDebuggerUrl:string}[];
 const ws=new WebSocket(targets.find(x=>x.type==='page')!.webSocketDebuggerUrl);
 await once(ws,'open');t.after(()=>ws.close());
 let id=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(v:any)=>void}>();
 ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}});
 const send=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async(expression:string)=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 const until=async(expression:string)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Browser condition timed out: '+expression+' state='+await evaluate("JSON.stringify({path:location.pathname,search:location.search,category:document.querySelector('input[name=category]')?.value,cards:document.querySelectorAll('.db-card').length,links:[...document.querySelectorAll('.db-category-options a')].map(a=>a.getAttribute('href'))})"));};
 const scroll=()=>evaluate("document.querySelector('.db-feed-status').scrollIntoView()");
 const count="document.querySelectorAll('.db-card').length";
 await send('Network.enable');
 // Do not load the production advertising integration in local browser tests.
 await send('Network.setBlockedURLs',{urls:['*://*.googlesyndication.com/*','*://*.doubleclick.net/*']});
 await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:origin});await until(count+'===24');
 // Wait for hydration so a programmatic click exercises client navigation.
 await pause(500);
 assert.equal(await evaluate("document.querySelector('.db-next')===null"),true);
 await scroll();await until("document.querySelector('.db-feed-status').textContent.includes('Could not load')");
 assert.equal(await evaluate(count),24);
 await evaluate("document.querySelector('.db-feed-status button').click()");await until(count+'===47');
 await scroll();await until(count+'===50');
 assert.equal(await evaluate("new Set([...document.querySelectorAll('.db-card h2 a')].map(a=>a.href)).size"),50);
 assert.equal(await evaluate("location.search"),'');
 assert.match(await evaluate("document.querySelector('.db-feed-status').textContent"),/caught up/);
 assert.deepEqual(requests.filter(u=>Number(u.searchParams.get('offset'))>0).map(u=>u.searchParams.get('offset')),['24','24','48']);
 await evaluate("document.querySelector('.db-mobile-tabs a[href=\"/news\"]').click()");await until("location.pathname==='/news'&&"+count+'===24');
 await scroll();for(let i=0;i<50&&!delayedNews;i++)await pause(20);assert.ok(delayedNews);
 await evaluate("document.querySelector('.db-mobile-tabs a[href=\"/\"]').click()");await until("location.pathname==='/'&&"+count+'===24');
 await pause(1200);
 assert.ok(await evaluate("[...document.querySelectorAll('.db-card h2')].every(n=>n.textContent.includes('recommended'))"));
 assert.equal(await evaluate(count),24);
 await evaluate("document.querySelector('.db-mobile-tabs a[href=\"/flash\"]').click()");
 await until("location.pathname==='/flash'&&document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('Best Deals')");
 assert.equal(requests.at(-1)!.searchParams.get('view'),'flash');
 await until(count+'===24');
 assert.ok(await evaluate("document.querySelector('.db-deal-pick').textContent.includes('Product offer')"));
 await scroll();await until(count+'===47');
 await send('Page.navigate',{url:origin+'/'});await until("location.pathname==='/'&&"+count+'===24');
 await evaluate("document.querySelector('.db-category-nav a[href=\"/deals/electronics\"]').click()");
 await until("location.pathname==='/deals/electronics'&&document.querySelector('input[name=category]')?.value==='electronics'&&"+count+'===24');
 assert.equal(await evaluate("document.querySelector('input[name=category]').value"),'electronics');
 assert.ok(await evaluate("document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('Recommended')"));
 assert.equal(await evaluate("document.querySelectorAll('.db-mobile-tabs a').length"),3);
 await evaluate("document.querySelector('.db-category-nav a[href=\"/deals/home\"]').click()");
 await until("location.pathname==='/deals/home'&&document.querySelector('input[name=category]')?.value==='home'&&"+count+'===24');
 assert.equal(requests.at(-1)!.searchParams.get('category'),'home');
 assert.equal(await evaluate("document.querySelector('.db-category-options [aria-current=\"page\"]').textContent"),'Home & Kitchen');
 await evaluate("document.querySelector('.db-category-options a[href=\"/\"]').click()");
 await until("location.pathname==='/'&&"+count+'===24');
 assert.equal(await evaluate("document.querySelectorAll('.db-mobile-tabs a').length"),3);
 // Choosing any top category returns to the full AI Picks feed, even from Best Deals or News.
 await until("document.querySelector('.db-category-options a[href=\"/deals/home\"]')!==null");
 await evaluate("document.querySelector('.db-category-options a[href=\"/deals/home\"]').click()");await until("location.pathname==='/deals/home'&&document.querySelector('input[name=category]')?.value==='home'&&"+count+'>=24');
 await evaluate("document.querySelector('.db-mobile-tabs a[href=\"/flash?category=home\"]').click()");await until("location.pathname==='/flash'&&document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('Best Deals')");
 await until("document.querySelector('.db-category-options a[href=\"/deals/electronics\"]')!==null");
 await evaluate("document.querySelector('.db-category-options a[href=\"/deals/electronics\"]').click()");await until("location.pathname==='/deals/electronics'&&document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('Recommended')&&"+count+'>=24');
 assert.equal(requests.at(-1)!.searchParams.get('view'),'recommended');assert.equal(requests.at(-1)!.searchParams.get('category'),'electronics');
 await evaluate("document.querySelector('.db-mobile-tabs a[href=\"/news?category=electronics\"]').click()");await until("location.pathname==='/news'&&document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('News')");
 await until("document.querySelector('.db-category-options a[href=\"/deals/home\"]')!==null");
 await evaluate("document.querySelector('.db-category-options a[href=\"/deals/home\"]').click()");await until("location.pathname==='/deals/home'&&document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('Recommended')&&"+count+'>=24');
 assert.equal(requests.at(-1)!.searchParams.get('view'),'recommended');assert.equal(requests.at(-1)!.searchParams.get('category'),'home');
 await evaluate("document.querySelector('.db-mobile-tabs a[href=\"/news?category=home\"]').click()");await until("location.pathname==='/news'&&document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('News')");
 await evaluate("document.querySelector('.db-category-options a[href=\"/\"]').click()");await until("location.pathname==='/'&&document.querySelector('.db-mobile-tabs a[aria-current=\"page\"]')?.textContent.includes('Recommended')&&"+count+'>=24');
 assert.equal(requests.at(-1)!.searchParams.get('view'),'recommended');assert.ok(!requests.at(-1)!.searchParams.get('category'));
 // Filtered desktop feed uses the same filters for every appended batch.
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/all?q=vacuum&category=electronics&merchant=target'});await until("location.pathname==='/all'&&"+count+'===24');
 await scroll();await until(count+'===47');
 const last=requests.at(-1)!;
 for(const [k,v] of Object.entries({view:'new',q:'vacuum',category:'electronics',merchant:'target',offset:'24'}))assert.equal(last.searchParams.get(k),v);
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
});
