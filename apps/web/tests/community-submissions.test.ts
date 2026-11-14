import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn,type ChildProcess} from 'node:child_process';

const chrome=process.env.CHROME_BIN||['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function started(child:ChildProcess,pattern:RegExp,stream:'stdout'|'stderr'){
 return new Promise<string>((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Startup timed out')),15000);child[stream]!.on('data',chunk=>{output+=chunk;const m=output.match(pattern);if(m){clearTimeout(timer);resolve(m[1]!);}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Process exited: '+code));});});
}
test('Shared Deals is visible without sign-in, loads more, and prompts for sign-in only when sharing', {skip:!chrome,timeout:60000},async t=>{
 let submitted:any=null;const user={id:'test',handle:'shopper',email:null,points:0,level:0,csrf:'test-csrf'};
 const items=Array.from({length:25},(_,i)=>({id:'fixture-'+i,kind:'offer_submission',title:'Shared deal '+i,body:'A shopper shared this offer.',articleId:null,parentId:null,category:'general',merchantId:'walmart',productUrl:'https://www.walmart.com/ip/123',reportedPriceCents:999,status:'published',handle:'shopper',points:0,createdAt:'2026-10-01T00:00:00Z',publishedAt:'2026-10-01T00:00:00Z',voteScore:0,replyCount:0}));
 Object.assign(items[0]!,{retailerCheck:{state:'verified',productName:'Example tool',priceCents:1299,seller:'Walmart',checkedAt:'2026-10-28T12:00:00Z'}});
 const api=createServer(async(req,res)=>{const url=new URL(req.url!,'http://local'),path=url.pathname;res.setHeader('content-type','application/json');
  if(path==='/api/community/me')return res.end(JSON.stringify({user:null}));
  if(path==='/api/community/login'&&req.method==='POST')return res.end(JSON.stringify({user}));
  if(path==='/api/community/feed'){const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||30);return res.end(JSON.stringify({items:items.slice(offset,offset+limit),hasMore:offset+limit<items.length}));}
  if(path==='/api/community/posts'&&req.method==='POST'){let raw='';for await(const chunk of req)raw+=chunk;submitted=JSON.parse(raw);res.statusCode=202;return res.end(JSON.stringify({id:'test-post',message:'Your post was received and is being checked before it appears.'}));}
  return res.end('{}');
 });
 api.listen(0,'127.0.0.1');await once(api,'listening');t.after(()=>{api.closeAllConnections();api.close();});
 const port=(api.address() as {port:number}).port;
 const web=spawn(process.execPath,['apps/web/server.ts'],{cwd:new URL('../../..',import.meta.url),env:{...process.env,WEB_PORT:'0',API_BASE_URL:`http://127.0.0.1:${port}`},stdio:['ignore','pipe','pipe']});t.after(()=>web.kill('SIGTERM'));
 const webPort=await started(web,/"msg":"web started","port":(\d+)/,'stdout');
 const profile=await mkdtemp(join(tmpdir(),'savlume-community-test-'));
 const browser=spawn(chrome!,['--headless','--no-sandbox','--disable-gpu','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','pipe','pipe']});
 t.after(async()=>{browser.kill('SIGTERM');if(browser.exitCode===null)await once(browser,'exit');await rm(profile,{recursive:true,force:true,maxRetries:3});});
 const browserWs=await started(browser,/DevTools listening on (ws:\/\/[^\s]+)/,'stderr');
 const targets=await fetch(new URL('/json',browserWs.replace('ws:','http:'))).then(r=>r.json()) as {type:string;webSocketDebuggerUrl:string}[];
 const ws=new WebSocket(targets.find(x=>x.type==='page')!.webSocketDebuggerUrl);await once(ws,'open');t.after(()=>ws.close());
 let id=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(v:any)=>void}>();ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}});
 const send=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evalJs=async(expression:string)=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
 const until=async(expression:string)=>{for(let i=0;i<100;i++){if(await evalJs(expression))return;await pause(100);}throw Error('Timed out: '+expression+' state='+JSON.stringify(await evalJs("({count:document.querySelectorAll('article').length,status:document.querySelector('[aria-live=polite]')?.textContent,height:document.body.scrollHeight,scroll:window.scrollY})")));};
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['*://*.googlesyndication.com/*','*://*.doubleclick.net/*']});await send('Page.enable');
 await send('Page.navigate',{url:`http://127.0.0.1:${webPort}/community`});
 await until("document.querySelector('nav[aria-label=\"Community sections\"] [aria-current=page]')?.textContent==='Community'");
 assert.equal(await evalJs("!!document.querySelector('[name=password]')"),false);
 await send('Page.navigate',{url:`http://127.0.0.1:${webPort}/community/deals`});
 await until("[...document.querySelectorAll('button')].some(b=>b.textContent==='Share a deal')");
 assert.equal(await evalJs("document.querySelector('h1').textContent"),'Shared Deals');
 assert.deepEqual(await evalJs("[...document.querySelectorAll('.db-top-sections a')].map(a=>a.textContent)"),['Recommended','Best Deals','News','Reviews & Picks','Community']);
 assert.equal(await evalJs("document.querySelector('.db-top-sections [aria-current=page]').textContent"),'Community');
 assert.deepEqual(await evalJs("[...document.querySelectorAll('nav[aria-label=\"Community sections\"] a')].map(a=>a.textContent)"),['Community','Shared Deals']);
 assert.equal(await evalJs("document.querySelector('nav[aria-label=\"Community sections\"] [aria-current=page]').textContent"),'Shared Deals');
 assert.equal(await evalJs("!!document.querySelector('[name=password]')"),false);
 assert.equal(await evalJs("document.querySelectorAll('article').length"),24);
 assert.match(await evalJs("document.querySelector('article').textContent"),/User-reported price: \$9\.99/);
 assert.match(await evalJs("document.querySelector('article').textContent"),/Retailer-verified listed price: \$12\.99/);
 await evalJs("window.scrollTo(0,document.body.scrollHeight)");
 await until("document.querySelectorAll('article').length===25");
 await evalJs("[...document.querySelectorAll('button')].find(b=>b.textContent==='Share a deal').click()");
 await until("!!document.querySelector('[name=password]')");
 await evalJs("document.querySelector('[name=identity]').value='shopper';document.querySelector('[name=password]').value='test-password-12345';document.querySelector('[name=password]').form.requestSubmit()");
 await until("!!document.querySelector('[name=offerType]')");
 await evalJs("document.querySelector('[name=offerType]').value='event';document.querySelector('[name=offerType]').dispatchEvent(new Event('change',{bubbles:true}))");
 await evalJs("Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.querySelector('[name=productUrl]'),'https://www.walmart.com/deals');document.querySelector('[name=productUrl]').dispatchEvent(new Event('input',{bubbles:true}))");
 await until("document.body.textContent.includes('Retailer recognized: Walmart')");
 await evalJs("document.querySelector('[name=title]').value='Seasonal sale event';document.querySelector('[name=body]').value='Selected items are included in this sale.';document.querySelector('[name=productUrl]').value='https://www.walmart.com/deals';document.querySelector('[name=endsOn]').value='2030-01-01';document.querySelector('[name=body]').form.requestSubmit()");
 await until("document.querySelector('[role=status]')?.textContent.includes('received')");
 assert.equal(submitted.kind,'offer_submission');assert.equal(submitted.offerType,'event');assert.equal(submitted.price,'');assert.equal(submitted.endsOn,'2030-01-01');
});
