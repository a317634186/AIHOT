import {stub,tag} from './setup.ts';
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {spawnSync} from 'node:child_process';
import {z} from 'zod';
import {redactText,redactValue} from '@aihot/contracts/secrets';
import {redactSecrets} from '@aihot/backend/lib/secrets';
import {chatJson} from '@aihot/backend/providers/llm';
import {paidRequest,ProviderRejectedError} from '@aihot/backend/providers/receipts';
import {sql,closeDb} from '@aihot/backend/db';
import {config} from '@aihot/backend/config';
import {buildApp} from '../apps/api/src/app.ts';
import {adminHandler} from '../apps/api/src/routes/admin-auth.ts';
const secret='fakeGatewayCredentialOnlyForSecurityTest12345';
const previous=process.env.LLM_API_KEY;process.env.LLM_API_KEY=secret;
const contains=(value:unknown)=>JSON.stringify(value).includes(secret);
after(async()=>{if(previous===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=previous;await closeDb();});
test('redaction removes nested, encoded, URL and Bearer credentials while preserving price/usage facts',()=>{
 const input={message:`Failed ${secret} ${encodeURIComponent('secret pass/with:chars')} Bearer arbitrary-token-value [redacted]`,authorization:'Basic sensitive',nested:{apiKey:'unknown-value',password:'another-value',url:'postgres://user:pass@localhost/db?token=unknown-token'},price:807,usage:{prompt_tokens:42}};
 const safe=redactValue(input,[secret,'secret pass/with:chars']) as typeof input;
 assert.equal(contains(safe),false);assert.equal(safe.authorization,'[REDACTED]');assert.equal(safe.nested.apiKey,'[REDACTED]');assert.doesNotMatch(JSON.stringify(safe),/arbitrary-token-value|sk-exampleOnly|user:pass|unknown-token|unknown-value|another-value/);assert.equal(safe.price,807);assert.equal(safe.usage.prompt_tokens,42);
 assert.match(redactText('token safe; password="hidden-value"'),/\[REDACTED\]/);
 assert.deepEqual(JSON.parse(redactText('{"api_key":"unknownCredentialValue","ok":true}')),{api_key:'[REDACTED]',ok:true});
 assert.doesNotMatch(JSON.stringify(redactSecrets(new Error(secret,{cause:new Error(secret)}))),new RegExp(secret));
});
test('provider echoes are redacted in saved receipts and their returned data without losing normal fields',async()=>{
 const subject='security-response-'+tag();
 const result=await paidRequest({service:'llm',purpose:'security_test',subject,identity:{subject},requestSummary:{note:secret,api_key:'other-secret'}},async()=>({response:{text:'Echo '+secret,apiKey:'other-secret',price:807},usage:{prompt_tokens:42},requestId:secret}));
 const [row]=await sql`SELECT request,response,request_id,usage FROM receipts WHERE id=${result.receiptId}`;
 assert.equal(contains(row),false);assert.equal(contains(result),false);assert.equal(row!.response.price,807);assert.equal(row!.usage.prompt_tokens,42);assert.equal(row!.request.api_key,'[REDACTED]');
 const reused=await paidRequest({service:'llm',purpose:'security_test',subject,identity:{subject}},async()=>{throw Error('Must not call twice');});assert.equal(reused.reused,true);assert.equal(contains(reused),false);
});
test('provider errors cannot persist an echoed key in error records',async()=>{
 const subject='security-error-'+tag();
 await assert.rejects(paidRequest({service:'llm',purpose:'security_test',subject,identity:{subject}},async()=>{throw new ProviderRejectedError('HTTP 401: '+secret,401,false);}),error=>{assert.equal(String(error).includes(secret),false);return true;});
 const [row]=await sql`SELECT error FROM receipts WHERE subject=${subject}`;assert.equal(contains(row),false);assert.match(row!.error,/401/);
});
test('model requests refuse redirects before credentials or prompts reach the redirected service',async()=>{
 let targetHits=0;const target=await stub(()=>{targetHits++;return {};});
 // Separate bare redirect endpoint; the shared JSON stub intentionally always returns status 200.
 const {createServer}=await import('node:http');const {once}=await import('node:events');
 const redirect=createServer((_req,res)=>{res.writeHead(307,{location:target.url+'/stolen'});res.end();});redirect.listen(0,'127.0.0.1');await once(redirect,'listening');
 const oldBase=process.env.LLM_BASE_URL,oldModel=process.env.LLM_MODEL;
 try{process.env.LLM_BASE_URL='http://127.0.0.1:'+(redirect.address() as {port:number}).port+'/v1';process.env.LLM_MODEL='security-stub';await assert.rejects(chatJson({model:'default',purpose:'security_test',subject:tag(),promptVersion:'s',system:'local stub only',user:'synthetic',schema:z.object({ok:z.boolean()})}));assert.equal(targetHits,0);}finally{redirect.closeAllConnections();redirect.close();await target.close();if(oldBase===undefined)delete process.env.LLM_BASE_URL;else process.env.LLM_BASE_URL=oldBase;if(oldModel===undefined)delete process.env.LLM_MODEL;else process.env.LLM_MODEL=oldModel;}
});
test('public and authenticated server errors do not return provider details or credentials',async()=>{
 const app=await buildApp();const old=config.devAdmin,oldEnvironment=config.environmentName;
 app.get('/api/security-error',async()=>{throw Error('Provider diagnostic '+secret);});
 app.get('/api/admin/security-error',adminHandler(async()=>{throw Error('Provider diagnostic '+secret);}));
 try{const publicError=await app.inject('/api/security-error');assert.equal(publicError.statusCode,503);assert.equal(publicError.body.includes(secret),false);assert.doesNotMatch(publicError.body,/Provider diagnostic/);
 const signedOut=await app.inject('/api/admin/security-error');assert.equal(signedOut.statusCode,401);
 config.devAdmin={displayName:'Test admin'};config.environmentName='development';const privateError=await app.inject('/api/admin/security-error');assert.equal(privateError.statusCode,500);assert.equal(privateError.body.includes(secret),false);assert.doesNotMatch(privateError.body,/Provider diagnostic/);
 }finally{config.devAdmin=old;config.environmentName=oldEnvironment;await app.close();}
});
test('process console and uncaught exceptions redact configured credentials',()=>{
 const child=spawnSync(process.execPath,['--input-type=module','-e','import "@aihot/backend/lib/secure-console";console.error({message:process.env.LLM_API_KEY,authorization:"Bearer "+process.env.INGEST_TOKEN});throw new Error(process.env.LLM_API_KEY,{cause:new Error(process.env.LLM_API_KEY)});'],{cwd:process.cwd(),env:{PATH:process.env.PATH,LLM_API_KEY:secret,INGEST_TOKEN:'sample-token-value',COLLECT_ENABLED:'false',MODEL_CALLS_ENABLED:'false'},encoding:'utf8'});
 assert.notEqual(child.status,0);assert.equal((child.stdout+child.stderr).includes(secret),false);assert.match(child.stderr,/\[REDACTED\]/);assert.doesNotMatch(child.stderr,/sample-token-value/);
});

test('authenticated collector redirects cannot forward headers or posted credentials to another origin',async()=>{
 const {guardedFetch}=await import('@aihot/backend/lib/http-fetch');const {createServer}=await import('node:http');const {once}=await import('node:events');
 const target=await stub(()=>({ok:true}));
 const redirect=createServer((_req,res)=>{res.writeHead(307,{location:target.url+'/other-origin'});res.end();});redirect.listen(0,'127.0.0.1');await once(redirect,'listening');
 const old=config.allowPrivateNetworkFetch;config.allowPrivateNetworkFetch=true;
 try{const url='http://127.0.0.1:'+(redirect.address() as {port:number}).port;await assert.rejects(guardedFetch(url,{headers:{Authorization:'Bearer '+secret}}),/different origin/);await assert.rejects(guardedFetch(url,{method:'POST',body:'synthetic credential body'}),/different origin/);assert.equal(target.hits(),0);}finally{config.allowPrivateNetworkFetch=old;redirect.closeAllConnections();redirect.close();await target.close();}
});

test('configured model credentials cannot enter generated article prompts even if accidentally present in input',async()=>{
 let prompt='';const provider=await stub((_hit,request)=>{prompt=request.body;return {choices:[{message:{content:'{"ok":true}'}}]};});
 const oldBase=process.env.LLM_BASE_URL,oldModel=process.env.LLM_MODEL;
 try{process.env.LLM_BASE_URL=provider.url+'/v1';process.env.LLM_MODEL='security-prompt-stub';const result=await chatJson({model:'default',purpose:'security_test',subject:tag(),promptVersion:'s',system:'Instruction '+secret,user:'Article mistakenly includes '+secret,schema:z.object({ok:z.boolean()})});assert.equal(result.data.ok,true);assert.equal(prompt.includes(secret),false);assert.match(prompt,/\[REDACTED\]/);}finally{await provider.close();if(oldBase===undefined)delete process.env.LLM_BASE_URL;else process.env.LLM_BASE_URL=oldBase;if(oldModel===undefined)delete process.env.LLM_MODEL;else process.env.LLM_MODEL=oldModel;}
});
