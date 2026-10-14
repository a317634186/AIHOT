import './setup.ts';
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {buildApp} from '../apps/api/src/app.ts';
import {sql,closeDb} from '@aihot/backend/db';
import {normaliseHit,trafficDay} from '@aihot/backend/site/traffic';
import {siteStats} from '@aihot/backend/admin/stats';
const app=await buildApp();
after(async()=>{await app.close();await closeDb();});
test('page views and outbound clicks are counted anonymously; bots, admin paths and junk are dropped',async()=>{
 const ua='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';
 assert.equal(normaliseHit({t:'view',p:'/admin/stats'},ua),null);
 assert.equal(normaliseHit({t:'view',p:'/items/abc'},'Googlebot/2.1'),null);
 assert.equal(normaliseHit({t:'view',p:'javascript:alert(1)'},ua),null);
 assert.deepEqual(normaliseHit({t:'view',p:'/items/abc?utm=1',r:'https://www.google.com/search?q=x'},ua),{kind:'view',path:'/items/abc',referrer:'google.com',destination:null});
 const day=trafficDay();const path='/traffic-test-'+Math.random().toString(36).slice(2,8);
 const send=(body:unknown,ip:string)=>app.inject({method:'POST',url:'/api/site/hit',headers:{'content-type':'text/plain','user-agent':ua,'x-real-ip':ip},payload:JSON.stringify(body)});
 for(const ip of ['203.0.113.1','203.0.113.1','203.0.113.2'])assert.equal((await send({t:'view',p:path,r:'https://news.example/post'},ip)).statusCode,204);
 assert.equal((await send({t:'click',p:path,h:'https://www.amazon.com/dp/B000'},'203.0.113.1')).statusCode,204);
 assert.equal((await send({t:'view',p:path},'203.0.113.3')).statusCode,204); // counted
 assert.equal((await app.inject({method:'POST',url:'/api/site/hit',headers:{'content-type':'text/plain','user-agent':'curl/8.0'},payload:JSON.stringify({t:'view',p:path})})).statusCode,204); // bot: dropped
 const [views]=await sql`SELECT hits FROM traffic_hits WHERE day=${day} AND kind='view' AND path=${path}`;assert.equal(views!.hits,4);
 const [clicks]=await sql`SELECT hits FROM traffic_hits WHERE day=${day} AND kind='click' AND path=${path+'→amazon.com'}`;assert.equal(clicks!.hits,1);
 const [ref]=await sql`SELECT hits FROM traffic_referrers WHERE day=${day} AND host='news.example'`;assert.ok(ref!.hits>=3);
 const visitors=await sql`SELECT count(*)::int AS n FROM traffic_visitors WHERE day=${day}`;assert.ok(visitors[0]!.n>=3);
 const stats=await siteStats(7);
 assert.equal(stats.labels.length,7);assert.ok(stats.traffic.today.views>=4);assert.ok(stats.traffic.paths.some(r=>r.path===path));
 assert.ok(Array.isArray(stats.sources)&&'coverage' in stats.content&&stats.pipeline.receiptsDaily.length===7);
 await sql`DELETE FROM traffic_hits WHERE path LIKE ${path+'%'}`;
});
