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

test('detail AI purchase reasons, recorded chart, comparison, share and persistent likes work on mobile', {skip:!chrome,timeout:60000}, async t=>{
 const likes=new Map<string,boolean>();
 const item={id:'detail-fixture',title:'DEMO vacuum',summary:'An AI summary grounded in the source.',reason:'Useful source-supported context.',source:'Test source',sourceUrl:'https://example.invalid/source',publishedAt:'2026-10-11T00:00:00Z',sources:[],offer:{kind:'product_deal',product:'DEMO vacuum',model:'D-1',variant:'1 pack',condition:'new',merchant:'Test retailer',seller:'Test retailer',status:'Unverified',listedPriceCents:10000,checkoutPriceCents:9000,restrictions:[],steps:[],imageUrl:null,buyUrl:'https://example.invalid/buy',aiOverview:{format:'recommendation',priceReason:'The source reports $90 versus its $100 reference price; this does not establish a market low.',summary:'Worth considering for the source-stated household use if cordless cleaning fits your needs.',bestFor:'Source-stated household use.',highlights:['Source-stated cordless design.'],cautions:['Check the stated warranty.']}}};
 const api=createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://local');res.setHeader('Content-Type','application/json');
  if(url.pathname==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:'test'}));
  if(url.pathname.endsWith('/likes')){
   let visitor=String(req.headers['x-dealbrief-visitor']??'');
   if(req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);visitor=body.visitorId;likes.set(visitor,body.liked);}
   return res.end(JSON.stringify({count:[...likes.values()].filter(Boolean).length,liked:likes.get(visitor)??false}));
  }
  if(url.pathname!=='/api/shopping'){res.statusCode=404;return res.end('{}');}
  const history=[{at:'2026-10-10T12:00:00Z',listedPriceCents:10000,checkoutPriceCents:10000,currency:'USD',basis:'source-reported',sourceUrl:item.sourceUrl},{at:'2026-10-11T12:00:00Z',listedPriceCents:10000,checkoutPriceCents:9000,currency:'USD',basis:'merchant-verified',sourceUrl:item.offer.buyUrl}];
  const current=url.searchParams.get('id')==='review-fixture'?{...item,id:'review-fixture',offer:{...item.offer,kind:'buying_guide',review:{format:'video_review',author:'DEMO reviewer',verdict:'The source reports a useful product for the demo task.',bestFor:'Demo use case',strengths:['Source-reported strength'],limitations:['Source-reported limitation'],testingNote:'The source describes its testing conditions.',questions:[{question:'Who is it for?',answer:'The stated demo use case.'}],videoUrl:'https://www.youtube.com/watch?v=abcdefghijk',basis:'source_text'}}}:item;
  res.end(JSON.stringify({items:[current],total:1,hasMore:false,briefing:null,priceHistory:history,likes:[...likes.values()].filter(Boolean).length,comparisons:[{...item,id:'comparison-fixture',offer:{...item.offer,merchant:'Other retailer',checkoutPriceCents:9500}}]}));
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
 const until=async(expression:string)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(100);}throw new Error('Browser condition timed out: '+expression);};
 await send('Network.enable');
 // Do not load the production advertising integration in local browser tests.
 await send('Network.setBlockedURLs',{urls:['*://*.googlesyndication.com/*','*://*.doubleclick.net/*']});
 await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:origin+'/items/detail-fixture'});
 await until("document.querySelector('.db-like:not(:disabled)')!==null");
 assert.match(await evaluate("document.querySelector('.db-ai-intro').textContent"),/cordless design/);
 assert.equal(await evaluate("document.querySelector('.db-ai-intro h2').textContent"),'Why this deal may be worth it');
 assert.match(await evaluate("document.querySelector('.db-ai-price-reason').textContent"),/does not establish a market low/);
 assert.match(await evaluate("document.querySelector('.db-ai-summary').textContent"),/Worth considering/);
 assert.equal(await evaluate("document.querySelectorAll('.db-price-chart circle').length"),2);
 assert.match(await evaluate("document.querySelector('.db-retailer-quotes').textContent"),/Other retailer/);
 assert.equal(await evaluate("document.querySelectorAll('.db-status.unverified').length"),0);
 assert.doesNotMatch(await evaluate("document.querySelector('.db-retailer-quotes').textContent"),/Unverified/);
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.db-detail-actions')).position"),'fixed');
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
 await evaluate("document.querySelector('.db-like').click()");await until("document.querySelector('.db-like').getAttribute('aria-pressed')==='true'");
 assert.equal([...likes.values()].filter(Boolean).length,1);
 await send('Page.reload');await until("document.querySelector('.db-like:not(:disabled)')?.getAttribute('aria-pressed')==='true'");
 await evaluate("document.querySelector('.db-like').click()");await until("document.querySelector('.db-like:not(:disabled)')?.getAttribute('aria-pressed')==='false'");
 assert.equal([...likes.values()].filter(Boolean).length,0);
 // Stub platform APIs so testing never sends a share or touches the host clipboard.
 await evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:undefined});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__shared=text}}})");
 await evaluate("document.querySelector('.db-share').click()");await until("document.querySelector('.db-detail-actions').textContent.includes('Link copied')");
 assert.equal(await evaluate('window.__shared'),origin+'/items/detail-fixture');
 await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});document.execCommand=()=>false;document.querySelector('.db-share').click()");
 await until("document.querySelector('input[aria-label=\"Share link\"]')!==null");
 assert.equal(await evaluate("document.querySelector('input[aria-label=\"Share link\"]').value"),origin+'/items/detail-fixture');
 await evaluate("Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__nativeShared=data.url}});document.querySelector('.db-share').click()");
 await until('!!window.__nativeShared');assert.equal(await evaluate('window.__nativeShared'),origin+'/items/detail-fixture');
 await send('Page.navigate',{url:origin+'/items/review-fixture'});await until("document.querySelector('.db-review-insights')!==null");
 assert.match(await evaluate("document.querySelector('.db-review-insights').textContent"),/DEMO reviewer/);
 assert.equal(await evaluate("document.querySelector('.db-review-video a').href"),'https://www.youtube.com/watch?v=abcdefghijk');
 assert.match(await evaluate("document.querySelector('.db-review-questions').textContent"),/Who is it for/);
 assert.equal(await evaluate("document.querySelectorAll('.db-mobile-tabs a').length"),3);
 assert.equal(await evaluate("document.querySelector('.db-price-insights')===null"),true);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
});
