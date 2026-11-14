// Replace public offers' publisher/redirect URLs with the final retailer product page found by
// following the source page's actual outbound link. Jina Reader is used only when a publisher blocks
// direct redirect requests; its URL Source field reports the final URL after the full redirect chain.
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { cleanMerchantLink, offerIdentity, type Offer } from '@aihot/contracts/shopping';
import { guideFor, isDirectRetailerProductUrl, merchantFor, redirectorFor } from '@aihot/industry/shopping';
import { closeDb, sql } from '@aihot/backend/db';
import { observedLinks } from '@aihot/backend/shopping/offers';
import { guardedFetch } from '@aihot/backend/lib/http-fetch';
import { stopBoss } from '@aihot/backend/jobs/queue';

type Row = { article_id: string; title: string; source_id: string; source_url: string; body_html?: string | null; body_text?: string | null; data: Offer };
type Link = { url: string; text: string };
type ReaderPage = { finalUrl: string; title: string; content: string };
const noReader=process.argv.includes('--no-reader'),includeBens=process.argv.includes('--include-bens'),namedSources=process.argv.includes('--named-sources'),args=process.argv.slice(2).filter(x=>!['--no-reader','--include-bens','--named-sources'].includes(x)),requestedIds=args.flatMap(x=>x.split(',')).filter(x=>/^[\w-]{1,64}$/.test(x)&&!/^[0-9]+$/.test(x));
const ids=requestedIds.length?requestedIds:null;
const maxRows = ids ? ids.length : Math.min(10_000, Math.max(1, Number(args[0] ?? 10_000)));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const browserUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const isDealNewsClick = (raw: string) => { try { const u = new URL(raw); return /^(?:www\.)?dealnews\.com$/.test(u.hostname) && u.pathname === '/lw/click.html'; } catch { return false; } };
const isSlickdealsClick = (raw: string) => { try { const u = new URL(raw); return /^(?:www\.)?slickdeals\.net$/.test(u.hostname) && u.pathname === '/click'; } catch { return false; } };
const baseSpecificProductPath = (raw: string) => { try { const u = new URL(raw); const path=u.pathname.replace(/\/+$/,''); const hasId=['asin','sku','pid','productid','item'].some(k=>u.searchParams.has(k));const merchantId=merchantFor(raw)?.id;if(merchantId==='best-buy'&&/^\/gamers\/?$/i.test(path))return true;if(merchantId==='amazon'&&(/^\/(?:checkpoint|ax\/claim)(?:\/|$)/i.test(path)||u.searchParams.has('token')&&!/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(path)))return false;if(!hasId&&/\/(?:saved-items|wishlist|favorites|shipping|returns?|return-policy|customer-service|contact-us|about-us|faq|store-locator|change-location|change-store|select-location|pickup-location)(?:\/|\.|$)/i.test(path))return false;if(merchantId==='woot'&&/^\/top-?20(?:\/|$)/i.test(path))return false;if(merchantId==='under-armour'&&(/^\/(?:en-us\/)?c\//i.test(path)||/\/(?:outlet|clearance)(?:\/|$)/i.test(path)))return false;if(merchantId==='lululemon'&&/^\/(?:[a-z]{2}-[a-z]{2}\/)?c\//i.test(path))return false;if (!path) return hasId; if(merchantId==='amazon'&&/\/b\/?$/i.test(path))return false;if (/^\/gp\/(?:help|your-account|sign-in|cart|search|browse|customer|redirect)(?:\/|$)/i.test(path)&&!hasId)return false;if (/^\/(?:s|search|deals?|categories?|browse|alldeals|stores|brands?|clearance|sale|shop|plus|collections?|promotions?|library|photos?|games?|gamers?|gaming|video-games|saved-items|wishlist|favorites|my|account|cart|checkout|login|signin|sign-in|auth|checkpoint|ap\/signin|profile|youraccount|services|help|support|home|welcome|create)(?:\/|$)/i.test(path)&&!hasId) return false; if (/^\/store\/(?:home|all-products|prints|photo-books|cards|gifts|deals|same-day-pickup)(?:\/|$)/i.test(path)&&!hasId)return false; if (['q','k','query'].some(k=>u.searchParams.has(k))&&!hasId) return false; return true; } catch { return false; } };
const isDirectPurchase = (raw: string) => {
 try {
  const u=new URL(raw);const path=u.pathname.replace(/\/+$/,'');
  if(/^(?:account|accounts|login|signin|auth|identity|support|help|docs|documentation|forum|forums|community|blog|news|press|corporate|service|services|assets?|cdn|images?|img|media|static|content|gdx-assets)\./i.test(u.hostname)||/\.(?:png|jpe?g|gif|webp|avif|svg|mp4|webm|pdf|zip|xml|json)$/i.test(path)||/\/(?:help|support|customer-service|contact-us|faq|privacy(?:[-_]policy)?|terms(?:[-_]of[-_]use)?|cookie-policy|legal|accessibility|careers?|investor-relations|about(?:-us)?|press-room|media-center|recommendations?|recommended|registry|gift-registry|rewards|track-order|order-status|wishlist|saved-items)(?:\/|\.|$)/i.test(path)||/^\/(?:reauthenticate|reauth|authenticate|authentication|sign-in|signin|login|auth|oauth|session|email[-_]sign[-_]up(?:\.html)?|newsletter(?:[-_]sign[-_]up)?|subscribe|daily[-_]deals?|deal[-_]of[-_]the[-_]day|deals[-_]of[-_]the[-_]day|special[-_]buys?)(?:\/|$)/i.test(path)||merchantFor(raw)?.id==='woot'&&/^\/category\/home(?:\/|$)/i.test(path))return false;
  if(merchantFor(raw)?.id==='bojangles'&&/^\/order\/?$/i.test(path))return isDirectRetailerProductUrl(raw);
  return baseSpecificProductPath(raw)&&isDirectRetailerProductUrl(raw);
 } catch { return false; }
};
const excludedTerms = new Set('a an and at by for from in into of on or the to with new sale deal offer mens men womens women size color colors assorted select free shipping pack piece set premium product bundle bundles game games pc pcd digital download edition collection items item humble store'.split(' '));
function tokens(value: string) { return [...new Set(value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(x => x.length > 2 && !excludedTerms.has(x)))]; }
function productMatches(row: Row, text: string) {
 const product = row.data.product || row.title; const wanted = tokens(product); const normalized = text.toLowerCase().normalize('NFKD');
 if (wanted.length < 2) return false;
 const matched = wanted.filter(word => normalized.includes(word));
 if (matched.length < Math.min(wanted.length, Math.max(2, Math.ceil(wanted.length * 0.6)))) return false;
 const modelCodes = String(row.data.model ?? '').split(/[^A-Za-z0-9]+/).filter(x => /\d/.test(x) && x.length >= 3).map(x => x.toLowerCase());
 return modelCodes.every(code=>normalized.includes(code));
}
function linkRelevance(row:Row,link:Link) {
 const candidate=(link.text+' '+link.url).toLowerCase().normalize('NFKD');
 const codes=String(row.data.model??'').split(/[^A-Za-z0-9]+/).filter(x=>/\d/.test(x)&&x.length>=3);
 const codeHits=codes.filter(code=>candidate.includes(code.toLowerCase())).length;
 const wanted=tokens(String(row.data.product??'')+' '+row.title);const wordHits=wanted.filter(word=>candidate.includes(word)).length;
 return codeHits*100+wordHits*10;
}
function parseReaderPage(body: string): ReaderPage | null {
 const title = body.match(/^Title:\s*(.+)$/mi)?.[1]?.trim() ?? '';
 const rawUrl = body.match(/^URL Source:\s*(\S+)$/mi)?.[1]?.trim();
 if (!rawUrl) return null;
 try {
  const finalUrl = new URL(rawUrl.replaceAll('&amp;', '&'));
  if (!['https:','http:'].includes(finalUrl.protocol) || finalUrl.username || finalUrl.password) return null;
  // The reader can preserve an HTTP URL even when the merchant serves the same product over HTTPS.
  if(finalUrl.protocol==='http:')finalUrl.protocol='https:';
  const marker = body.match(/^Markdown Content:\s*$/mi);
  const content = marker?.index !== undefined ? body.slice(marker.index + marker[0].length).trim() : body;
  return { finalUrl: finalUrl.href, title, content };
 } catch { return null; }
}
let nextReaderAt = 0;
let readerRequests = 0;
let readerBlockedUntil = 0;
let readerQueue:Promise<void>=Promise.resolve();
async function readerFetch(raw: string, followFinal: boolean): Promise<ReaderPage | null> {
 let target: URL;
 try { target = new URL(raw); } catch { return null; }
 if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) return null;
 const endpoint = 'https://r.jina.ai/' + target.protocol + '//' + target.host + target.pathname + target.search;
 const task=readerQueue.then(async()=>{
  {
   if(Date.now()<readerBlockedUntil)return null;
   const wait = Math.max(0, nextReaderAt - Date.now());
   if (wait) await pause(wait);
   try {
    const response = await guardedFetch(endpoint, { route:'direct',timeoutMs: 8_000, maxBytes: 2_500_000, headers: { 'x-return-format': 'markdown', ...(followFinal ? { 'x-base': 'final' } : {}) } });
    readerRequests++;
    nextReaderAt=Date.now()+3_100;
    if (response.status === 429) { readerBlockedUntil=Date.now()+61_000;nextReaderAt=readerBlockedUntil;return null; }
    if (response.status !== 200) return null;
    return parseReaderPage(response.text());
   } catch { nextReaderAt=Date.now()+3_100;return null; }
  }
  return null;
 });
 readerQueue=task.then(()=>undefined,()=>undefined);
 return task;
}
function normalizeAnchor(raw: string, base: string, text: string): Link | null {
 try {
  const u = new URL(raw.replaceAll('&amp;', '&'), base);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || /\.(?:png|jpe?g|gif|webp|svg|mp4|webm)(?:$|\?)/i.test(u.href)) return null;
  return { url: u.href, text: text.replace(/\s+/g, ' ').trim().slice(0, 240) };
 } catch { return null; }
}
function htmlLinks(html: string, base: string): Link[] {
 const $ = load(html); const result: Link[] = [];
 $('a[href],[data-href],[data-url],[data-outbound-url]').each((_i, node) => {
  const el = $(node); const text = el.text().trim() || el.attr('aria-label') || '';
  for (const raw of [el.attr('href'), el.attr('data-href'), el.attr('data-url'), el.attr('data-outbound-url')]) {
   if (!raw) continue; const link = normalizeAnchor(raw, base, text); if (link && !result.some(x => x.url === link.url)) result.push(link);
  }
 });
 return result;
}
function markdownLinks(markdown: string, base: string): Link[] {
 const result: Link[] = []; const re = /\[([^\]]{1,300})\]\((https?:\/\/[^)\s]+)\)/g; let match: RegExpExecArray | null;
 while ((match = re.exec(markdown))) { const link = normalizeAnchor(match[2]!, base, match[1]!); if (link && !result.some(x => x.url === link.url)) result.push(link); }
 return result;
}
function sourceLinkKey(raw:string){try{const u=new URL(raw);if(isSlickdealsClick(raw))return [u.origin,u.pathname,u.searchParams.get('sdtid'),u.searchParams.get('pno'),u.searchParams.get('lno'),u.searchParams.get('trd')].join('|');return u.href;}catch{return raw;}}
function isDealClick(raw: string) { return isDealNewsClick(raw) || isSlickdealsClick(raw); }
function isKnownIntermediary(raw:string) {
 if(guideFor(raw)||redirectorFor(raw)||isDealClick(raw))return true;
 try{return /^(?:buyersguide\.macrumors\.com|corporate\.(?:walmart|homedepot)\.com)$/.test(new URL(raw).hostname);}catch{return false;}
}
function isUsefulPurchaseLink(link: Link) {
 const u = new URL(link.url); const store = merchantFor(link.url);
 if (store?.id === 'humble-bundle' && /^\/store\/(?:c|search|category)(?:\/|$)/i.test(u.pathname)) return false;
 if (store && isDirectPurchase(link.url)) return true;
 if (redirectorFor(link.url) || isDealClick(link.url)) {
  if (isSlickdealsClick(link.url)) {
   const track = (u.searchParams.get('trd') ?? '').toLowerCase(); const action = (u.searchParams.get('action_source') ?? '').toLowerCase();
   return !/deal image|prime trial/.test(track) && (/get deal|shop|buy|redeem|claim|description link|main cta/.test(track+' '+action));
  }
  return true;
 }
 if (guideFor(link.url)) return false;
 return /get deal|shop now|buy now|buy at|shop at|visit retailer|go to (?:store|retailer)|product page|purchase|claim offer/i.test(link.text);
}
function rankLink(link: Link) {
 const text = link.text.toLowerCase(); const u = new URL(link.url); const action = (u.searchParams.get('action_source') ?? '').toLowerCase();
 return (merchantFor(link.url) ? 3 : 0) + (/get deal|shop now|buy now|purchase/.test(text) ? 5 : 0) + (/main cta|sticky bar cta/.test(action) ? 4 : 0) + (/description link/.test(action) ? 2 : 0);
}
async function sourceLinks(row: Row): Promise<Link[]> {
 if(row.body_html===undefined){const [body]=await sql<{body_html:string|null;body_text:string|null}[]>`SELECT body_html,body_text FROM articles WHERE id=${row.article_id}`;row.body_html=body?.body_html??null;row.body_text=body?.body_text??null;}
 const found: Link[] = [];
 const add = (list: Link[]) => { for (const item of list) {const key=sourceLinkKey(item.url),at=found.findIndex(x=>sourceLinkKey(x.url)===key);if(at<0)found.push(item);else if(rankLink(item)>rankLink(found[at]!))found[at]=item;} };
 if (row.body_html) { add(htmlLinks(row.body_html, row.source_url)); add(observedLinks(row.body_html, row.source_url).links); }
 let sourcePageUnavailable=false;
 try {
  const page = await guardedFetch(row.source_url, { route:'direct',timeoutMs: 2_500, maxBytes: 2_000_000, headers: { 'user-agent':browserUA,'accept-language': 'en-US,en;q=0.9' } });
  if (page.status === 200 && !/captcha|access denied|just a moment/i.test(page.text().slice(0, 2000))) add(htmlLinks(page.text(), row.source_url));
  else sourcePageUnavailable=true;
 } catch { sourcePageUnavailable=true; }
 if(noReader)return found.filter(isUsefulPurchaseLink).sort((a,b)=>rankLink(b)-rankLink(a)).slice(0,5);
 if (sourcePageUnavailable && !found.some(link=>merchantFor(link.url)&&isDirectPurchase(link.url))) {
  const page = await readerFetch(row.source_url, false);
  if (page) add(markdownLinks(page.content, page.finalUrl));
 }
 return found.filter(isUsefulPurchaseLink).sort((a,b) => rankLink(b)-rankLink(a)).slice(0, 5);
}
async function verifyNativeRetailer(raw: string, row: Row): Promise<{url:string;merchant:NonNullable<ReturnType<typeof merchantFor>>;title:string}|null> {
 const clean = cleanMerchantLink(raw); const start = merchantFor(clean); if (!start || !isDirectPurchase(clean)) return null;
 try {
  const page = await guardedFetch(clean, { route:'direct',timeoutMs: 4_500, maxBytes: 2_000_000, headers: { 'user-agent':browserUA,'accept-language': 'en-US,en;q=0.9' } });
  if (page.status !== 200) return null;
  const finalUrl = cleanMerchantLink(page.url); const merchant = merchantFor(finalUrl); if (!merchant || merchant.id !== start.id || !isDirectPurchase(finalUrl)) return null;
  const $ = load(page.text()); const title = $('meta[property="og:title"]').attr('content') || $('title').first().text() || '';
  const content = `${title} ${$('meta[name="description"]').attr('content') ?? ''} ${$('body').text()} ${finalUrl}`;
  return productMatches(row, content) ? {url:finalUrl,merchant,title:title.trim().slice(0,240)} : null;
 } catch { return null; }
}
async function followPublisherRedirect(link: Link, row: Row): Promise<{url:string;merchant:NonNullable<ReturnType<typeof merchantFor>>;title:string}|null> {
 try {
  const page=await guardedFetch(link.url,{route:'direct',timeoutMs:8_000,maxBytes:1_500_000,maxRedirects:8,headers:{'user-agent':browserUA,'referer':row.source_url,'accept-language':'en-US,en;q=0.9'}});
  if(page.status===404||page.status===410||page.status>=500)return null;
  const url=cleanMerchantLink(page.url),merchant=merchantFor(url);
  if(!merchant||!isDirectPurchase(url)||guideFor(url)||redirectorFor(url))return null;
  const $=load(page.text());const title=$('meta[property="og:title"]').attr('content')||$('title').first().text()||'';
  const description=$('meta[name="description"]').attr('content')||'';
  // Retailers may return an anti-bot page after the click redirect. The final URL still carries the
  // exact product slug/model, so only accept it when that URL independently matches the offer.
  return productMatches(row,`${title} ${description} ${url}`)?{url,merchant,title:title.trim().slice(0,240)}:null;
 } catch { return null; }
}
async function resolveLink(link: Link, row: Row, depth=0, seen=new Set<string>()): Promise<{url:string;merchant:NonNullable<ReturnType<typeof merchantFor>>;title:string}|null> {
 if(depth>1||seen.has(link.url)||seen.size>3)return null;seen.add(link.url);
 const originalMerchant = merchantFor(link.url);
 if (originalMerchant && isDirectPurchase(link.url)) {
  const direct = await verifyNativeRetailer(link.url, row); if (direct) return direct;
 }
 const followed=isKnownIntermediary(link.url)||redirectorFor(link.url)?null:await followPublisherRedirect(link,row);if(followed)return followed;
 if(noReader)return null;
 const page = await readerFetch(link.url, true); if (!page) return null;
 const finalUrl = cleanMerchantLink(page.finalUrl); const merchant = merchantFor(finalUrl);
 const pageTitle = page.title;
 if (merchant && isDirectPurchase(finalUrl) && !guideFor(finalUrl) && !redirectorFor(finalUrl)) {
  const evidence = `${pageTitle} ${page.content} ${finalUrl} ${link.text}`;
  if (productMatches(row, evidence)) return {url:finalUrl,merchant,title:pageTitle.slice(0,240)};
 }
 if(depth===1)return null;
 const expectedMerchant=merchant?.id??originalMerchant?.id??null;
 const possible=markdownLinks(page.content,page.finalUrl).filter(candidate=>{
  if(!isUsefulPurchaseLink(candidate))return false;
  const next=merchantFor(candidate.url);
  return !expectedMerchant||!next||next.id===expectedMerchant;
 });
 const hasProductContext=possible.some(candidate=>linkRelevance(row,candidate)>0);
 const nested=possible.sort((a,b)=>(hasProductContext?linkRelevance(row,b)-linkRelevance(row,a):0)||rankLink(b)-rankLink(a)).slice(0,1);
 for(const candidate of nested){const resolved=await resolveLink(candidate,row,depth+1,seen);if(resolved)return resolved;}
 return null;
}
async function saveLink(row: Row, url: string, merchant: NonNullable<ReturnType<typeof merchantFor>>) {
 return sql.begin(async tx => {
  const [current] = await tx<{data:Offer}[]>`SELECT data FROM shopping_offers WHERE article_id=${row.article_id} FOR UPDATE`;
  if (!current) return false;
  if (current.data.buyUrl && merchantFor(current.data.buyUrl) && isDirectPurchase(current.data.buyUrl)) return false;
  if ((current.data.buyUrl ?? null) !== (row.data.buyUrl ?? null)) return false;
  const data = { ...current.data, buyUrl:url, merchant:merchant.name, merchantId:merchant.id } as Offer;
  const identity = offerIdentity(data); data.identity = identity ? createHash('sha256').update(identity).digest('hex') : null;
  const [prior] = await tx`SELECT max(id)::text AS max_id FROM shopping_price_observations WHERE article_id=${row.article_id}`;
  await tx`UPDATE shopping_offers SET data=${tx.json(data as never)},identity_key=${data.identity},updated_at=now() WHERE article_id=${row.article_id}`;
  await tx`UPDATE shopping_price_observations h SET offer_context=shopping_price_context(d.data) FROM shopping_offers d WHERE d.article_id=${row.article_id} AND h.article_id=d.article_id`;
  if (prior?.max_id) await tx`DELETE FROM shopping_price_observations WHERE article_id=${row.article_id} AND id>${prior.max_id}::bigint`;
  return true;
 });
}
async function clearIntermediaryLink(row: Row) {
 return sql.begin(async tx => {
  const [current]=await tx<{data:Offer}[]>`SELECT data FROM shopping_offers WHERE article_id=${row.article_id} FOR UPDATE`;
  if(!current||(current.data.buyUrl??null)!==(row.data.buyUrl??null))return false;
  if(!current.data.buyUrl||merchantFor(current.data.buyUrl)&&isDirectPurchase(current.data.buyUrl))return false;
  const data={...current.data,buyUrl:null,merchant:null,merchantId:null} as Offer;
  const identity=offerIdentity(data);data.identity=identity?createHash('sha256').update(identity).digest('hex'):null;
  const [prior]=await tx`SELECT max(id)::text AS max_id FROM shopping_price_observations WHERE article_id=${row.article_id}`;
  await tx`UPDATE shopping_offers SET data=${tx.json(data as never)},identity_key=${data.identity},updated_at=now() WHERE article_id=${row.article_id}`;
  await tx`UPDATE shopping_price_observations h SET offer_context=shopping_price_context(d.data) FROM shopping_offers d WHERE d.article_id=${row.article_id} AND h.article_id=d.article_id`;
  if(prior?.max_id)await tx`DELETE FROM shopping_price_observations WHERE article_id=${row.article_id} AND id>${prior.max_id}::bigint`;
  return true;
 });
}

try {
 const rows = await sql<Row[]>`
  SELECT d.article_id,a.title,a.source_id,a.url AS source_url,d.data
  FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id JOIN articles a ON a.id=d.article_id
  WHERE p.visibility='public'
    AND (NOT ${namedSources}::boolean OR a.source_id IN ('shopping-dealnews','shopping-search-dealnews','shopping-slickdeals','shopping-search-slickdeals','shopping-bensbargains','shopping-search-bensbargains'))
    AND (${includeBens}::boolean OR a.source_id<>'shopping-bensbargains' OR ${ids}::text[] IS NOT NULL)
    AND nullif(d.data->>'buyUrl','') IS NULL
    AND (${ids}::text[] IS NULL OR d.article_id=ANY(${ids}::text[]))
    AND d.data->>'kind' IN ('product_deal','coupon_offer','cashback_offer','freebie')
  ORDER BY p.timeline_at DESC LIMIT ${maxRows}`;
 const linkPriority=(row:Row)=>row.data.buyUrl?(merchantFor(row.data.buyUrl)&&isDirectPurchase(row.data.buyUrl)?2:0):1;
 rows.sort((a,b)=>linkPriority(a)-linkPriority(b));
 const stats={alreadyDirect:0,resolved:0,unresolved:0,cleared:0,checkedLinks:0};
 async function processRow(row:Row){
  const existing=row.data.buyUrl;
  if (existing && merchantFor(existing) && isDirectPurchase(existing)) { stats.alreadyDirect++; return; }
  let saved=false;const attempted=new Set<string>();
  if (existing && !guideFor(existing) && isUsefulPurchaseLink({url:existing,text:'Get deal'})) {
   attempted.add(sourceLinkKey(existing));
   stats.checkedLinks++;
   const target=await resolveLink({url:existing,text:'Get deal'},row);
   if (target && await saveLink(row,target.url,target.merchant)) {
    stats.resolved++;saved=true;
    console.log(JSON.stringify({event:'resolved',id:row.article_id,source:row.source_id,merchant:target.merchant.name,url:target.url,pageTitle:target.title}));
   }
  }
  if (saved) return;
  const candidates=await sourceLinks(row);
  for (const candidate of candidates) {
   const key=sourceLinkKey(candidate.url);if(attempted.has(key))continue;attempted.add(key);
   if (!isUsefulPurchaseLink(candidate)) continue;
   stats.checkedLinks++;
   const target=await resolveLink(candidate,row);
   if (!target) continue;
   if (await saveLink(row,target.url,target.merchant)) {
    stats.resolved++; saved=true;
    console.log(JSON.stringify({event:'resolved',id:row.article_id,source:row.source_id,merchant:target.merchant.name,url:target.url,pageTitle:target.title}));
    break;
   }
  }
  if (!saved) {
   if(existing&&(isKnownIntermediary(existing)||merchantFor(existing)&&!isDirectPurchase(existing))&&await clearIntermediaryLink(row))stats.cleared++;
   stats.unresolved++;
  }
 }
 const rowConcurrency=6;
 for(let start=0;start<rows.length;start+=rowConcurrency){
  const batch=rows.slice(start,start+rowConcurrency);
  const outcomes=await Promise.allSettled(batch.map(processRow));
  for(const result of outcomes)if(result.status==='rejected'){stats.unresolved++;console.log(JSON.stringify({event:'row-error',message:String(result.reason).slice(0,240)}));}
  const scanned=Math.min(start+batch.length,rows.length);
  if(scanned%6===0||scanned===rows.length)console.log(JSON.stringify({event:'progress',scanned,total:rows.length,...stats,readerRequests}));
 }
 console.log(JSON.stringify({event:'complete',scanned:rows.length,...stats,readerRequests}));
} finally { await stopBoss(); await closeDb(); }
