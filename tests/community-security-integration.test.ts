import {tag} from './setup.ts';
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {registerCommunity} from '../apps/api/src/routes/community.ts';
import {registerCommunityMember,loginCommunityMember,communityPrincipal,createCommunityRecoveryCodes,recoverCommunityWithCode,changeCommunityPassword,requestCommunityPasswordReset,resetCommunityPassword} from '../packages/backend/src/community/auth.ts';
import {closeDb,sql} from '../packages/backend/src/db.ts';

const app=Fastify();registerCommunity(app);
after(async()=>{await app.close();await closeDb();});
const first='initial-password-123';
const second='different-password-456';
const third='another-password-789';
const suffix=tag().slice(-7);
const cookie=(token:string)=>`savlume_member=${token}`;

test('recovery codes require the current password and reset only once while revoking sessions',async()=>{
 const {member,token}=await registerCommunityMember({handle:`sm_${suffix}`,email:`member_${suffix}@example.test`,password:first});
 const other=await loginCommunityMember(member.handle,first);
 await assert.rejects(()=>createCommunityRecoveryCodes(member.id,'wrong password'));
 const codes=await createCommunityRecoveryCodes(member.id,first);assert.equal(codes.length,8);
 const stored=await sql`SELECT code_hash FROM community_recovery_codes WHERE user_id=${member.id}`;
 assert.equal(stored.length,8);assert.ok(stored.every(x=>!codes.includes(x.code_hash)));
 const outcomes=await Promise.allSettled([recoverCommunityWithCode(member.handle,codes[0],second),recoverCommunityWithCode(member.handle,codes[0],third)]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(await communityPrincipal(cookie(token)),null);assert.equal(await communityPrincipal(cookie(other.token)),null);
 assert.equal((await sql`SELECT 1 FROM community_recovery_codes WHERE user_id=${member.id}`).length,0);
 await assert.rejects(()=>recoverCommunityWithCode(member.handle,codes[1],third));
 const winner=outcomes[0]!.status==='fulfilled'?second:third;
 await assert.rejects(()=>loginCommunityMember(member.handle,first));
 assert.equal((await loginCommunityMember(member.handle,winner)).member.id,member.id);
});

test('changing a password requires reauthentication and revokes existing sessions and codes',async()=>{
 const {member,token}=await registerCommunityMember({handle:`sc_${suffix}`,password:first});
 await createCommunityRecoveryCodes(member.id,first);
 await assert.rejects(()=>changeCommunityPassword(member.id,'wrong password',second));
 assert.ok(await communityPrincipal(cookie(token)));
 await changeCommunityPassword(member.id,first,second);
 assert.equal(await communityPrincipal(cookie(token)),null);
 assert.equal((await sql`SELECT 1 FROM community_recovery_codes WHERE user_id=${member.id}`).length,0);
 await assert.rejects(()=>loginCommunityMember(member.handle,first));
 assert.equal((await loginCommunityMember(member.handle,second)).member.id,member.id);
});

test('email links use a fragment, expire, work once and do not reveal whether an email exists',async()=>{
 const email=`reset_${suffix}@example.test`;const {member,token}=await registerCommunityMember({handle:`se_${suffix}`,email,password:first});
 let sent='';const deliver=async(_to:string,_subject:string,text:string)=>{sent=text;};
 await requestCommunityPasswordReset('nobody@example.test',deliver);assert.equal(sent,'');
 await requestCommunityPasswordReset(email,deliver);
 const url=new URL(sent.match(/https?:\/\/[^\s]+/)![0]);assert.equal(url.pathname,'/community/account');assert.equal(url.search,'');
 const reset=new URLSearchParams(url.hash.slice(1)).get('reset')!;
 assert.ok(reset);assert.equal((await sql`SELECT token_hash FROM community_password_resets WHERE user_id=${member.id}`)[0]?.token_hash===reset,false);
 await resetCommunityPassword(reset,second);assert.equal(await communityPrincipal(cookie(token)),null);
 await assert.rejects(()=>resetCommunityPassword(reset,third));
 sent='';await requestCommunityPasswordReset(email,deliver);
 const expired=new URLSearchParams(new URL(sent.match(/https?:\/\/[^\s]+/)![0]).hash.slice(1)).get('reset')!;
 await sql`UPDATE community_password_resets SET expires_at=now()-interval '1 second' WHERE user_id=${member.id}`;
 await assert.rejects(()=>resetCommunityPassword(expired,third));
 assert.equal((await loginCommunityMember(member.handle,second)).member.id,member.id);
});

test('security endpoints enforce session CSRF, no-store, and throttle invalid recovery attempts',async()=>{
 const handle=`sh_${suffix}`;const {member,token}=await registerCommunityMember({handle,password:first});
 const response=await app.inject({method:'POST',url:'/api/community/security/recovery-codes',headers:{cookie:cookie(token)},payload:{currentPassword:first}});
 assert.equal(response.statusCode,403);assert.equal(response.headers['cache-control'],'no-store');
 const allowed=await app.inject({method:'POST',url:'/api/community/security/recovery-codes',headers:{cookie:cookie(token),'x-community-csrf':member.csrf},payload:{currentPassword:first}});
 assert.equal(allowed.statusCode,200);assert.equal(allowed.json().codes.length,8);
 let last=0;for(let i=0;i<11;i++){const res=await app.inject({method:'POST',url:'/api/community/recovery/code',payload:{identity:handle,code:'not-a-code',password:second}});last=res.statusCode;}
 assert.equal(last,429);
});
