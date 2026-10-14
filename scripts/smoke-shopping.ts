import assert from 'node:assert/strict';
const base=process.argv[2]??'http://localhost:3000';
for(const path of ['/','/reviews','/flash','/all','/coupons','/news','/daily','/about','/terms','/privacy','/feedback','/agent']){
 const r=await fetch(base+path);const html=await r.text();assert.equal(r.status,200,path);assert.ok(html.includes('Savlume'),path);assert.ok(html.includes('lang="en-US"'),path);assert.ok(!/[\u3400-\u9fff]/.test(html),path+' contains unexpected Chinese');console.log('✓',path);
}
for(const path of ['/api/health','/api/shopping','/api/v1/items','/api/v1/hot-topics','/api/v1/selected/snapshot','/feed.xml','/feed/all.xml','/llms.txt','/robots.txt','/sitemap.xml','/manifest.webmanifest','/openapi-v1.json','/og/site.png','/icon.png','/favicon.ico']){const r=await fetch(base+path);assert.equal(r.status,200,path);console.log('✓',path);}
for(const path of ['/leaderboard','/codex-reset','/.env','/.git/config'])assert.equal((await fetch(base+path)).status,404,path);
assert.equal((await fetch(base+'/api/admin/models')).status,401);
const data=await fetch(base+'/api/shopping?view=top').then(r=>r.json());for(const item of data.items)assert.equal(item.offer.status,'Active');
const latest=await fetch(base+'/api/shopping?view=latest').then(r=>r.json());for(const item of latest.items){assert.ok(!['Expired','Out of Stock'].includes(item.offer.status));assert.ok(!/[\u3400-\u9fff]/.test(item.title+item.summary));}
const mcp=await fetch(base+'/api/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{}})}).then(r=>r.json());assert.equal(mcp.result.serverInfo.name,'dealbrief');
console.log('Shopping smoke checks passed.');
