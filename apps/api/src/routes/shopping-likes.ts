import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from '@aihot/backend/db';
import { config } from '@aihot/backend/config';
import { shoppingItems, shoppingLikes } from '@aihot/backend/publication/shopping';
import { feedbackSourceHash } from '@aihot/backend/operations/feedback';

export function registerShoppingLikes(app:FastifyInstance){
 const recent=new Map<string,{at:number;count:number}>();
 const visitor=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value)?createHash('sha256').update(value).digest('hex'):null;
 app.get('/api/shopping/:id/likes',async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  const {id}=req.params as {id:string};
  if(!(await shoppingItems({id})).items.length)return reply.code(404).send({error:'Not found'});
  return shoppingLikes(id,visitor(req.headers['x-dealbrief-visitor']));
 });
 app.post('/api/shopping/:id/likes',{bodyLimit:1024},async(req,reply)=>{
  reply.header('Cache-Control','no-store');
  if(req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==new URL(config.siteUrl).origin))return reply.code(403).send({error:'Origin not allowed'});
  const body=req.body as {visitorId?:unknown;liked?:unknown}|null;
  const hash=visitor(body?.visitorId);
  if(!hash||typeof body?.liked!=='boolean')return reply.code(400).send({error:'Invalid like'});
  const source=feedbackSourceHash(req.ip,String(req.headers['user-agent']??''));const now=Date.now();
  for(const [key,value] of recent)if(now-value.at>60000)recent.delete(key);
  const hits=recent.get(source)??{at:now,count:0};
  if(hits.count>=30||recent.size>10000)return reply.header('Retry-After','60').code(429).send({error:'Please try again shortly'});
  hits.count++;recent.set(source,hits);
  const {id}=req.params as {id:string};
  if(!(await shoppingItems({id})).items.length)return reply.code(404).send({error:'Not found'});
  if(body.liked)await sql`INSERT INTO shopping_likes(article_id,visitor_hash) VALUES(${id},${hash}) ON CONFLICT DO NOTHING`;
  else await sql`DELETE FROM shopping_likes WHERE article_id=${id} AND visitor_hash=${hash}`;
  return shoppingLikes(id,hash);
 });
}
