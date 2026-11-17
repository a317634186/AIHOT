// Shared compatible gateway configuration; only backend processes decrypt credentials.
import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,linkSync,unlinkSync,statSync} from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {config,credential,isProduction} from '../config.ts';
import {sql} from '../db.ts';
import {assertPublicUrl} from '../lib/url.ts';
import {registerSecret,safeErrorText} from '../lib/secrets.ts';
import type {GatewayFields,GatewayInput,GatewayOverview,GatewaySlot} from '@aihot/contracts/model-gateway';
const SETTING='ai.gateway';
const slot=z.enum(['default','primary','secondary']);
const modelId=z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
const fields=z.object({baseUrl:z.string().trim().min(1).max(1000),defaultModelId:modelId,primaryModelId:modelId,secondaryModelId:modelId,searchSlot:slot,searchFallbackSlot:slot,reviewSearchSlot:slot,reviewFallbackSlot:slot,jsonMode:z.boolean()});
const inputSchema=fields.extend({apiKey:z.string().max(4096).optional().default(''),revision:z.number().int().nonnegative(),reason:z.string().trim().min(1).max(500)}).strict();
interface EncryptedKey {iv:string;tag:string;ciphertext:string}
interface EnvironmentGateway {useEnvironment:true;revision:number}
interface StoredGateway extends GatewayFields {encryptedApiKey:EncryptedKey;revision:number}
export interface RuntimeGateway extends GatewayOverview {apiKey:string|null;identity:string}
function bad(message:string):never{throw Object.assign(new Error(message),{statusCode:400});}
function encryptionKey(create=false):Buffer{
 const filename=process.env.MODEL_SETTINGS_KEY_FILE||path.join(config.dataDir,'credentials','model-settings.key');
 if(create){
  mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
  const temporary=filename+'.'+randomBytes(8).toString('hex')+'.tmp';
  writeFileSync(temporary,randomBytes(32),{mode:0o600,flag:'wx'});
  try{linkSync(temporary,filename);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}finally{unlinkSync(temporary);}
 }
 const info=statSync(filename);if((info.mode&0o077)!==0)throw Error('Model settings encryption key must have private file permissions');
 const key=readFileSync(filename);if(key.length!==32)throw Error('Invalid model settings encryption key');return key;
}
function encrypt(value:string):EncryptedKey{const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(true),iv);cipher.setAAD(Buffer.from(SETTING));const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};}
function decrypt(value:EncryptedKey):string{
 try{const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(SETTING));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8');}
 catch{throw Error('Cannot decrypt saved model credentials. Check the server encryption-key backup.');}
}
function defaults():GatewayFields{return {baseUrl:credential('models','LLM_BASE_URL')??'',defaultModelId:process.env.LLM_MODEL??'',primaryModelId:'gemini-3.8-flash-high',secondaryModelId:'gpt-6-luna',searchSlot:'primary',searchFallbackSlot:'secondary',reviewSearchSlot:'primary',reviewFallbackSlot:'secondary',jsonMode:process.env.LLM_JSON_MODE!=='false'};}
export async function runtimeGateway():Promise<RuntimeGateway>{
 const [row]=await sql<{value:StoredGateway|EnvironmentGateway;updated_at:Date}[]>`SELECT value,updated_at FROM settings WHERE key=${SETTING}`;
 if(!row||'useEnvironment' in row.value){const apiKey=credential('models','LLM_API_KEY');if(apiKey)registerSecret(apiKey);return {...defaults(),source:'environment',apiKeyConfigured:!!apiKey,apiKey,revision:row?.value.revision??0,updatedAt:row?.updated_at.toISOString()??null,identity:'environment'};}
 const stored=row.value as StoredGateway;const apiKey=decrypt(stored.encryptedApiKey);registerSecret(apiKey);
 const {encryptedApiKey,...publicFields}=stored;
 // A configuration saved before a slot existed has no value for it; fall back to the built-in default
 // so the admin form never renders an empty selector.
 const d=defaults();
 return {...publicFields,searchFallbackSlot:publicFields.searchFallbackSlot??d.searchFallbackSlot,apiKey,apiKeyConfigured:true,source:'admin',updatedAt:row.updated_at.toISOString(),identity:'gateway:'+createHash('sha256').update(JSON.stringify([stored.baseUrl,stored.defaultModelId,stored.primaryModelId,stored.secondaryModelId,stored.jsonMode,stored.revision])).digest('hex')};
}
export function gatewayMetadata(gateway:RuntimeGateway):GatewayOverview{const {apiKey,identity,...metadata}=gateway;return metadata;}
export async function gatewayOverview(){return gatewayMetadata(await runtimeGateway());}
export function gatewayModelId(gateway:GatewayFields,selected:GatewaySlot){return selected==='primary'?gateway.primaryModelId:selected==='secondary'?gateway.secondaryModelId:gateway.defaultModelId;}
export function gatewaySlotForPreset(key:string):GatewaySlot|null{return key==='default'?'default':key==='gemini-3.8-flash-high'?'primary':key==='gpt-6-luna'?'secondary':null;}
export async function validateGatewayInput(value:unknown):Promise<GatewayInput>{
 if(value&&typeof value==='object'&&typeof (value as any).apiKey==='string')registerSecret((value as any).apiKey);
 const parsed=inputSchema.safeParse(value);if(!parsed.success)bad('Check the API address, model IDs, change reason and configuration version.');
 const result=parsed.data;result.apiKey=result.apiKey.trim();
 if(result.apiKey&&(/\s/.test(result.apiKey)||result.apiKey.length<8))bad('API Key must be at least eight characters and contain no whitespace.');
 let url:URL;try{url=new URL(result.baseUrl);}catch{bad('Enter a complete API base URL, such as https://provider.example/v1.');}
 if(url.username||url.password||url.search||url.hash)bad('API address cannot contain credentials, query parameters or fragments.');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&!isProduction&&config.allowPrivateNetworkFetch))bad('API address must use HTTPS.');
 if(/\/(?:chat\/completions|responses|embeddings|models)\/?$/.test(url.pathname))bad('Enter the API base URL, not a specific API endpoint.');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([assertPublicUrl(url.href,!isProduction&&config.allowPrivateNetworkFetch),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('validation timeout')),5000);})]);}catch{bad('API address must resolve to a publicly reachable service.');}finally{clearTimeout(timer);}
 result.baseUrl=url.href.replace(/\/+$/,'');
 for(const text of [result.baseUrl,result.defaultModelId,result.primaryModelId,result.secondaryModelId])if(safeErrorText(text)!==text)bad('Do not put API credentials in the address or model IDs.');
 return result;
}
export async function draftGateway(input:unknown):Promise<RuntimeGateway>{
 const values=await validateGatewayInput(input);const current=await runtimeGateway();
 if(values.revision!==current.revision)throw Object.assign(Error('Model settings changed. Reload before continuing.'),{code:'conflict'});
 const apiKey=values.apiKey||current.apiKey;if(!apiKey)bad('Enter an API Key before saving or testing.');registerSecret(apiKey);
 const {apiKey:submitted,reason,revision,...settings}=values;
 return {...settings,apiKey,apiKeyConfigured:true,source:'admin',revision,updatedAt:null,identity:'draft:'+createHash('sha256').update(JSON.stringify([settings,createHash('sha256').update(apiKey).digest('hex')])).digest('hex')};
}
export async function saveGateway(input:unknown,actor:string){
 const values=await validateGatewayInput(input);const draft=await draftGateway(values);const next:StoredGateway={...fields.parse(draft),encryptedApiKey:encrypt(draft.apiKey!),revision:values.revision+1};
 const metadata=await sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext(${SETTING}))`;
  const [old]=await tx<{value:StoredGateway}[]>`SELECT value FROM settings WHERE key=${SETTING}`;
  if((old?.value.revision??0)!==values.revision)throw Object.assign(Error('Model settings changed. Reload before continuing.'),{code:'conflict'});
  const safeBefore=old?('useEnvironment' in old.value?{source:'environment',revision:old.value.revision}:{...fields.parse(old.value),apiKeyConfigured:true,revision:old.value.revision}):null;
  await tx`INSERT INTO settings(key,value,updated_by) VALUES(${SETTING},${tx.json(next as never)},${actor}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  const after={...fields.parse(next),apiKeyConfigured:true,revision:next.revision};
  await tx`INSERT INTO audit_log(actor,action,subject,reason,before,after) VALUES(${actor},'models.gateway-save',${SETTING},${safeErrorText(values.reason)},${safeBefore?tx.json(safeBefore):null},${tx.json({...after,keyChanged:!!values.apiKey})})`;
  return after;
 });
 return {saved:true,...metadata};
}
export async function resetGateway(revision:number,reason:string,actor:string){
 if(!Number.isInteger(revision)||revision<0||!reason?.trim()||reason.length>500)bad('A configuration version and change reason are required.');
 await sql.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtext(${SETTING}))`;const [old]=await tx<{value:StoredGateway}[]>`SELECT value FROM settings WHERE key=${SETTING}`;
  if((old?.value.revision??0)!==revision)throw Object.assign(Error('Model settings changed. Reload before continuing.'),{code:'conflict'});
  await tx`INSERT INTO settings(key,value,updated_by) VALUES(${SETTING},${tx.json({useEnvironment:true,revision:revision+1})},${actor}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`;
  await tx`INSERT INTO audit_log(actor,action,subject,reason,before,after) VALUES(${actor},'models.gateway-reset',${SETTING},${safeErrorText(reason)},${old?tx.json('useEnvironment' in old.value?{source:'environment',revision}:{...fields.parse(old.value),revision,apiKeyConfigured:true}):null},${tx.json({source:'environment'})})`;
 });
 return gatewayOverview();
}
