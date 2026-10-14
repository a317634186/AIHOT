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

test('admin gateway form submits credentials only on writes, clears after save and keeps browser storage/SSR free of keys', {skip:!chrome,timeout:60000}, async t=>{
 const secret='synthetic-browser-key-never-returned-987654321';
 let gateway={source:'environment',baseUrl:'https://example.invalid/v1',defaultModelId:'fixture-default',primaryModelId:'fixture-main',secondaryModelId:'fixture-analysis',searchSlot:'primary',reviewSearchSlot:'primary',reviewFallbackSlot:'secondary',jsonMode:true,apiKeyConfigured:true,revision:0,updatedAt:null};
 const writes:any[]=[];let tested=0;
 const api=createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://local');res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/api/admin/me')return res.end(JSON.stringify({name:'Fixture admin',csrf:'fixture-csrf',dev:false}));
  if(url.pathname==='/api/admin/nav-counts')return res.end('{}');
  if(url.pathname==='/api/site/meta')return res.end(JSON.stringify({changelogVersion:'test'}));
  if(url.pathname==='/api/admin/models'&&req.method==='GET')return res.end(JSON.stringify({gateway,days:7,capabilities:[],choices:[],history:[],benches:[]}));
  if(req.method==='PUT'||req.method==='POST'){
   assert.equal(req.headers['x-csrf-token'],'fixture-csrf');let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw);writes.push(data);
   if(url.pathname==='/api/admin/models/gateway/test'){tested++;return res.end(JSON.stringify({ok:true,latencyMs:25,message:'Local synthetic test only'}));}
   if(url.pathname==='/api/admin/models/gateway'){const {apiKey,reason,...safe}=data;gateway={...gateway,...safe,source:'admin',revision:gateway.revision+1};return res.end(JSON.stringify({saved:true}));}
  }
  res.statusCode=404;res.end('{}');
 });
 api.listen(0,'127.0.0.1');await once(api,'listening');t.after(()=>{api.closeAllConnections();api.close();});
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
 await send('Page.navigate',{url:origin+'/admin/models'});
 await until("document.querySelector('input[name=baseUrl]')!==null");
 assert.equal(await evaluate("document.querySelector('input[name=apiKey]').type"),'password');
 assert.equal(await evaluate("document.querySelector('input[name=apiKey]').value"),'');
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
 await evaluate(`document.querySelector('input[name=apiKey]').value=${JSON.stringify(secret)};document.querySelector('input[name=primaryModelId]').value='new-browser-model';document.querySelector('input[name=reason]').value='Synthetic browser change';`);
 await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('测试连接（调用一次）')).click()");
 await until("document.querySelector('[role=status]')?.textContent.includes('连接成功')");
 assert.equal(tested,1);assert.equal(writes[0].configuration.apiKey,secret);assert.equal(gateway.revision,0);
 await evaluate("document.querySelector('input[name=baseUrl]').form.requestSubmit()");
 await until("document.querySelector('input[name=primaryModelId]')?.value==='new-browser-model'&&document.querySelector('input[name=apiKey]')?.value===''");
 assert.equal(gateway.revision,1);assert.equal(writes[1].apiKey,secret);assert.equal(writes[1].primaryModelId,'new-browser-model');
 const html=await fetch(origin+'/admin/models').then(r=>r.text());assert.ok(!html.includes(secret));
 assert.equal(await evaluate(`JSON.stringify({local:localStorage,session:sessionStorage,url:location.href}).includes(${JSON.stringify(secret)})`),false);
 await send('Page.reload');await until("document.querySelector('input[name=primaryModelId]')?.value==='new-browser-model'");
 assert.equal(await evaluate("document.querySelector('input[name=apiKey]').value"),'');
});
