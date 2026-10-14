import assert from 'node:assert/strict';
import {load} from 'cheerio';
const base=process.argv[2]??'http://localhost:3000';
const first=await fetch(base+'/api/v1/items?mode=all&limit=24').then(r=>r.json());
const second=await fetch(base+'/api/v1/items?mode=all&limit=24&offset=24').then(r=>r.json());
assert.ok(first.items.length>0);if(first.hasMore)assert.notEqual(first.items[0].id,second.items[0].id);
const item=first.items.find((x:any)=>x.offer.product&&x.indexable)??first.items[0];
const path='/items/'+item.id;
const r=await fetch(base+path);assert.equal(r.status,200);const $=load(await r.text());
const graph=JSON.parse($('script[type="application/ld+json"]').text());const article=graph.find((n:any)=>n['@type']==='Article');
assert.equal(article.headline,item.title);assert.equal(article.dateModified,item.updatedAt);assert.ok(graph.some((x:any)=>x['@type']==='Organization'&&x['@id'].endsWith('#organization')));
assert.ok($('link[rel=alternate][type="text/markdown"]').length);assert.ok($('.db-evidence-time').text().includes('Content updated:'));
const markdown=await fetch(base+path+'/markdown');assert.equal(markdown.status,200);assert.match(markdown.headers.get('content-type')!,/text\/markdown/);assert.match(markdown.headers.get('link')!,/rel="canonical"/);assert.match(markdown.headers.get('x-robots-tag')!,/noindex/);const text=await markdown.text();assert.ok(text.includes(item.sourceUrl));assert.ok(text.includes(item.offer.status));
assert.equal((await fetch(base+'/items/not-real/markdown')).status,404);
const guide=await fetch(base+'/llms.txt').then(r=>r.text());assert.ok(guide.includes('mode=all'));assert.ok(guide.includes('markdown'));assert.ok(guide.includes('Unverified'));
const rss=load(await fetch(base+'/feed/all.xml').then(r=>r.text()),{xmlMode:true});assert.ok(rss('item').length);
const agents=['Googlebot','bingbot','OAI-SearchBot/1.0','ChatGPT-User/1.0'];
const probe=[];for(const ua of agents){for(const route of ['/','/flash',path,'/robots.txt']){const start=Date.now();const response=await fetch(base+route,{headers:{'user-agent':ua}});const html=await response.text();assert.equal(response.status,200,ua+' '+route);assert.ok(!/cf-chl-|Just a moment\.\.\./.test(html));probe.push({ua,route,status:response.status,ms:Date.now()-start});}}
console.log(JSON.stringify({machineFeed:first.total,canonicalArticle:path,markdown:'passed',linkedEntities:'passed',visibleTimestamps:'passed',allRssItems:rss('item').length,crawlerUserAgentProbes:probe,note:'User-agent probes are not proof of actual indexing or verification of crawler IP ranges.'}));
