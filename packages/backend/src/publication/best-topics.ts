import type { BestTopicSummary, GeneratedBestTopic } from '@aihot/contracts/best-topics';
import { BEST_TOPICS, bestTopicDefinition } from '@aihot/industry/best-topics';
import { isDirectRetailerProductUrl } from '@aihot/industry/shopping';
import { sql } from '../db.ts';
import { shoppingItems, type ShoppingItem } from './shopping.ts';

function decodeTopic(raw: unknown): GeneratedBestTopic | null {
  if (!raw || typeof raw !== 'object') return null;
  const topic = raw as Partial<GeneratedBestTopic>;
  if (typeof topic.slug !== 'string' || !Array.isArray(topic.productIds) || !Array.isArray(topic.sources)) return null;
  if (typeof topic.marketConsensusSummary !== 'string' || !Array.isArray(topic.faqs) || !Array.isArray(topic.buyingTips)) return null;
  return topic as GeneratedBestTopic;
}

export interface PublicBestTopic {
  topic: GeneratedBestTopic;
  items: ShoppingItem[];
}

interface BestTopicRow { slug: string; topic: unknown; generated_at: Date }

function topicRelevantSources(topic:GeneratedBestTopic){
  const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return topic.sources.filter(source=>{
    if(/\/search(?:\?|\/|$)/i.test(source.url))return false;
    const text=normalize(`${source.title} ${source.excerpt??''}`);
    return topic.keywords.some(keyword=>{const term=normalize(keyword);return term.length>0&&text.includes(term);});
  });
}

function fallbackProductVerdict(item: ShoppingItem) {
  const d = item.offer;
  const price = item.priceDisplay.amountCents !== null ? `$${(item.priceDisplay.amountCents / 100).toFixed(2)}` : 'the listed price';
  const whyBuy = d.aiOverview?.bestFor?.trim() || d.aiOverview?.highlights?.[0]?.trim() || d.review?.verdict?.trim() || `${d.product ?? item.title} is listed at ${price} at ${d.merchant ?? 'the retailer'}${d.coupon ? ` (${d.coupon})` : ''}.`;
  const tradeOff = d.aiOverview?.cautions?.[0]?.trim() || d.review?.limitations?.[0]?.trim() || d.restrictions?.[0]?.trim() || (d.priceRestored ? 'Previous promotional discount ended; shown at regular store price.' : 'Confirm exact model, seller, and checkout total on the retailer page.');
  const mediaConsensus = `Covered via ${item.source} for ${d.merchant ?? 'US retail'} shoppers comparing ${d.brand ?? 'category'} options.`;
  return { whyBuy, tradeOff, mediaConsensus };
}

function synthesizeTopicShell(def: (typeof BEST_TOPICS)[number], generatedAt: string): GeneratedBestTopic {
  return {
    ...def,
    productIds: [],
    productVerdicts: {},
    sources: [],
    marketConsensusSummary: `Savlume tracks current US retail offers and cited deal coverage for ${def.shortTitle.toLowerCase()}. Compare live prices, listed references, promo codes, and model trade-offs below before checkout.`,
    buyingTips: [
      `Compare the current checkout price against the regular list price and check whether a promo code or clip coupon applies.`,
      `Verify the exact model number, configuration, condition, and marketplace seller on the retailer page.`,
      `Review shipping terms, Prime or membership requirements, and return windows before completing your order.`,
    ],
    faqs: [
      {
        question: `What are the best ${def.shortTitle.toLowerCase()} available right now?`,
        answer: `Compare the ranked offers on this page by current deal price, retailer verification status, and model specifications.`,
      },
      {
        question: `How does Savlume verify prices for ${def.shortTitle.toLowerCase()}?`,
        answer: `Offers marked Active were matched against the official retailer page at the recorded check time; source-reported deals and regular-price listings are labeled separately.`,
      },
      {
        question: `Can promo codes be combined with these ${def.shortTitle.toLowerCase()} offers?`,
        answer: `When an offer includes a promo code or on-page coupon, the code and redemption instructions are shown on the card and comparison table.`,
      },
    ],
    lastGeneratedAt: generatedAt,
  };
}

async function currentPages(rows: BestTopicRow[]): Promise<Array<{ row: BestTopicRow; page: PublicBestTopic }>> {
  const bySlug = new Map(rows.map(r => [r.slug, r]));
  const defaultDate = rows[0]?.generated_at ?? new Date();
  const allRows: BestTopicRow[] = rows.length === 1
    ? rows
    : BEST_TOPICS.map(def => bySlug.get(def.slug) ?? { slug: def.slug, topic: synthesizeTopicShell(def, defaultDate.toISOString()), generated_at: defaultDate });
  const fresh = allRows.flatMap(row => {
    const topic = decodeTopic(row.topic), definition = bestTopicDefinition(row.slug);
    if(!topic||!definition||Date.now()-row.generated_at.getTime()>120*86_400_000)return [];
    const configured={...topic,...definition};
    return [{row,topic:{...configured,sources:topicRelevantSources(configured)}}];
  });
  const ids = [...new Set(fresh.flatMap(({ topic }) => topic.productIds.slice(0, 12)))];
  const [{ items }, broadPool] = await Promise.all([
    ids.length ? shoppingItems({ ids, limit: ids.length, indexableOnly: false }) : Promise.resolve({ items: [] as ShoppingItem[] }),
    fresh.length ? shoppingItems({ view: 'deals', sort: 'popular', limit: 8000, scanAll: true }) : Promise.resolve({ items: [] as ShoppingItem[] }),
  ]);
  const isEligibleTopicItem = (item: ShoppingItem) => {
    if (!['Active', 'Unverified'].includes(item.offer.status) || item.priceDisplay.state !== 'current') return false;
    if (!item.offer.buyUrl || !isDirectRetailerProductUrl(item.offer.buyUrl)) return false;
    if (item.priceDisplay.amountCents !== null) return ['merchant-verified', 'source-reported', 'last-verified'].includes(item.priceDisplay.verification);
    const seller = (item.offer.seller ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return item.offer.merchantId === 'amazon' && !item.thirdPartySeller && ['amazon', 'amazon com', 'amazon com services llc', 'amazon com services inc'].includes(seller);
  };
  const eligible = new Map(items.filter(isEligibleTopicItem).map(item => [item.id, item]));
  const supplementPool = broadPool.items.filter(item => isEligibleTopicItem(item) && item.priceDisplay.amountCents !== null && item.priceDisplay.amountCents > 0);
  const normText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const hasPhrase = (haystack: string, phrase: string) => {
    const value = normText(phrase);
    return value.length > 0 && ` ${haystack} `.includes(` ${value} `);
  };

  const result: Array<{ row: BestTopicRow; page: PublicBestTopic }> = [];
  for (const { row, topic } of fresh) {
    const strictCategories = topic.matchCategories?.length ? new Set(topic.matchCategories) : null;
    const minCents = topic.priceFilter?.min ? topic.priceFilter.min * 100 : 0;
    const maxCents = topic.priceFilter?.max ? topic.priceFilter.max * 100 : null;
    const acceptable = (candidate: ShoppingItem, enforcePrice: boolean) => {
      if (strictCategories && (!candidate.category || !strictCategories.has(candidate.category))) return false;
      const price = candidate.priceDisplay.amountCents;
      if (strictCategories && (price === null || price <= 0)) return false;
      if (price !== null && (price < minCents || (enforcePrice && maxCents !== null && price > maxCents))) return false;
      const hay = normText(`${candidate.offer.brand ?? ''} ${candidate.offer.product ?? ''} ${candidate.offer.model ?? ''} ${candidate.title}`);
      if ((topic.excludeKeywords ?? []).some(keyword => hasPhrase(hay, keyword))) return false;
      if (topic.requiredKeywords?.length && !topic.requiredKeywords.some(keyword => hasPhrase(hay, keyword))) return false;
      return topic.keywords.some(keyword => hasPhrase(hay, keyword));
    };
    const ordered = topic.productIds.slice(0, 12).flatMap(id => {
      const item = eligible.get(id);
      return item && (!strictCategories || acceptable(item, true)) ? [item] : [];
    });
    if (ordered.length < 5) {
      const seenIds = new Set(ordered.map(x => x.id));
      const tryMatch = (enforceMax: boolean) => {
        for (const candidate of supplementPool) {
          if (ordered.length >= 5) break;
          if (seenIds.has(candidate.id)) continue;
          if (!acceptable(candidate, enforceMax)) continue;
          seenIds.add(candidate.id);
          ordered.push(candidate);
        }
      };
      tryMatch(true);
      if (!strictCategories && ordered.length < 3 && maxCents !== null) tryMatch(false);
    }
    if (ordered.length < (strictCategories ? 3 : 1)) continue;
    const idsForTopic = new Set(ordered.map(item => item.id));
    const productVerdicts: Record<string, { whyBuy: string; tradeOff: string; mediaConsensus?: string }> = {};
    for (const item of ordered) {
      productVerdicts[item.id] = topic.productVerdicts[item.id] ?? fallbackProductVerdict(item);
    }
    result.push({
      row,
      page: {
        topic: { ...topic, productIds: ordered.map(item => item.id), productVerdicts },
        items: ordered
      }
    });
  }
  return result;
}

export async function publicBestTopic(slug: string): Promise<PublicBestTopic | null> {
  const def = bestTopicDefinition(slug);
  if (!def) return null;
  const rows = await sql<BestTopicRow[]>`SELECT slug, topic, generated_at FROM generated_best_topics WHERE slug = ${slug}`;
  const effectiveRows = rows.length ? rows : [{ slug: def.slug, topic: synthesizeTopicShell(def, new Date().toISOString()), generated_at: new Date() }];
  return (await currentPages(effectiveRows))[0]?.page ?? null;
}

export async function publicBestTopics(): Promise<BestTopicSummary[]> {
  const rows = await sql<BestTopicRow[]>`SELECT slug, topic, generated_at FROM generated_best_topics ORDER BY generated_at DESC`;
  return (await currentPages(rows)).map(({ page, row }) => ({
    slug: page.topic.slug,
    h1: page.topic.h1,
    shortTitle: page.topic.shortTitle,
    category: page.topic.category,
    categoryDisplay: page.topic.categoryDisplay,
    productCount: page.items.length,
    verifiedCount: page.items.filter(item => item.priceDisplay.verification === 'merchant-verified').length,
    lastGeneratedAt: row.generated_at.toISOString()
  }));
}

export async function publicBestTopicSnapshot(): Promise<{ pages: PublicBestTopic[]; sitemap: Array<{ slug: string; lastmod: string }> }> {
  const rows = await sql<BestTopicRow[]>`SELECT slug, topic, generated_at FROM generated_best_topics ORDER BY generated_at DESC`;
  const current = await currentPages(rows);
  return {
    pages: current.map(({ page }) => page),
    sitemap: current.map(({ page, row }) => ({ slug: page.topic.slug, lastmod: row.generated_at.toISOString() })),
  };
}

export async function publicBestTopicForSitemap(): Promise<Array<{ slug: string; lastmod: string }>> {
  return (await publicBestTopicSnapshot()).sitemap;
}

/** Current published guide pages in one query, for cached machine-readable site indexes. */
export async function publicBestTopicPages(): Promise<Array<{ topic: GeneratedBestTopic; items: ShoppingItem[] }>> {
  return (await publicBestTopicSnapshot()).pages;
}

export function configuredBestTopics() {
  return BEST_TOPICS;
}
