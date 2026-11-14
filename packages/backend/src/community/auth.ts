import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { config, credential } from '../config.ts';
import { sql } from '../db.ts';
import { sha256 } from '../lib/ids.ts';
import { emailConfigured, sendEmail } from '../notify/email.ts';

export const COMMUNITY_COOKIE='savlume_member';
const SESSION_DAYS=30;
const dummySalt='savlume-community-login-timing-salt';
const limitSecret=credential('auth','SESSION_SECRET')||randomBytes(32).toString('hex');
export interface CommunityMember {id:string;handle:string;email:string|null;status:'active'|'suspended';points:number;level:number;csrf:string}
export class CommunityAuthError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}

function publicMember(row:any,csrf:string):CommunityMember{return {id:row.id,handle:row.handle,email:row.email??null,status:row.status,points:Number(row.points),level:Number(row.level),csrf};}
async function passwordDigest(password:string,salt:string){
 return await new Promise<Buffer>((resolve,reject)=>scryptCallback(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key as Buffer)));
}
function newPassword(value:unknown){const password=typeof value==='string'?value:'';if(password.length<12||password.length>128)throw new CommunityAuthError('Use a password between 12 and 128 characters.');return password;}
async function verifyPassword(value:unknown,salt:string,hash:string){const password=typeof value==='string'&&value.length<=128?value:'';const actual=await passwordDigest(password,salt),expected=Buffer.from(hash,'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected);}
/** Database-backed limits survive restarts and apply across API instances. Keys contain no raw identity or address. */
export async function communitySecurityLimit(scope:string,value:string,limit:number){
 const key=createHmac('sha256',limitSecret).update(`${scope}:${value.trim().normalize('NFKC').toLowerCase().slice(0,300)}`).digest('hex');
 const [row]=await sql<{attempts:number}[]>`INSERT INTO community_security_limits(key_hash) VALUES(${key}) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN community_security_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE community_security_limits.attempts+1 END,window_start=CASE WHEN community_security_limits.window_start<now()-interval '15 minutes' THEN now() ELSE community_security_limits.window_start END RETURNING attempts`;
 return row!.attempts>limit;
}
function cookies(header:string|undefined){const out:Record<string,string>={};for(const part of (header??'').split(';')){const i=part.indexOf('=');if(i<=0)continue;try{out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());}catch{}}return out;}
export function communityCookie(token:string,maxAge=SESSION_DAYS*86400){return `${COMMUNITY_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.siteUrl.startsWith('https://')?'; Secure':''}`;}
export async function registerCommunityMember(input:{handle:unknown;password:unknown;email?:unknown},userAgent?:string){
 const handle=String(input.handle??'').trim().normalize('NFKC');const handleKey=handle.toLowerCase();const password=String(input.password??'');
 const email=input.email==null||String(input.email).trim()===''?null:String(input.email).trim().toLowerCase();
 if(!/^[A-Za-z0-9_]{3,24}$/.test(handle))throw new CommunityAuthError('Use 3–24 letters, numbers, or underscores for your username.');
 if(password.length<12||password.length>128)throw new CommunityAuthError('Use a password between 12 and 128 characters.');
 if(email&&!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email))throw new CommunityAuthError('Enter a valid email address or leave it blank.');
 const salt=randomBytes(16).toString('hex');const passwordHash=(await passwordDigest(password,salt)).toString('hex');
 const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
 try{
  const member=await sql.begin(async tx=>{
   const [row]=await tx<{id:string;handle:string;email:string|null;status:string;points:number;level:number}[]>`INSERT INTO community_users(id,handle,handle_key,email,password_salt,password_hash) VALUES(${randomBytes(16).toString('hex')},${handle},${handleKey},${email},${salt},${passwordHash}) RETURNING id,handle,email,status,points,level`;
   await tx`INSERT INTO community_sessions(id_hash,user_id,csrf_token,expires_at,user_agent) VALUES(${sha256(token)},${row!.id},${csrf},now()+interval '30 days',${userAgent?.slice(0,300)??null})`;
   return row!;
  });
  return {member:publicMember(member,csrf),token};
 }catch(error){if((error as {code?:string}).code==='23505')throw new CommunityAuthError('That username or email is already registered.',409);throw error;}
}
export async function loginCommunityMember(identity:unknown,passwordValue:unknown,userAgent?:string){
 const identityKey=String(identity??'').trim().normalize('NFKC').toLowerCase(),password=String(passwordValue??'');
 if(!identityKey||password.length>128)throw new CommunityAuthError('Invalid username or password.',401);
 const [row]=await sql<any[]>`SELECT id,handle,email,status,points,level,password_salt,password_hash FROM community_users WHERE handle_key=${identityKey} OR lower(email)=${identityKey} LIMIT 1`;
 const salt=row?.password_salt??dummySalt;const actual=await passwordDigest(password,salt);const expected=Buffer.from(row?.password_hash??Buffer.alloc(64).toString('hex'),'hex');
 if(!row||row.status!=='active'||expected.length!==actual.length||!timingSafeEqual(actual,expected))throw new CommunityAuthError('Invalid username or password.',401);
 const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
 await sql.begin(async tx=>{
  const [current]=await tx<{password_hash:string;status:string}[]>`SELECT password_hash,status FROM community_users WHERE id=${row.id} FOR UPDATE`;
  if(!current||current.status!=='active'||current.password_hash!==row.password_hash)throw new CommunityAuthError('Invalid username or password.',401);
  await tx`INSERT INTO community_sessions(id_hash,user_id,csrf_token,expires_at,user_agent) VALUES(${sha256(token)},${row.id},${csrf},now()+interval '30 days',${userAgent?.slice(0,300)??null})`;
  await tx`UPDATE community_users SET last_login_at=now() WHERE id=${row.id}`;
 });
 return {member:publicMember(row,csrf),token};
}
export async function communityPrincipal(cookieHeader:string|undefined):Promise<CommunityMember|null>{
 const token=cookies(cookieHeader)[COMMUNITY_COOKIE];if(!token||token.length>128)return null;
 const [row]=await sql<any[]>`SELECT u.id,u.handle,u.email,u.status,u.points,u.level,s.csrf_token FROM community_sessions s JOIN community_users u ON u.id=s.user_id WHERE s.id_hash=${sha256(token)} AND s.expires_at>now()`;
 if(!row||row.status!=='active')return null;
 return publicMember(row,row.csrf_token);
}
export async function endCommunitySession(cookieHeader:string|undefined){
 const token=cookies(cookieHeader)[COMMUNITY_COOKIE];if(token&&token.length<=128)await sql`DELETE FROM community_sessions WHERE id_hash=${sha256(token)}`;
}

export async function changeCommunityPassword(userId:string,currentPassword:unknown,newValue:unknown){
 const password=newPassword(newValue),salt=randomBytes(16).toString('hex'),hash=(await passwordDigest(password,salt)).toString('hex');
 await sql.begin(async tx=>{
  const [row]=await tx<{password_salt:string;password_hash:string;status:string}[]>`SELECT password_salt,password_hash,status FROM community_users WHERE id=${userId} FOR UPDATE`;
  if(!row||row.status!=='active'||!await verifyPassword(currentPassword,row.password_salt,row.password_hash))throw new CommunityAuthError('Current password is incorrect.',401);
  await tx`UPDATE community_users SET password_salt=${salt},password_hash=${hash},updated_at=now() WHERE id=${userId}`;
  await tx`DELETE FROM community_sessions WHERE user_id=${userId}`;
  await tx`DELETE FROM community_password_resets WHERE user_id=${userId}`;
  await tx`DELETE FROM community_recovery_codes WHERE user_id=${userId}`;
 });
}

export async function createCommunityRecoveryCodes(userId:string,currentPassword:unknown){
 const codes=Array.from({length:8},()=>randomBytes(16).toString('hex').match(/.{1,8}/g)!.join('-'));
 await sql.begin(async tx=>{
  const [row]=await tx<{password_salt:string;password_hash:string;status:string}[]>`SELECT password_salt,password_hash,status FROM community_users WHERE id=${userId} FOR UPDATE`;
  if(!row||row.status!=='active'||!await verifyPassword(currentPassword,row.password_salt,row.password_hash))throw new CommunityAuthError('Current password is incorrect.',401);
  await tx`DELETE FROM community_recovery_codes WHERE user_id=${userId}`;
  for(const code of codes)await tx`INSERT INTO community_recovery_codes(user_id,code_hash) VALUES(${userId},${sha256(code.replaceAll('-',''))})`;
 });
 return codes;
}

export async function recoverCommunityWithCode(identityValue:unknown,codeValue:unknown,newValue:unknown){
 const identity=typeof identityValue==='string'?identityValue.trim().normalize('NFKC').toLowerCase().slice(0,254):'';
 const code=typeof codeValue==='string'?codeValue.trim().toLowerCase().replaceAll('-',''):'';
 const password=newPassword(newValue),salt=randomBytes(16).toString('hex'),hash=(await passwordDigest(password,salt)).toString('hex');
 if(!identity||!/^[a-f0-9]{32}$/.test(code))throw new CommunityAuthError('Invalid recovery details or expired code.',400);
 await sql.begin(async tx=>{
  const [user]=await tx<{id:string;status:string}[]>`SELECT id,status FROM community_users WHERE handle_key=${identity} OR lower(email)=${identity} LIMIT 1 FOR UPDATE`;
  if(!user||user.status!=='active')throw new CommunityAuthError('Invalid recovery details or expired code.',400);
  const used=await tx`DELETE FROM community_recovery_codes WHERE user_id=${user.id} AND code_hash=${sha256(code)} RETURNING user_id`;
  if(!used.length)throw new CommunityAuthError('Invalid recovery details or expired code.',400);
  await tx`UPDATE community_users SET password_salt=${salt},password_hash=${hash},updated_at=now() WHERE id=${user.id}`;
  await tx`DELETE FROM community_sessions WHERE user_id=${user.id}`;
  await tx`DELETE FROM community_password_resets WHERE user_id=${user.id}`;
  await tx`DELETE FROM community_recovery_codes WHERE user_id=${user.id}`;
 });
}

export async function requestCommunityPasswordReset(emailValue:unknown,deliver=sendEmail){
 if(!emailConfigured()&&deliver===sendEmail)throw new CommunityAuthError('Email recovery is currently unavailable. Use a recovery code if you saved one.',503);
 const email=typeof emailValue==='string'?emailValue.trim().toLowerCase().slice(0,254):'';
 const token=randomBytes(32).toString('base64url'),tokenHash=sha256(token);
 const target=await sql.begin(async tx=>{
  const [user]=await tx<{id:string;email:string}[]>`SELECT id,email FROM community_users WHERE lower(email)=${email} AND status='active' FOR UPDATE`;
  if(!user)return null;
  const [existing]=await tx<{recent:boolean}[]>`SELECT created_at>now()-interval '15 minutes' AS recent FROM community_password_resets WHERE user_id=${user.id}`;
  if(existing?.recent)return null;
  await tx`INSERT INTO community_password_resets(user_id,token_hash,expires_at) VALUES(${user.id},${tokenHash},now()+interval '30 minutes') ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=now(),expires_at=excluded.expires_at`;
  return user;
 });
 if(target){const url=new URL('/community/account',config.siteUrl);url.hash='reset='+token;
  try{await deliver(target.email,'Reset your Savlume password',`Use this link within 30 minutes to reset your Savlume password:\n\n${url.href}\n\nIf you did not request this, you can ignore this email.`);}
  catch{await sql`DELETE FROM community_password_resets WHERE user_id=${target.id} AND token_hash=${tokenHash}`;console.error(JSON.stringify({level:'error',msg:'community password reset email delivery failed'}));}
 }
}

export async function resetCommunityPassword(tokenValue:unknown,newValue:unknown){
 const token=typeof tokenValue==='string'?tokenValue:'';const password=newPassword(newValue),salt=randomBytes(16).toString('hex'),hash=(await passwordDigest(password,salt)).toString('hex');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new CommunityAuthError('This reset link is invalid or expired.',400);
 await sql.begin(async tx=>{
  const [candidate]=await tx<{user_id:string}[]>`SELECT user_id FROM community_password_resets WHERE token_hash=${sha256(token)} AND expires_at>now()`;
  if(!candidate)throw new CommunityAuthError('This reset link is invalid or expired.',400);
  const [user]=await tx<{status:string}[]>`SELECT status FROM community_users WHERE id=${candidate.user_id} FOR UPDATE`;
  const used=await tx`DELETE FROM community_password_resets WHERE user_id=${candidate.user_id} AND token_hash=${sha256(token)} AND expires_at>now() RETURNING user_id`;
  if(!user||user.status!=='active'||!used.length)throw new CommunityAuthError('This reset link is invalid or expired.',400);
  await tx`UPDATE community_users SET password_salt=${salt},password_hash=${hash},updated_at=now() WHERE id=${candidate.user_id}`;
  await tx`DELETE FROM community_sessions WHERE user_id=${candidate.user_id}`;
  await tx`DELETE FROM community_recovery_codes WHERE user_id=${candidate.user_id}`;
 });
}

export async function pruneCommunitySecurity(){
 const limits=await sql`DELETE FROM community_security_limits WHERE window_start<now()-interval '1 day'`;
 const resets=await sql`DELETE FROM community_password_resets WHERE expires_at<now()-interval '1 day'`;
 return {limits:limits.count,resets:resets.count};
}
