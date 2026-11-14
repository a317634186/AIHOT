import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.ts';
import { cents, cleanMerchantLink,affiliateLink,isOffer, type Offer } from '@aihot/contracts/shopping';
import { merchantFor } from '@aihot/industry/shopping';
import {isCommunitySubmissionUrl} from './submissions.ts';
import { sql } from '../db.ts';
import { feedbackSourceHash } from '../operations/feedback.ts';
import { shoppingItems } from '../publication/shopping.ts';
import { sendPush, type PushSubscriptionInput } from '../notify/push.ts';
import { audit } from '../admin/auth.ts';
import type { CommunityMember } from './auth.ts';

export type CommunityPostKind='offer_submission'|'product_comment'|'discussion'|'reply'|'review_submission';
export type CommunityType='question'|'review';
export interface CommunityPost {id:string;kind:CommunityPostKind;communityType:CommunityType|null;title:string|null;body:string;images:string[];articleId:string|null;parentId:string|null;category:string|null;merchantId:string|null;productUrl:string|null;reportedPriceCents:number|null;reportedPaidCents:number|null;retailerCheck:{state:string;productName:string|null;priceCents:number|null;seller:string|null;checkedAt:string|null}|null;offerType:'product'|'event';endsOn:string|null;reportedEndPassed:boolean;status:string;handle:string;points:number;createdAt:string;publishedAt:string|null;voteScore:number;replyCount:number;}
const plain=(value:unknown,max:number)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const scoreLevel=(points:number)=>points>=500?4:points>=200?3:points>=75?2:points>=20?1:0;
const postId=()=>randomBytes(16).toString('hex');
const contentHash=(kind:string,title:string|null,body:string,link:string|null)=>createHash('sha256').update([kind,title??'',body,link??''].join('\n').toLowerCase()).digest('hex');
export async function notifyCommunityMember(userId:string,kind:string,postIdValue:string,message:string){
 await sql`INSERT INTO community_notifications(user_id,kind,post_id,message) VALUES(${userId},${kind},${postIdValue},${message.slice(0,240)})`;
 const subscriptions=await sql<{id:number;address:string;push_keys:PushSubscriptionInput['keys']}[]>`SELECT DISTINCT ON(address) id,address,push_keys FROM price_watches WHERE community_user_id=${userId} AND channel='push' AND confirmed_at IS NOT NULL AND push_keys IS NOT NULL ORDER BY address,created_at DESC LIMIT 3`;
 for(const subscription of subscriptions)void sendPush({endpoint:subscription.address,keys:subscription.push_keys},{title:'Savlume Community',body:message.slice(0,120),url:'/community'}).then(ok=>{if(!ok)return sql`DELETE FROM price_watches WHERE id=${subscription.id}`;}).catch(()=>{});
}
export const publicRetailerCheck=(r:any)=>r.check_state?{state:['verified','out_of_stock'].includes(r.check_state)&&r.check_checked_at&&Date.now()-r.check_checked_at.getTime()>6*3600000?'stale':r.check_state,productName:r.check_product_name??null,priceCents:r.check_price_cents===null?null:Number(r.check_price_cents),seller:r.check_seller??null,checkedAt:r.check_checked_at?.toISOString()??null}:null;
const publicPost=(r:any):CommunityPost=>({id:r.id,kind:r.kind,communityType:r.community_type??null,title:r.title??null,body:r.body,images:Array.isArray(r.offer_terms?.images)?r.offer_terms.images.map((image:any)=>`/api/community/images/${encodeURIComponent(r.id)}/${encodeURIComponent(String(image.id))}`):[],articleId:r.article_id??null,parentId:r.parent_id??null,category:r.category??null,merchantId:r.merchant_id??null,productUrl:affiliateLink(r.product_url??null),reportedPriceCents:r.reported_price_cents===null?null:Number(r.reported_price_cents),reportedPaidCents:r.community_type==='review'&&r.offer_terms?.reportedPaid===true&&r.reported_price_cents!==null?Number(r.reported_price_cents):null,retailerCheck:publicRetailerCheck(r),offerType:r.offer_terms?.type==='event'?'event':'product',endsOn:r.offer_terms?.endsOn??null,reportedEndPassed:!!r.reported_end_passed,status:r.status,handle:r.handle,points:Number(r.points??0),createdAt:r.created_at.toISOString(),publishedAt:r.published_at?.toISOString()??null,voteScore:Number(r.vote_score??0),replyCount:Number(r.reply_count??0)});

export async function createCommunityPost(member:CommunityMember,input:Record<string,unknown>,ip:string,userAgent:string){
 const kind=String(input.kind??'') as CommunityPostKind;
 if(!['offer_submission','product_comment','discussion','reply','review_submission'].includes(kind))throw Object.assign(new Error('Choose a supported community post type.'),{statusCode:400});
 let title=plain(input.title,180)||null,articleId=typeof input.articleId==='string'?input.articleId.trim():null;const body=plain(input.body,5000),parentId=typeof input.parentId==='string'?input.parentId.trim():null,category=plain(input.category,64)||null;
 let merchantId:string|null=null,productUrl:string|null=null,reportedPriceCents:number|null=null;let offerTerms:{type?:string;endsOn?:string;reportedPaid?:boolean;images?:Array<{id:string;mime:string}>}={};
 if(body.length<(kind==='product_comment'?2:10))throw Object.assign(new Error(kind==='product_comment'?'Write a comment before posting.':'Write at least 10 characters.'),{statusCode:400});
 if((kind==='discussion'||kind==='review_submission')&&(!title||title.length<5))throw Object.assign(new Error('Add a clear title.'),{statusCode:400});
 const communityType:CommunityType|null=kind==='discussion'?'question':kind==='review_submission'?'review':kind==='product_comment'?input.communityType==='question'?'question':'review':null;
 if(kind==='product_comment'){
  const product=articleId?(await shoppingItems({id:articleId})).items[0]:null;
  if(!product||!product.indexable)throw Object.assign(new Error('Choose a published product page.'),{statusCode:404});
 }
 if(kind==='review_submission'){
  const rawUrl=typeof input.productUrl==='string'?input.productUrl.trim():'';
  if(rawUrl){const merchant=merchantFor(rawUrl);if(!merchant||!isCommunitySubmissionUrl(rawUrl,'product'))throw Object.assign(new Error('Use a direct product page from a supported retailer.'),{statusCode:400});merchantId=merchant.id;productUrl=cleanMerchantLink(rawUrl);}
  if(typeof input.articleId==='string'&&input.articleId.trim()){const product=(await shoppingItems({id:input.articleId.trim()})).items[0];if(!product?.indexable)throw Object.assign(new Error('Choose a published product page.'),{statusCode:404});articleId=product.id;}
  if(!articleId&&!productUrl)throw Object.assign(new Error('Add the product page so readers know which item you reviewed.'),{statusCode:400});
  const paid=cents(typeof input.paidPrice==='string'||typeof input.paidPrice==='number'?input.paidPrice:null);if(paid===null&&String(input.paidPrice??'').trim()||paid!==null&&paid>2147483647)throw Object.assign(new Error('Enter a valid amount paid or leave it blank.'),{statusCode:400});reportedPriceCents=paid;offerTerms={type:'review',reportedPaid:paid!==null};
 }
 if(kind==='reply'){
  if(!parentId)throw Object.assign(new Error('Choose a discussion to reply to.'),{statusCode:400});
  const [parent]=await sql<{id:string;kind:string;status:string;author_id:string}[]>`SELECT id,kind,status,author_id FROM community_posts WHERE id=${parentId}`;
  if(!parent||parent.status!=='published'||parent.kind!=='discussion')throw Object.assign(new Error('This discussion is not available.'),{statusCode:404});
 }
 if(kind==='offer_submission'){
  const type=input.offerType==='event'?'event':'product';
  if(title&&title.length<5||type==='event'&&!title)throw Object.assign(new Error('Add a clear title for the deal or event.'),{statusCode:400});
  const rawUrl=typeof input.productUrl==='string'?input.productUrl.trim():'';
  const merchant=merchantFor(rawUrl);
  if(!merchant||!isCommunitySubmissionUrl(rawUrl,type))throw Object.assign(new Error('Use a direct product or sale page from a supported retailer.'),{statusCode:400});
  merchantId=merchant.id;productUrl=cleanMerchantLink(rawUrl);
  const amount=cents(typeof input.price==='string'||typeof input.price==='number'?input.price:null);
  if(amount===null&&String(input.price??'').trim())throw Object.assign(new Error('Enter a valid USD price shown by the retailer.'),{statusCode:400});
  if(amount!==null&&amount>2147483647)throw Object.assign(new Error('Enter a valid USD price shown by the retailer.'),{statusCode:400});
  reportedPriceCents=amount;
  const endsOn=String(input.endsOn??'').trim();
  if(endsOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)||Number.isNaN(Date.parse(endsOn))||new Date(endsOn).toISOString().slice(0,10)!==endsOn))throw Object.assign(new Error('Enter a valid end date.'),{statusCode:400});
  offerTerms={type,...(endsOn?{endsOn}:{})};if(!title)title='Shared product deal';
 }
 const hash=contentHash(kind,title,body,productUrl),ipHash=feedbackSourceHash(ip,userAgent);
 const count=kind==='offer_submission'?5:kind==='discussion'||kind==='review_submission'?6:12;
 const [limits]=await sql<{user_count:number;ip_count:number}[]>`SELECT
  (SELECT count(*)::int FROM community_posts WHERE author_id=${member.id} AND created_at>now()-interval '24 hours') AS user_count,
  (SELECT count(*)::int FROM community_posts WHERE ip_hash=${ipHash} AND created_at>now()-interval '24 hours') AS ip_count`;
 if(Number(limits?.user_count??0)>=count||Number(limits?.ip_count??0)>=30)throw Object.assign(new Error('You have reached the posting limit. Please try again later.'),{statusCode:429});
 const id=postId();
 let imageFile:string|null=null;
 if(kind==='product_comment'&&input.image&&typeof input.image==='object'){
  const image=input.image as {mime?:unknown;data?:unknown};
  const mime=String(image.mime??'');
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(mime)||typeof image.data!=='string')throw Object.assign(new Error('Choose a PNG, JPG, WebP, or GIF image.'),{statusCode:400});
  const data=Buffer.from(image.data,'base64');
  if(!data.length||data.length>5*1024*1024)throw Object.assign(new Error('Comment images must be 5 MB or smaller.'),{statusCode:400});
  const imageId=randomBytes(16).toString('hex');
  const ext=({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif' } as Record<string,string>)[mime]!;
  imageFile=path.join(config.dataDir,'community-images',`${id}-${imageId}.${ext}`);
  await mkdir(path.dirname(imageFile),{recursive:true});
  await writeFile(imageFile,data,{flag:'wx'});
  offerTerms.images=[{id:imageId,mime}];
 }
 try{
  await sql`INSERT INTO community_posts(id,author_id,kind,community_type,article_id,parent_id,category,title,body,merchant_id,product_url,reported_price_cents,offer_terms,ip_hash,content_hash)
   VALUES(${id},${member.id},${kind},${communityType},${kind==='product_comment'||kind==='review_submission'?articleId:null},${kind==='reply'?parentId:null},${category},${title},${body},${merchantId},${productUrl},${reportedPriceCents},${sql.json(offerTerms)},${ipHash},${hash})`;
  if(kind==='reply'&&parentId){const [parent]=await sql<{author_id:string}[]>`SELECT author_id FROM community_posts WHERE id=${parentId}`;if(parent&&parent.author_id!==member.id)await notifyCommunityMember(parent.author_id,'reply',id,member.handle+' replied to your discussion.');}
 }catch(error){if(imageFile)await import('node:fs/promises').then(fs=>fs.unlink(imageFile!).catch(()=>{}));if((error as {code?:string}).code==='23505')throw Object.assign(new Error('You already submitted this post.'),{statusCode:409});throw error;}
 return {id,status:'pending_ai',message:'Your post was received and is being checked before it appears.'};
}

export async function communityFeed(opts:{kind?:string;communityType?:CommunityType;articleId?:string;category?:string;limit?:number;offset?:number}={}){
 const limit=Math.max(1,Math.min(Number.isFinite(opts.limit)?Math.floor(opts.limit!):30,60));
 const offset=Math.max(0,Math.min(Number.isFinite(opts.offset)?Math.floor(opts.offset!):0,100000));
 const rows=await sql`SELECT p.id,p.kind,p.community_type,p.title,p.body,p.article_id,p.parent_id,p.category,p.merchant_id,p.product_url,p.reported_price_cents,p.offer_terms,p.status,p.created_at,p.published_at,
  u.handle,u.points,c.state AS check_state,c.product_name AS check_product_name,c.price_cents AS check_price_cents,c.seller AS check_seller,c.checked_at AS check_checked_at,coalesce((p.offer_terms->>'endsOn') < to_char(now() AT TIME ZONE 'America/New_York','YYYY-MM-DD'),false) AS reported_end_passed,
  COALESCE((SELECT sum(v.value)::int FROM community_votes v WHERE v.target_type='post' AND v.target_id=p.id),0) AS vote_score,
  (SELECT count(*)::int FROM community_posts reply WHERE reply.parent_id=p.id AND reply.status='published') AS reply_count
  FROM community_posts p JOIN community_users u ON u.id=p.author_id LEFT JOIN community_retailer_checks c ON c.post_id=p.id
  WHERE p.status='published' AND p.kind<>'reply'
   AND (${opts.kind??null}::text IS NULL OR p.kind=${opts.kind??null})
   AND (${opts.communityType??null}::text IS NULL OR p.community_type=${opts.communityType??null})
   AND (${opts.articleId??null}::text IS NULL OR p.article_id=${opts.articleId??null})
   AND (${opts.category??null}::text IS NULL OR p.category=${opts.category??null})
  ORDER BY p.published_at DESC,p.created_at DESC,p.id DESC LIMIT ${limit} OFFSET ${offset}`;
 let posts=rows.map(publicPost);
 if(posts.some(p=>p.kind==='offer_submission'||p.kind==='product_comment'||p.kind==='review_submission')){
  const ids=posts.filter(p=>p.kind==='offer_submission'||p.kind==='product_comment'||p.kind==='review_submission').map(p=>p.articleId??p.id);
  const ratings=await communityArticleRatings(ids);
  posts=posts.map(p=>{const rating=ratings.get(p.articleId??p.id);return rating?{...p,voteScore:rating.worthIt-rating.notWorthIt}:p;});
 }
 return posts;
}

export async function communityPostDetail(id:string){
 const [r]=await sql`SELECT p.id,p.kind,p.community_type,p.title,p.body,p.article_id,p.parent_id,p.category,p.merchant_id,p.product_url,p.reported_price_cents,p.offer_terms,p.status,p.created_at,p.published_at,u.handle,u.points,c.state AS check_state,c.product_name AS check_product_name,c.price_cents AS check_price_cents,c.seller AS check_seller,c.checked_at AS check_checked_at,coalesce((p.offer_terms->>'endsOn') < to_char(now() AT TIME ZONE 'America/New_York','YYYY-MM-DD'),false) AS reported_end_passed,
  COALESCE((SELECT sum(v.value)::int FROM community_votes v WHERE v.target_type='post' AND v.target_id=p.id),0) AS vote_score,
  (SELECT count(*)::int FROM community_posts reply WHERE reply.parent_id=p.id AND reply.status='published') AS reply_count
  FROM community_posts p JOIN community_users u ON u.id=p.author_id LEFT JOIN community_retailer_checks c ON c.post_id=p.id WHERE p.id=${id} AND p.status='published'`;
 if(!r)return null;
 const replies=await sql`SELECT p.id,p.kind,p.community_type,p.title,p.body,p.article_id,p.parent_id,p.category,p.merchant_id,p.product_url,p.reported_price_cents,p.offer_terms,p.status,p.created_at,p.published_at,u.handle,u.points,
  COALESCE((SELECT sum(v.value)::int FROM community_votes v WHERE v.target_type='post' AND v.target_id=p.id),0) AS vote_score,
  0::int AS reply_count FROM community_posts p JOIN community_users u ON u.id=p.author_id WHERE p.parent_id=${id} AND p.status='published' ORDER BY p.published_at,p.created_at LIMIT 100`;
 return {post:publicPost(r),replies:replies.map(publicPost)};
}

export async function setCommunityVote(member:CommunityMember,targetType:'article'|'post',targetId:string,value:number){
 if(value!==-1&&value!==0&&value!==1)throw Object.assign(new Error('Vote must be -1, 0, or 1.'),{statusCode:400});
 if(targetType==='article'){
  const item=(await shoppingItems({id:targetId})).items[0];if(!item?.indexable||!isOffer(item.offer))throw Object.assign(new Error('This product page is not available for deal ratings.'),{statusCode:404});targetId=item.id;
 }else{
  const [post]=await sql`SELECT id FROM community_posts WHERE id=${targetId} AND status='published'`;if(!post)throw Object.assign(new Error('This post is not available.'),{statusCode:404});
 }
 if(value===0)await sql`DELETE FROM community_votes WHERE user_id=${member.id} AND target_type=${targetType} AND target_id=${targetId}`;
 else await sql`INSERT INTO community_votes(user_id,target_type,target_id,value) VALUES(${member.id},${targetType},${targetId},${value}) ON CONFLICT(user_id,target_type,target_id) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
 const [summary]=await sql`SELECT coalesce(sum(value),0)::int AS score,count(*)::int AS votes,count(*) FILTER(WHERE value=1)::int AS worth_it,count(*) FILTER(WHERE value=-1)::int AS not_worth_it,coalesce(max(value) FILTER(WHERE user_id=${member.id}),0)::int AS mine FROM community_votes WHERE target_type=${targetType} AND target_id=${targetId}`;
 return {targetType,targetId,score:Number(summary.score),votes:Number(summary.votes),worthIt:Number(summary.worth_it),notWorthIt:Number(summary.not_worth_it),myVote:Number(summary.mine)};
}

export async function communityVoteSummary(targetType:'article'|'post',targetId:string,memberId?:string){
 const [summary]=await sql`SELECT coalesce(sum(value),0)::int AS score,count(*)::int AS votes,count(*) FILTER(WHERE value=1)::int AS worth_it,count(*) FILTER(WHERE value=-1)::int AS not_worth_it,coalesce(max(value) FILTER(WHERE user_id=${memberId??null}),0)::int AS mine FROM community_votes WHERE target_type=${targetType} AND target_id=${targetId}`;
 return {score:Number(summary.score),votes:Number(summary.votes),worthIt:Number(summary.worth_it),notWorthIt:Number(summary.not_worth_it),myVote:Number(summary.mine)};
}

export async function communityArticleRatings(ids:string[]){
 const unique=[...new Set(ids)].slice(0,20_000);const map=new Map<string,{worthIt:number;notWorthIt:number}>();if(!unique.length)return map;
 const rows=await sql`SELECT target_id,count(*) FILTER(WHERE value=1)::int AS worth_it,count(*) FILTER(WHERE value=-1)::int AS not_worth_it FROM community_votes WHERE target_type='article' AND target_id=ANY(${unique}::text[]) GROUP BY target_id`;
 for(const r of rows)map.set(r.target_id,{worthIt:Number(r.worth_it),notWorthIt:Number(r.not_worth_it)});return map;
}

export async function setBookmark(member:CommunityMember,articleId:string,saved:boolean){
 const item=(await shoppingItems({id:articleId})).items[0];if(!item?.indexable)throw Object.assign(new Error('This product page is not available.'),{statusCode:404});
 if(saved)await sql`INSERT INTO community_bookmarks(user_id,article_id) VALUES(${member.id},${item.id}) ON CONFLICT DO NOTHING`;
 else await sql`DELETE FROM community_bookmarks WHERE user_id=${member.id} AND article_id=${item.id}`;
 return {articleId:item.id,saved};
}

export async function memberBookmarks(member:CommunityMember){
 return sql<{article_id:string;created_at:Date}[]>`SELECT article_id,created_at FROM community_bookmarks WHERE user_id=${member.id} ORDER BY created_at DESC LIMIT 200`;
}

export async function memberWatches(member:CommunityMember){
 return sql<{id:number;article_id:string;channel:string;baseline_cents:number;confirmed_at:Date|null;last_notified_cents:number|null;created_at:Date}[]>`SELECT id,article_id,channel,baseline_cents,confirmed_at,last_notified_cents,created_at FROM price_watches WHERE community_user_id=${member.id} ORDER BY created_at DESC LIMIT 200`;
}

export async function stopMemberWatch(member:CommunityMember,id:number){
 const rows=await sql`DELETE FROM price_watches WHERE id=${id} AND community_user_id=${member.id}`;return {removed:rows.count>0};
}

export async function deleteCommunityAccount(member:CommunityMember){
 await audit(`community:${member.id}`,'community.account-delete',member.id,'Member requested account deletion.',{account:'community member'},{deleted:true});
 await sql.begin(async tx=>{
  await tx`DELETE FROM community_votes WHERE user_id=${member.id} OR (target_type='post' AND target_id IN (SELECT id FROM community_posts WHERE author_id=${member.id}))`;
  await tx`DELETE FROM price_watches WHERE community_user_id=${member.id}`;
  await tx`DELETE FROM community_users WHERE id=${member.id}`;
 });
 return {deleted:true};
}

export async function memberNotifications(member:CommunityMember){
 const rows=await sql`SELECT id,kind,post_id,message,created_at,read_at FROM community_notifications WHERE user_id=${member.id} ORDER BY created_at DESC LIMIT 100`;
 return rows.map(r=>({id:Number(r.id),kind:r.kind,postId:r.post_id,message:r.message,createdAt:r.created_at.toISOString(),readAt:r.read_at?.toISOString()??null}));
}

export async function markCommunityNotificationRead(member:CommunityMember,id:number){
 await sql`UPDATE community_notifications SET read_at=coalesce(read_at,now()) WHERE id=${id} AND user_id=${member.id}`;return {ok:true};
}

export async function reportCommunityPost(member:CommunityMember,id:string,reason:string){
 const [post]=await sql`SELECT id FROM community_posts WHERE id=${id} AND status='published'`;if(!post)throw Object.assign(new Error('This post is not available.'),{statusCode:404});
 const clean=plain(reason,500);if(clean.length<5)throw Object.assign(new Error('Add a short reason for the report.'),{statusCode:400});
 const [recent]=await sql`SELECT count(*)::int AS count FROM community_reports WHERE reporter_id=${member.id} AND created_at>now()-interval '24 hours'`;if(Number(recent.count)>=20)throw Object.assign(new Error('You have reached the daily report limit.'),{statusCode:429});
 await sql`INSERT INTO community_reports(post_id,reporter_id,reason) VALUES(${id},${member.id},${clean}) ON CONFLICT(post_id,reporter_id) DO UPDATE SET reason=EXCLUDED.reason,status='pending',created_at=now()`;
 return {reported:true};
}

export function memberLevel(points:number){return points>=500?4:points>=200?3:points>=75?2:points>=20?1:0;}
export async function awardCommunityPoints(userId:string,postId:string,reason:string,points:number){
 return sql.begin(async tx=>{
  const [event]=await tx<{user_id:string}[]>`INSERT INTO community_point_events(user_id,post_id,reason,points) VALUES(${userId},${postId},${reason},${points}) ON CONFLICT DO NOTHING RETURNING user_id`;
  if(!event)return false;
  await tx`UPDATE community_users SET points=points+${points},level=CASE WHEN points+${points}>=500 THEN 4 WHEN points+${points}>=200 THEN 3 WHEN points+${points}>=75 THEN 2 WHEN points+${points}>=20 THEN 1 ELSE 0 END,updated_at=now() WHERE id=${userId}`;
  return true;
 });
}
