import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { BudgetExceededError } from '@aihot/backend/providers/receipts';
import { config } from '@aihot/backend/config';
import { findShoppingDeals } from '@aihot/backend/shopping/assistant';

const Body=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(600)})).min(1).max(24)}).strict();
const requests=new Map<string,number[]>();
const WINDOW_MS=60_000;
const REQUESTS_PER_MINUTE=5;

function originAllowed(request:FastifyRequest){
 const origin=request.headers.origin;
 return request.headers['sec-fetch-site']!=='cross-site'&&(!origin||origin===new URL(config.siteUrl).origin);
}

function rateLimited(ip:string){
 const now=Date.now(),recent=(requests.get(ip)??[]).filter(at=>now-at<WINDOW_MS);
 if(recent.length>=REQUESTS_PER_MINUTE){requests.set(ip,recent);return true;}
 recent.push(now);requests.set(ip,recent);
 if(requests.size>10_000)for(const [key,times] of requests)if(!times.some(at=>now-at<WINDOW_MS))requests.delete(key);
 return false;
}

export function registerShoppingAiAssistant(app:FastifyInstance){
 app.post('/api/ai-assistant',{bodyLimit:8192},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  if(!originAllowed(request))return reply.code(403).send({error:'Origin not allowed'});
  if(rateLimited(String(request.ip)))return reply.header('Retry-After','60').code(429).send({error:'Too many assistant requests. Please wait a minute and try again.'});
  const parsed=Body.safeParse(request.body);
  if(!parsed.success)return reply.code(400).send({error:'Send a shopping question to get started.'});
  const userQuery=parsed.data.messages.slice().reverse().find(message=>message.role==='user')?.content.trim()??'';
  if(!userQuery)return reply.code(400).send({error:'Query is required.'});
  try{return await findShoppingDeals(userQuery);}
  catch(error){
   if(error instanceof BudgetExceededError)return reply.code(429).send({error:'The shopping assistant is at its request limit. Please try again later.'});
   request.log.warn({err:error instanceof Error?error.message:'assistant request failed'},'AI shopping assistant request failed');
   return reply.code(503).send({error:'I ran into a temporary issue searching current deals. Please try again.'});
  }
 });
}
