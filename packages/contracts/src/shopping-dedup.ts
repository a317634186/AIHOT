import { MERCHANTS, isDirectRetailerEventUrl, isDirectRetailerProductUrl, merchantFor } from '@aihot/industry/shopping';
import { cleanMerchantLink, isOffer, type Offer } from './shopping.ts';

const norm = (value: string | null | undefined) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normList = (values: string[] | null | undefined) =>
  (values ?? []).map(norm).filter(Boolean).sort().join('|');

export function cleanPromoCode(raw: string | null | undefined): string | null {
  let value = String(raw ?? '').trim();
  if (!value) return null;
  for (let pass = 0; pass < 6; pass++) {
    const next = value.replace(/^(?:apply\s+|with\s+|promo(?:tional)?\s+|coupon\s+|code\s*[:=#]?\s*)+/i, '').trim();
    if (next === value) break;
    value = next;
  }
  value = value.replace(/\s+(?:at\s+)?checkout\.?$/i, '').replace(/[\s.,;:!?]+$/g, '').trim();
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/i.test(value) ? value : null;
}

const IGNORED_PRODUCT_QUERY_PARAMS = new Set([
  'language', 'psc', 'smid', 'crid', 'dib', 'dib_tag', 'keywords', 'qid', 'sprefix', 'sr',
  'ie', 'plpredirect', 'lv', 'channelid', 'btn_type', 'btn_ref',
]);

/** Stable product target key across different publisher tracking/query variations for the same item. */
export function canonicalProductTargetKey(raw: string | null | undefined): string | null {
  if (!raw || !isDirectRetailerProductUrl(raw)) return null;
  try {
    const cleaned = cleanMerchantLink(raw);
    const u = new URL(cleaned);
    const merchant = merchantFor(u.href);
    if (!merchant) return null;
    if (merchant.id === 'amazon') {
      const asin =
        u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1] ??
        u.searchParams.get('ASIN') ??
        u.searchParams.get('asin');
      if (asin && /^[A-Z0-9]{10}$/i.test(asin)) return `amazon:asin:${asin.toUpperCase()}`;
    }
    if (merchant.id === 'walmart') {
      const itemId = u.pathname.match(/\/ip\/(?:[^/]+\/)?(\d{5,20})(?:[/?#]|$)/i)?.[1];
      if (itemId) return `walmart:ip:${itemId}`;
    }
    if (merchant.id === 'target') {
      const tcin = u.pathname.match(/\/A-(\d{5,15})(?:[/?#]|$)/i)?.[1];
      if (tcin) return `target:a:${tcin}`;
    }
    if (merchant.id === 'home-depot') {
      const id = u.pathname.match(/\/p\/[^/]+\/(\d{6,15})(?:[/?#]|$)/i)?.[1];
      if (id) return `home-depot:p:${id}`;
    }
    if (merchant.id === 'best-buy') {
      const sku =
        u.pathname.match(/\/(\d{6,10})\.p(?:[/?#]|$)/i)?.[1] ??
        u.pathname.match(/\/sku\/(\d{6,10})(?:[/?#]|$)/i)?.[1];
      if (sku) return `best-buy:sku:${sku}`;
    }
    u.hash = '';
    u.pathname = u.pathname.replace(/\/ref=[^/]*$/i, '').replace(/\/+$/, '') || '/';
    for (const key of [...u.searchParams.keys()]) {
      if (IGNORED_PRODUCT_QUERY_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return `${merchant.id}:url:${u.origin.toLowerCase()}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

const PLAIN_COUPON_WORDS = new Set([
  'apply', 'checkout', 'promo', 'promotion', 'promotional', 'coupon', 'discount',
  'voucher', 'select', 'items', 'offer', 'orders', 'save', 'extra', 'free', 'shipping',
]);

/** Normalizes coupon descriptions to their underlying promo code when an explicit code is stated. */
export function normalizedCouponKey(coupon: string | null | undefined): string {
  const raw = coupon?.trim() ?? '';
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{4,28}$/.test(raw) && !PLAIN_COUPON_WORDS.has(raw.toLowerCase())) {
    return `code:${raw.toLowerCase()}`;
  }
  const afterKeyword = raw.match(/\b(?:code|coupon)\s*[:\"']?\s*([A-Z0-9_-]{4,28})\b/);
  if (afterKeyword?.[1] && !PLAIN_COUPON_WORDS.has(afterKeyword[1].toLowerCase())) {
    return `code:${afterKeyword[1].toLowerCase()}`;
  }
  const alnumCode = raw.match(/\b(?=[A-Z0-9]{5,24}\b)(?=[A-Z0-9]*\d)[A-Z0-9]+\b/);
  if (alnumCode?.[0]) return `code:${alnumCode[0].toLowerCase()}`;
  if (/\bclip\b/i.test(raw)) return 'clip';
  return norm(raw);
}

export function inferredEventMerchantId(title: string, offer: Pick<Offer, 'merchantId' | 'merchant' | 'seller' | 'buyUrl'>): string | null {
  if (offer.merchantId) return offer.merchantId;
  if (offer.buyUrl) {
    const byUrl = merchantFor(offer.buyUrl);
    if (byUrl) return byUrl.id;
  }
  const text = ` ${norm(`${offer.merchant ?? ''} ${offer.seller ?? ''} ${title}`)} `;
  for (const m of MERCHANTS) {
    const candidates = [m.name, m.id.replaceAll('-', ' ')];
    if (candidates.some((c) => { const k = norm(c); return k.length >= 3 && text.includes(` ${k} `); })) {
      return m.id;
    }
  }
  return null;
}

const EVENT_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'via', 'from', 'at', 'on', 'in', 'of', 'by', 'to', 'up', 'off',
  'extra', 'save', 'savings', 'free', 'shipping', 'shipped', 'prime', 'member', 'members',
  'order', 'orders', 'code', 'promo', 'coupon', 'sale', 'sales', 'event', 'events',
  'deal', 'deals', 'offer', 'offers', 'item', 'items', 'good', 'goods', 'product', 'products',
  'select', 'selected', 'multiple', 'multi', 'category', 'categories', 'across', 'more',
  'plus', 'starting', 'only', 'just', 'all', 'part', 'ii', 'iii', 'iv', 'new', 'storewide', 'sitewide',
]);

export function isBroadPromotionItem(title: string, offer: Offer): boolean {
  if (['storewide', 'event', 'multi_product'].includes(offer.activityScope ?? '')) return true;
  if (offer.buyUrl && isDirectRetailerEventUrl(offer.buyUrl) && !isDirectRetailerProductUrl(offer.buyUrl)) return true;
  if (!isOffer(offer) && offer.kind === 'shopping_news' && /\b(?:warehouse\s+clean[- ]?out|open[- ]?box\s+(?:clearance|sale)|site[- ]?wide|store[- ]?wide|clearance\s+(?:event|sale))\b/i.test(title)) {
    return true;
  }
  return false;
}

/** Campaign key for broad storewide / multi-product / clearance events so duplicate coverage collapses to one listing. */
export function eventCampaignKey(title: string, offer: Offer): string | null {
  if (!isBroadPromotionItem(title, offer)) return null;
  const merchantId = inferredEventMerchantId(title, offer);
  if (!merchantId) return null;
  const merchantObj = MERCHANTS.find((m) => m.id === merchantId);
  const merchantTokens = new Set(
    [merchantId.replaceAll('-', ' '), merchantObj?.name ?? '']
      .flatMap((s) => norm(s).split(' '))
      .filter((w) => w.length >= 2),
  );

  // Strip subdomain references like "sellout.woot" or "tools.woot" before splitting lead clause
  const preCleaned = title.replace(/\b[a-z0-9-]+\.woot(?:\.com)?\b/gi, 'Woot');
  const colonIdx = preCleaned.search(/[:—–]/);
  let lead = colonIdx > 4 ? preCleaned.slice(0, colonIdx) : preCleaned;
  lead = lead
    .replace(/\b(?:up to|starting at|starting from)\s+\$?\d[\s\S]*$/i, '')
    .replace(/\b(?:at|from|via)\s+[A-Z][\w'& .-]{1,30}$/i, '');

  const hasClearance = /\bclearance\b/i.test(lead) || /\bclearance\b/i.test(preCleaned);
  const rawTokens = norm(lead)
    .split(' ')
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !merchantTokens.has(w) && !EVENT_STOP_WORDS.has(w) && w !== 'clearance');

  const unique = [...new Set(rawTokens)];
  if (unique.length < 2 && hasClearance) unique.push('clearance');

  const codeFromCoupon = normalizedCouponKey(offer.coupon);
  const codeFromTitle = preCleaned.match(/\b(?:code|coupon)\s+([A-Z0-9]{4,24})\b/)?.[1]?.toLowerCase() ?? null;
  const code = codeFromCoupon.startsWith('code:') ? codeFromCoupon.slice(5) : codeFromTitle;

  if (!unique.length && !code) return null;
  unique.sort();
  return `${merchantId}|event:${unique.join(' ')}${code ? `|code:${code}` : ''}`;
}

function sellerGroupKey(d: Offer): string {
  const seller = norm(d.seller);
  const merchant = norm(d.merchant ?? d.merchantId);
  if (!seller) return 'unknown';
  const base = seller.split(' via ')[0]!.replace(/\b(?:com|inc|llc|ltd|corp|corporation|company)\b/g, '').trim();
  const retail = merchant.replace(/\b(?:com|inc|llc|ltd|corp|corporation|company)\b/g, '').trim();
  return base === retail || base === norm(d.merchantId) ? 'retailer' : 'seller:' + base;
}

function productNameCompatible(a: Offer, b: Offer): boolean {
  const am = norm(a.model), bm = norm(b.model);
  if (am && bm) return am === bm;
  const tokens = (v: string | null) =>
    norm(v)
      .split(' ')
      .filter((w) => w.length >= 2 && !/^(?:the|and|for|with|all|new|mens|womens|pack|set)$/.test(w));
  const left = new Set(tokens(a.product ?? a.model));
  const right = new Set(tokens(b.product ?? b.model));
  if (!left.size || !right.size) return false;
  const shared = [...left].filter((w) => right.has(w)).length;
  return shared / Math.min(left.size, right.size) >= 0.6;
}

export function sameRetailerProductDeal(a: Offer, b: Offer): boolean {
  const dealKinds = new Set(['product_deal', 'coupon_offer', 'cashback_offer', 'freebie']);
  if (!dealKinds.has(a.kind) || !dealKinds.has(b.kind) || !a.merchantId || a.merchantId !== b.merchantId) return false;
  if (['storewide', 'event', 'multi_product'].includes(a.activityScope ?? '') || ['storewide', 'event', 'multi_product'].includes(b.activityScope ?? '')) return false;
  const url = canonicalProductTargetKey(a.buyUrl);
  if (!url || url !== canonicalProductTargetKey(b.buyUrl)) return false;
  if (!productNameCompatible(a, b)) return false;
  const price = a.checkoutPriceCents ?? a.listedPriceCents;
  const otherPrice = b.checkoutPriceCents ?? b.listedPriceCents;
  if (price === null || price === undefined || price !== otherPrice || (a.currency || 'USD') !== (b.currency || 'USD')) return false;
  const av = norm(a.variant), bv = norm(b.variant);
  if (av && bv && av !== bv) return false;
  const ac = norm(a.condition), bc = norm(b.condition);
  if (ac !== bc && !(ac === '' && bc === 'new') && !(bc === '' && ac === 'new')) return false;
  const as = sellerGroupKey(a), bs = sellerGroupKey(b);
  if (as !== bs && !(as === 'unknown' && bs === 'retailer') && !(bs === 'unknown' && as === 'retailer')) return false;
  if (normalizedCouponKey(a.coupon) !== normalizedCouponKey(b.coupon)) return false;
  for (const field of ['minimumSpend', 'membership', 'subscription', 'renewal', 'cashback', 'giftCard', 'points', 'unitLabel'] as const) {
    if (norm(a[field]) !== norm(b[field])) return false;
  }
  if ((a.unitQuantity ?? null) !== (b.unitQuantity ?? null)) return false;
  const ar = norm(a.region), br = norm(b.region);
  if (ar !== br && !(ar === '' && br === 'us') && !(br === '' && ar === 'us')) return false;
  const restrictions = (d: Offer) =>
    normList((d.restrictions ?? []).filter((x) => !/^\s*(?:product |item |store )?availability for store pickup may vary by location\.?\s*$/i.test(x)));
  if (restrictions(a) !== restrictions(b)) return false;
  const shipping = (value: string | null) => {
    const n = norm(value);
    if (!n) return '';
    return /\bfree\b.*\bshipping\b|\bshipping\b.*\bfree\b/.test(n) && !/(?:prime|member|minimum|order|eligible|qualif|subscription)/.test(n) ? 'free shipping' : n;
  };
  const sa = shipping(a.shipping), sb = shipping(b.shipping);
  if (sa !== sb && !((sa === '' || sa === 'free shipping') && (sb === '' || sb === 'free shipping'))) return false;
  const ended = (d: Offer) => d.status === 'Expired' || d.status === 'Out of Stock';
  return ended(a) === ended(b);
}
