import { audit } from '../admin/auth.ts';
import { sql } from '../db.ts';
import { awardCommunityPoints,notifyCommunityMember,publicRetailerCheck } from './service.ts';

export async function communityModerationQueue(page=1){
 const limit=50,offset=(Math.max(1,page)-1)*limit;
 const rows=await sql`SELECT p.id,p.kind,p.title,p.body,p.article_id,p.parent_id,p.category,p.merchant_id,p.product_url,p.reported_price_cents,p.offer_terms,p.status,p.ai_decision,p.ai_confidence,p.ai_flags,p.ai_reason,p.created_at,u.id AS user_id,u.handle,u.email,u.points,u.level,c.state AS check_state,c.product_name AS check_product_name,c.price_cents AS check_price_cents,c.seller AS check_seller,c.checked_at AS check_checked_at,
  (SELECT count(*)::int FROM community_reports r WHERE r.post_id=p.id AND r.status='pending') AS reports
  FROM community_posts p JOIN community_users u ON u.id=p.author_id LEFT JOIN community_retailer_checks c ON c.post_id=p.id WHERE p.status='pending_review' OR p.status='pending_ai' OR EXISTS(SELECT 1 FROM community_reports r WHERE r.post_id=p.id AND r.status='pending')
  ORDER BY reports DESC,p.created_at LIMIT ${limit} OFFSET ${offset}`;
 const [count]=await sql`SELECT count(*)::int AS count FROM community_posts p WHERE p.status IN ('pending_review','pending_ai') OR EXISTS(SELECT 1 FROM community_reports r WHERE r.post_id=p.id AND r.status='pending')`;
 return {items:rows.map(r=>({id:r.id,kind:r.kind,title:r.title,body:r.body,articleId:r.article_id,parentId:r.parent_id,category:r.category,merchantId:r.merchant_id,productUrl:r.product_url,reportedPriceCents:r.reported_price_cents===null?null:Number(r.reported_price_cents),offerTerms:r.offer_terms,retailerCheck:publicRetailerCheck(r),status:r.status,aiDecision:r.ai_decision,aiConfidence:r.ai_confidence===null?null:Number(r.ai_confidence),aiFlags:r.ai_flags,aiReason:r.ai_reason,createdAt:r.created_at.toISOString(),author:{id:r.user_id,handle:r.handle,email:r.email,points:Number(r.points),level:Number(r.level)},reports:Number(r.reports)})),total:Number(count.count),page:Math.max(1,page)};
}

export async function communitySubmissions(page=1,status='all'){
 const selected=['pending_ai','reviewing','pending_review','published','rejected','removed'].includes(status)?status:'all';
 const limit=50,offset=(Math.max(1,page)-1)*limit;
 const rows=await sql`SELECT p.id,p.kind,p.title,p.body,p.article_id,p.parent_id,p.category,p.merchant_id,p.product_url,p.reported_price_cents,p.offer_terms,p.status,p.ai_decision,p.ai_confidence,p.ai_flags,p.ai_reason,p.created_at,u.id AS user_id,u.handle,u.email,u.points,u.level,c.state AS check_state,c.product_name AS check_product_name,c.price_cents AS check_price_cents,c.seller AS check_seller,c.checked_at AS check_checked_at,
 (SELECT count(*)::int FROM community_reports r WHERE r.post_id=p.id AND r.status='pending') AS reports
 FROM community_posts p JOIN community_users u ON u.id=p.author_id LEFT JOIN community_retailer_checks c ON c.post_id=p.id WHERE p.kind='offer_submission' AND (${selected}='all' OR p.status=${selected})
 ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
 const [count]=await sql`SELECT count(*)::int AS count FROM community_posts p WHERE p.kind='offer_submission' AND (${selected}='all' OR p.status=${selected})`;
 return {items:rows.map(r=>({id:r.id,kind:r.kind,title:r.title,body:r.body,articleId:r.article_id,parentId:r.parent_id,category:r.category,merchantId:r.merchant_id,productUrl:r.product_url,reportedPriceCents:r.reported_price_cents===null?null:Number(r.reported_price_cents),offerTerms:r.offer_terms,retailerCheck:publicRetailerCheck(r),status:r.status,aiDecision:r.ai_decision,aiConfidence:r.ai_confidence===null?null:Number(r.ai_confidence),aiFlags:r.ai_flags,aiReason:r.ai_reason,createdAt:r.created_at.toISOString(),author:{id:r.user_id,handle:r.handle,email:r.email,points:Number(r.points),level:Number(r.level)},reports:Number(r.reports)})),total:Number(count.count),page:Math.max(1,page),status:selected};
}

export async function reviewCommunityPost(id:string,action:'approve'|'reject'|'remove',reason:string,actor:string){
 if(!['approve','reject','remove'].includes(action))throw Object.assign(new Error('Invalid moderation action.'),{statusCode:400});
 const [before]=await sql`SELECT p.*,u.handle FROM community_posts p JOIN community_users u ON u.id=p.author_id WHERE p.id=${id} FOR UPDATE`;
 if(!before)return null;
 if(!reason.trim())throw Object.assign(new Error('A moderation reason is required.'),{statusCode:400});
 const status=action==='approve'?'published':action==='reject'?'rejected':'removed';
 const [after]=await sql`UPDATE community_posts SET status=${status},moderated_by=${actor.startsWith('admin:')?Number(actor.slice(6)):null},moderation_reason=${reason.trim().slice(0,1000)},published_at=CASE WHEN ${status}='published' THEN coalesce(published_at,now()) ELSE published_at END,updated_at=now() WHERE id=${id} RETURNING id,author_id,kind,status`;
 if(status==='published')await awardCommunityPoints(after.author_id,id,before.kind==='offer_submission'?'approved_offer':'approved_post',before.kind==='offer_submission'?25:10);
 const message=status==='published'?'A moderator approved your contribution. It is now public.':status==='rejected'?'A moderator rejected your contribution. Check your account for details.':'A moderator removed your contribution.';
 await notifyCommunityMember(after.author_id,'moderation',id,message);
 await audit(actor,'community.post-review',id,reason,{status:before.status},{status});
 return {id,status};
}

export async function listCommunityUsers(q='',page=1){
 const limit=50,offset=(Math.max(1,page)-1)*limit,needle=q.trim();
 const rows=await sql`SELECT id,handle,email,status,points,level,created_at,last_login_at FROM community_users
  WHERE (${needle||null}::text IS NULL OR handle ILIKE ${'%'+needle.replace(/[\\%_]/g,'\\$&')+'%'} OR coalesce(email,'') ILIKE ${'%'+needle.replace(/[\\%_]/g,'\\$&')+'%'})
  ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
 const [count]=await sql`SELECT count(*)::int AS count FROM community_users WHERE (${needle||null}::text IS NULL OR handle ILIKE ${'%'+needle.replace(/[\\%_]/g,'\\$&')+'%'} OR coalesce(email,'') ILIKE ${'%'+needle.replace(/[\\%_]/g,'\\$&')+'%'})`;
 return {items:rows.map(r=>({id:r.id,handle:r.handle,email:r.email,status:r.status,points:Number(r.points),level:Number(r.level),createdAt:r.created_at.toISOString(),lastLoginAt:r.last_login_at?.toISOString()??null})),total:Number(count.count),page:Math.max(1,page)};
}

export async function setCommunityUserStatus(id:string,status:'active'|'suspended',reason:string,actor:string){
 if(!reason.trim())throw Object.assign(new Error('A moderation reason is required.'),{statusCode:400});
 const [before]=await sql`SELECT id,handle,status FROM community_users WHERE id=${id}`;if(!before)return null;
 const [after]=await sql`UPDATE community_users SET status=${status},updated_at=now() WHERE id=${id} RETURNING id,handle,status`;
 if(status==='suspended')await sql`DELETE FROM community_sessions WHERE user_id=${id}`;
 await audit(actor,'community.user-status',id,reason,{status:before.status},{status});
 return after;
}
