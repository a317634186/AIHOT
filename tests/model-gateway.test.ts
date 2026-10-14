import {stub,tag} from './setup.ts';
import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {z} from 'zod';
import {config} from '@aihot/backend/config';
import {sql,closeDb} from '@aihot/backend/db';
import {chatJson} from '@aihot/backend/providers/llm';
import {runtimeGateway,gatewayOverview,saveGateway,resetGateway,validateGatewayInput} from '@aihot/backend/providers/model-gateway';
import {redactSecrets} from '@aihot/backend/lib/secrets';
import {modelsOverview} from '@aihot/backend/admin/models';
import {buildApp} from '../apps/api/src/app.ts';
import {discoverShopping} from '@aihot/backend/shopping/discovery';
import {testGateway} from '@aihot/backend/admin/model-gateway';
const key='syntheticCustomProviderCredentialOnlyForGatewayTest123';
const seen:any[]=[];
const provider=await stub((_hit,req)=>{seen.push(JSON.parse(req.body));return {choices:[{message:{content:'{"ok":true}'}}],usage:{prompt_tokens:1,completion_tokens:1}};});
const dir=await mkdtemp(path.join(tmpdir(),'savlume-gateway-test-'));
const oldFile=process.env.MODEL_SETTINGS_KEY_FILE;process.env.MODEL_SETTINGS_KEY_FILE=path.join(dir,'vault','model-settings.key');
const oldPrivate=config.allowPrivateNetworkFetch;config.allowPrivateNetworkFetch=true;
const saved=await sql`SELECT * FROM settings WHERE key='ai.gateway'`;
const originalAdmin=config.devAdmin,originalEnvironment=config.environmentName;
const actor='test-gateway-'+tag();
const values={baseUrl:provider.url+'/v1/',apiKey:key,defaultModelId:'custom-default',primaryModelId:'custom-main',secondaryModelId:'custom-analysis',searchSlot:'primary' as const,reviewSearchSlot:'primary' as const,reviewFallbackSlot:'secondary' as const,jsonMode:true,revision:0,reason:'Synthetic fixture only'};
before(async()=>{await sql`DELETE FROM settings WHERE key='ai.gateway'`;});
after(async()=>{await sql`DELETE FROM settings WHERE key='ai.gateway'`;for(const row of saved)await sql`INSERT INTO settings ${sql(row)}`;config.allowPrivateNetworkFetch=oldPrivate;config.devAdmin=originalAdmin;config.environmentName=originalEnvironment;if(oldFile===undefined)delete process.env.MODEL_SETTINGS_KEY_FILE;else process.env.MODEL_SETTINGS_KEY_FILE=oldFile;await provider.close();await rm(dir,{recursive:true,force:true});await closeDb();});

test('saved keys are encrypted and never returned by metadata, models overview or audit logs',async()=>{
 assert.equal((await gatewayOverview()).source,'environment');
 const result=await saveGateway(values,actor);assert.equal(result.saved,true);assert.ok(!JSON.stringify(result).includes(key));
 const [row]=await sql`SELECT value FROM settings WHERE key='ai.gateway'`;assert.ok(!JSON.stringify(row).includes(key));assert.ok(row!.value.encryptedApiKey.ciphertext);
 const summary=await gatewayOverview();assert.equal(summary.apiKeyConfigured,true);assert.equal(summary.source,'admin');assert.equal(summary.primaryModelId,'custom-main');assert.equal(summary.baseUrl,provider.url+'/v1');assert.equal(summary.revision,1);assert.ok(!('apiKey' in summary));assert.ok(!('encryptedApiKey' in summary));
 const overview=await modelsOverview();assert.ok(!JSON.stringify(overview).includes(key));assert.equal(overview.choices.find(x=>x.key==='gemini-3.8-flash-high')!.modelId,'custom-main');
 const logs=await sql`SELECT before,after,reason FROM audit_log WHERE actor=${actor}`;assert.ok(!JSON.stringify(logs).includes(key));assert.ok(!JSON.stringify(logs).includes('ciphertext'));
 assert.equal((await stat(process.env.MODEL_SETTINGS_KEY_FILE!)).mode&0o777,0o600);assert.equal((await readFile(process.env.MODEL_SETTINGS_KEY_FILE!)).length,32);
});
test('API and worker can independently decrypt settings and use arbitrary model IDs without restarting',async()=>{
 const child=spawnSync(process.execPath,['--input-type=module','-e','import {runtimeGateway} from "@aihot/backend/providers/model-gateway";import {closeDb} from "@aihot/backend/db";try{const g=await runtimeGateway();console.log(JSON.stringify({source:g.source,model:g.primaryModelId,keyPresent:!!g.apiKey,revision:g.revision}));}finally{await closeDb();}'],{cwd:process.cwd(),env:{PATH:process.env.PATH,DATABASE_URL:process.env.DATABASE_URL,MODEL_SETTINGS_KEY_FILE:process.env.MODEL_SETTINGS_KEY_FILE,COLLECT_ENABLED:'false',MODEL_CALLS_ENABLED:'false'},encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);const other=JSON.parse(child.stdout);assert.equal(other.source,'admin');assert.equal(other.model,'custom-main');assert.equal(other.keyPresent,true);assert.ok(!child.stdout.includes(key));
 const result=await chatJson({model:'gemini-3.8-flash-high',purpose:'gateway_invariant',subject:tag(),promptVersion:'fixture',system:'Return JSON',user:'Synthetic '+key,schema:z.object({ok:z.boolean()})});assert.equal(result.data.ok,true);assert.equal(seen.at(-1).model,'custom-main');assert.ok(!JSON.stringify(seen.at(-1)).includes(key));
 await chatJson({model:'gpt-6-luna',purpose:'gateway_invariant',subject:tag(),promptVersion:'fixture',system:'Return JSON',user:'Synthetic',schema:z.object({ok:z.boolean()})});assert.equal(seen.at(-1).model,'custom-analysis');
});
test('blank key preserves saved credential, updates hot-load immediately and rejects stale editors',async()=>{
 const next={...values,apiKey:'',revision:1,primaryModelId:'replacement-main'};await saveGateway(next,actor);
 assert.equal((await runtimeGateway()).apiKey,key);assert.equal((await runtimeGateway()).primaryModelId,'replacement-main');
 await assert.rejects(saveGateway(next,actor),error=>(error as any).code==='conflict');
 assert.ok(!JSON.stringify(redactSecrets({message:key})).includes(key));
});
test('invalid endpoints and identifiers are rejected without issuing model calls',async()=>{
 const count=provider.hits();
 for(const baseUrl of ['https://user:password@example.com/v1','https://example.com/v1?api_key=synthetic','https://example.com/v1/chat/completions','file:///etc/passwd'])await assert.rejects(validateGatewayInput({...values,baseUrl}));
 await assert.rejects(validateGatewayInput({...values,primaryModelId:'invalid model with spaces'}));
 const previous=config.allowPrivateNetworkFetch;config.allowPrivateNetworkFetch=false;
 try{for(const baseUrl of ['https://127.0.0.1/v1','https://169.254.169.254/v1','http://127.0.0.1/v1'])await assert.rejects(validateGatewayInput({...values,baseUrl}));}finally{config.allowPrivateNetworkFetch=previous;}
 assert.equal(provider.hits(),count);
});
test('shopping and review discovery use configured search slots and the same gateway',async()=>{
 const before=seen.length;const oldCollect=process.env.COLLECT_ENABLED,oldSearch=process.env.SHOPPING_SEARCH_ENABLED;
 process.env.COLLECT_ENABLED='true';process.env.SHOPPING_SEARCH_ENABLED='true';
 try{const result=await discoverShopping(1000000+Math.floor(Math.random()*100000),'reviews');assert.equal((result as any).imported,0);assert.deepEqual(seen.slice(before).map(request=>request.model),['replacement-main','custom-analysis']);assert.ok(seen.slice(before).every(request=>request.tools[0].type==='web_search'));}finally{if(oldCollect===undefined)delete process.env.COLLECT_ENABLED;else process.env.COLLECT_ENABLED=oldCollect;if(oldSearch===undefined)delete process.env.SHOPPING_SEARCH_ENABLED;else process.env.SHOPPING_SEARCH_ENABLED=oldSearch;}
});

test('unauthenticated and CSRF-less users cannot change settings; authorized tests do not save drafts',async()=>{
 const app=await buildApp();
 try{const noAuth=await app.inject({method:'PUT',url:'/api/admin/models/gateway',payload:{...values,revision:2}});assert.equal(noAuth.statusCode,401);
 config.devAdmin={displayName:'Gateway fixture'};config.environmentName='development';
 const noCsrf=await app.inject({method:'PUT',url:'/api/admin/models/gateway',payload:{...values,revision:2}});assert.equal(noCsrf.statusCode,403);
 const metadata=await app.inject('/api/admin/models/gateway');assert.equal(metadata.statusCode,200);assert.ok(!metadata.body.includes(key));assert.match(metadata.headers['cache-control']! as string,/no-store/);
 const before=(await runtimeGateway()).revision;
 const test=await testGateway({...values,revision:2,primaryModelId:'draft-test-only'},'primary',actor);assert.equal(test.ok,true);assert.equal(seen.at(-1).model,'draft-test-only');assert.equal((await runtimeGateway()).revision,before);assert.equal((await runtimeGateway()).primaryModelId,'replacement-main');
 }finally{config.devAdmin=originalAdmin;config.environmentName=originalEnvironment;await app.close();}
});
test('tampered ciphertext fails closed and reset restores environment settings with a new revision',async()=>{
 const [stored]=await sql`SELECT value FROM settings WHERE key='ai.gateway'`;
 const corrupted={...stored!.value,encryptedApiKey:{...stored!.value.encryptedApiKey,tag:Buffer.alloc(16).toString('base64')}};
 await sql`UPDATE settings SET value=${sql.json(corrupted)} WHERE key='ai.gateway'`;await assert.rejects(runtimeGateway(),/Cannot decrypt/);
 await sql`UPDATE settings SET value=${sql.json(stored!.value)} WHERE key='ai.gateway'`;
 const reset=await resetGateway(2,'Return to fixture environment',actor);assert.equal(reset.source,'environment');assert.equal(reset.revision,3);
 await assert.rejects(saveGateway({...values,revision:0},actor),error=>(error as any).code==='conflict');
});
