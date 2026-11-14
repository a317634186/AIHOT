import type { FastifyInstance,FastifyReply,FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '@aihot/backend/config';
import { sql } from '@aihot/backend/db';
import { communityCookie,communityPrincipal,endCommunitySession,loginCommunityMember,registerCommunityMember,changeCommunityPassword,createCommunityRecoveryCodes,recoverCommunityWithCode,requestCommunityPasswordReset,resetCommunityPassword,communitySecurityLimit,CommunityAuthError,type CommunityMember } from '@aihot/backend/community/auth';
import { emailConfigured } from '@aihot/backend/notify/email';
import { communityFeed,communityPostDetail,createCommunityPost,deleteCommunityAccount,memberBookmarks,memberNotifications,memberWatches,markCommunityNotificationRead,reportCommunityPost,setBookmark,setCommunityVote,stopMemberWatch,communityVoteSummary } from '@aihot/backend/community/service';
import { shoppingItems } from '@aihot/backend/publication/shopping';
import { sendProblem } from '../http/respond.ts';

const attempts=new Map<string,{at:number;count:number}>();
function rateLimited(ip:string,key:string,limit:number){const now=Date.now();const id=`${ip}:${key}`;const prior=attempts.get(id);if(!prior||now-prior.at>15*60_000){attempts.set(id,{at:now,count:1});return false;}prior.count++;if(attempts.size>10000)for(const [k,v] of attempts)if(now-v.at>15*60_000)attempts.delete(k);return prior.count>limit;}
function originAllowed(req:FastifyRequest){const origin=req.headers.origin;return req.headers['sec-fetch-site']!=='cross-site'&&(!origin||origin===new URL(config.siteUrl).origin);}
async function memberFor(req:FastifyRequest,reply:FastifyReply,write=false):Promise<CommunityMember|null>{
 reply.header('Cache-Control','no-store');const member=await communityPrincipal(req.headers.cookie);
 if(!member){reply.code(401).send({error:'Sign in to use the community.'});return null;}
 if(write&&(!originAllowed(req)||req.headers['x-community-csrf']!==member.csrf)){reply.code(403).send({error:'Session check failed. Refresh and try again.'});return null;}
 return member;
}
function fail(reply:FastifyReply,error:unknown){if(error instanceof CommunityAuthError)return reply.code(error.status).send({error:error.message});const status=(error as {statusCode?:number})?.statusCode;if(status)return reply.code(status).send({error:(error as Error).message});throw error;}

export function registerCommunity(app:FastifyInstance){
 app.post('/api/community/register',async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!originAllowed(req))return reply.code(403).send({error:'Origin not allowed'});
  if(rateLimited(String(req.ip),'community-register',5))return reply.header('Retry-After','900').code(429).send({error:'Too many registration attempts. Try again later.'});
  try{const b=(req.body??{}) as Record<string,unknown>;const result=await registerCommunityMember({handle:b.handle,password:b.password,email:b.email},String(req.headers['user-agent']??''));reply.header('Set-Cookie',communityCookie(result.token));return reply.code(201).send({user:result.member});}catch(error){return fail(reply,error);}
 });
 app.post('/api/community/login',async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!originAllowed(req))return reply.code(403).send({error:'Origin not allowed'});
  if(rateLimited(String(req.ip),'community-login',10))return reply.header('Retry-After','900').code(429).send({error:'Too many sign-in attempts. Try again later.'});
  try{const b=(req.body??{}) as Record<string,unknown>;if(await communitySecurityLimit('login-identity',String(b.identity??''),20)||await communitySecurityLimit('login-ip',String(req.ip),30))return reply.header('Retry-After','900').code(429).send({error:'Too many sign-in attempts. Try again later.'});const result=await loginCommunityMember(b.identity,b.password,String(req.headers['user-agent']??''));reply.header('Set-Cookie',communityCookie(result.token));return reply.send({user:result.member});}catch(error){return fail(reply,error);}
 });
 app.get('/api/community/recovery-options',async(_req,reply)=>{reply.header('Cache-Control','no-store');return {email:emailConfigured()};});
 app.post('/api/community/recovery/request',async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!originAllowed(req))return reply.code(403).send({error:'Origin not allowed'});
  const b=(req.body??{}) as Record<string,unknown>;
  if(await communitySecurityLimit('recovery-request-ip',String(req.ip),10)||await communitySecurityLimit('recovery-request-email',String(b.email??''),3))return reply.header('Retry-After','900').code(429).send({error:'Too many requests. Try again later.'});
  try{await requestCommunityPasswordReset(b.email);return {message:'If an eligible account exists, a reset email will be sent.'};}catch(error){return fail(reply,error);}
 });
 app.post('/api/community/recovery/reset',async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!originAllowed(req))return reply.code(403).send({error:'Origin not allowed'});
  if(await communitySecurityLimit('recovery-reset-ip',String(req.ip),20))return reply.header('Retry-After','900').code(429).send({error:'Too many attempts. Try again later.'});
  const b=(req.body??{}) as Record<string,unknown>;try{await resetCommunityPassword(b.token,b.password);return reply.header('Set-Cookie',communityCookie('',0)).send({ok:true});}catch(error){return fail(reply,error);}
 });
 app.post('/api/community/recovery/code',async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!originAllowed(req))return reply.code(403).send({error:'Origin not allowed'});
  const b=(req.body??{}) as Record<string,unknown>;
  if(await communitySecurityLimit('recovery-code-ip',String(req.ip),15)||await communitySecurityLimit('recovery-code-identity',String(b.identity??''),10))return reply.header('Retry-After','900').code(429).send({error:'Too many attempts. Try again later.'});
  try{await recoverCommunityWithCode(b.identity,b.code,b.password);return reply.header('Set-Cookie',communityCookie('',0)).send({ok:true});}catch(error){return fail(reply,error);}
 });
 app.post('/api/community/security/password',async(req,reply)=>{
  const member=await memberFor(req,reply,true);if(!member)return;
  if(await communitySecurityLimit('security-password',member.id,10))return reply.header('Retry-After','900').code(429).send({error:'Too many attempts. Try again later.'});
  const b=(req.body??{}) as Record<string,unknown>;try{await changeCommunityPassword(member.id,b.currentPassword,b.password);return reply.header('Set-Cookie',communityCookie('',0)).send({ok:true});}catch(error){return fail(reply,error);}
 });
 app.post('/api/community/security/recovery-codes',async(req,reply)=>{
  const member=await memberFor(req,reply,true);if(!member)return;
  if(await communitySecurityLimit('security-codes',member.id,10))return reply.header('Retry-After','900').code(429).send({error:'Too many attempts. Try again later.'});
  const b=(req.body??{}) as Record<string,unknown>;try{return {codes:await createCommunityRecoveryCodes(member.id,b.currentPassword)};}catch(error){return fail(reply,error);}
 });
 app.get('/api/community/me',async(req,reply)=>{reply.header('Cache-Control','no-store');const user=await communityPrincipal(req.headers.cookie);return {user:user?{id:user.id,handle:user.handle,email:user.email,points:user.points,level:user.level,csrf:user.csrf}:null};});
 app.post('/api/community/logout',async(req,reply)=>{const member=await memberFor(req,reply,true);if(!member)return;await endCommunitySession(req.headers.cookie);return reply.header('Set-Cookie',communityCookie('',0)).code(204).send();});
 app.delete('/api/community/account',async(req,reply)=>{const member=await memberFor(req,reply,true);if(!member)return;await deleteCommunityAccount(member);return reply.header('Set-Cookie',communityCookie('',0)).send({deleted:true});});
 app.get('/api/community/feed',async(req,reply)=>{reply.header('Cache-Control','public, max-age=30, s-maxage=60, stale-while-revalidate=120');const q=req.query as Record<string,string|undefined>;const n=Number(q.limit);const limit=Number.isFinite(n)&&n>=1?Math.min(50,Math.floor(n)):30;const offset=Number(q.offset);const rows=await communityFeed({kind:q.kind,communityType:q.communityType==='question'||q.communityType==='review'?q.communityType:undefined,articleId:q.articleId,category:q.category,limit:limit+1,offset:Number.isFinite(offset)?offset:0});return {items:rows.slice(0,limit),hasMore:rows.length>limit};});
 app.get('/api/community/comments/:articleId',async(req,reply)=>{reply.header('Cache-Control','public, max-age=15, s-maxage=30, stale-while-revalidate=60');const {articleId}=req.params as {articleId:string};return {items:await communityFeed({kind:'product_comment',articleId,limit:50})};});
 app.get('/api/community/images/:postId/:imageId',async(req,reply)=>{
  const {postId,imageId}=req.params as {postId:string;imageId:string};
  if(!/^[a-f0-9]{32}$/.test(postId)||!/^[a-f0-9]{32}$/.test(imageId))return reply.code(404).send();
  const [post]=await sql<{mime:string}[]>`SELECT image->>'mime' AS mime FROM community_posts p CROSS JOIN LATERAL jsonb_array_elements(p.offer_terms->'images') image WHERE p.id=${postId} AND p.status='published' AND image->>'id'=${imageId} LIMIT 1`;
  if(!post)return reply.code(404).send();
  const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'} as Record<string,string>)[post.mime];
  if(!ext)return reply.code(404).send();
  try{return reply.header('Content-Type',post.mime).header('Cache-Control','public, max-age=31536000, immutable').send(await readFile(path.join(config.dataDir,'community-images',`${postId}-${imageId}.${ext}`)));}catch{return reply.code(404).send();}
 });
 app.get('/api/community/posts/:id',async(req,reply)=>{reply.header('Cache-Control','public, max-age=15, s-maxage=30, stale-while-revalidate=60');const {id}=req.params as {id:string};const detail=await communityPostDetail(id);if(!detail)return reply.code(404).send({error:'Post not found'});return detail;});
 app.post('/api/community/posts',async(req,reply)=>{
  const member=await memberFor(req,reply,true);if(!member)return;
  try{const result=await createCommunityPost(member,(req.body??{}) as Record<string,unknown>,String(req.headers['x-real-ip']??req.ip??''),String(req.headers['user-agent']??''));return reply.code(202).send(result);}catch(error){return fail(reply,error);}
 });
 app.post('/api/community/votes',async(req,reply)=>{
  const member=await memberFor(req,reply,true);if(!member)return;
  const b=(req.body??{}) as Record<string,unknown>;
  if(!['article','post'].includes(String(b.targetType))||typeof b.targetId!=='string')return reply.code(400).send({error:'Choose a post or product to vote on.'});
  try{return await setCommunityVote(member,b.targetType as 'article'|'post',b.targetId,Number(b.value));}catch(error){return fail(reply,error);}
 });
 app.post('/api/community/reports',async(req,reply)=>{const member=await memberFor(req,reply,true);if(!member)return;const b=(req.body??{}) as Record<string,unknown>;if(typeof b.postId!=='string')return reply.code(400).send({error:'Choose a post to report.'});try{return await reportCommunityPost(member,b.postId,String(b.reason??''));}catch(error){return fail(reply,error);}});
 app.get('/api/community/votes/:type/:id',async(req,reply)=>{reply.header('Cache-Control','no-store');const {type,id}=req.params as {type:string;id:string};if(!['article','post'].includes(type))return reply.code(400).send({error:'Invalid vote target.'});const member=await communityPrincipal(req.headers.cookie);return communityVoteSummary(type as 'article'|'post',id,member?.id);});
 app.post('/api/community/bookmarks',async(req,reply)=>{const member=await memberFor(req,reply,true);if(!member)return;const b=(req.body??{}) as Record<string,unknown>;if(typeof b.articleId!=='string'||typeof b.saved!=='boolean')return reply.code(400).send({error:'Invalid bookmark request.'});try{return await setBookmark(member,b.articleId,b.saved);}catch(error){return fail(reply,error);}});
 app.get('/api/community/bookmarks',async(req,reply)=>{const member=await memberFor(req,reply);if(!member)return;const rows=await memberBookmarks(member);const data=await shoppingItems({ids:rows.map(r=>r.article_id),limit:100});return {items:data.items.map(item=>({...item,savedAt:rows.find(r=>r.article_id===item.id)?.created_at.toISOString()}))};});
 app.get('/api/community/watches',async(req,reply)=>{const member=await memberFor(req,reply);if(!member)return;const rows=await memberWatches(member);const data=await shoppingItems({ids:rows.map(r=>r.article_id),limit:100});return {items:rows.map(w=>({id:w.id,articleId:w.article_id,channel:w.channel,baselineCents:w.baseline_cents,confirmedAt:w.confirmed_at?.toISOString()??null,lastNotifiedCents:w.last_notified_cents,createdAt:w.created_at.toISOString(),offer:data.items.find(x=>x.id===w.article_id)??null}))};});
 app.delete('/api/community/watches/:id',async(req,reply)=>{const member=await memberFor(req,reply,true);if(!member)return;const id=Number((req.params as {id:string}).id);if(!Number.isSafeInteger(id)||id<=0)return reply.code(400).send({error:'Invalid alert id.'});return stopMemberWatch(member,id);});
 app.get('/api/community/notifications',async(req,reply)=>{const member=await memberFor(req,reply);if(!member)return;return {items:await memberNotifications(member)};});
 app.post('/api/community/notifications/:id/read',async(req,reply)=>{const member=await memberFor(req,reply,true);if(!member)return;const id=Number((req.params as {id:string}).id);if(!Number.isSafeInteger(id)||id<=0)return reply.code(400).send({error:'Invalid notification id.'});return markCommunityNotificationRead(member,id);});
 app.get('/api/community/my-posts',async(req,reply)=>{const member=await memberFor(req,reply);if(!member)return;const rows=await sql`SELECT id,kind,title,body,article_id,parent_id,category,merchant_id,product_url,reported_price_cents,status,created_at,published_at,ai_reason FROM community_posts WHERE author_id=${member.id} ORDER BY created_at DESC LIMIT 100`;return {items:rows.map(r=>({id:r.id,kind:r.kind,title:r.title,body:r.body,articleId:r.article_id,parentId:r.parent_id,category:r.category,merchantId:r.merchant_id,productUrl:r.product_url,priceCents:r.reported_price_cents===null?null:Number(r.reported_price_cents),status:r.status,createdAt:r.created_at.toISOString(),publishedAt:r.published_at?.toISOString()??null,moderationNote:r.ai_reason}))};});
}
