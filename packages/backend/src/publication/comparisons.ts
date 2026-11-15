import { comparisonPairName } from '@aihot/contracts/comparisons';
import type { BestProductVerdict } from '@aihot/contracts/best-topics';
import { publicBestTopicSnapshot, type PublicBestTopic } from './best-topics.ts';
import type { ShoppingItem } from './shopping.ts';

export interface PublicComparisonPair {
  slug: string;
  title: string;
  itemA: ShoppingItem;
  itemB: ShoppingItem;
  verdictA: BestProductVerdict | null;
  verdictB: BestProductVerdict | null;
  guideSlugs: string[];
  updatedAt: string;
}

export interface PublicComparisonLink { slug: string; title: string; }

/**
 * A matchup is only meaningful between two products of the same kind. The guide already filters by
 * keyword, but broad guides admit unrelated stock (coffee pods beside fish oil), so the pair must
 * also share a product noun before it is published.
 */
function productNoun(item: ShoppingItem): string {
  const text = `${item.offer.product ?? ''} ${item.title}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = text.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(word => word.length > 2);
  const stop = new Set(['the','and','for','with','from','pack','set','inch','new','deal','deals','sale','best','buy','amazon','walmart','target','under','over','free','shipping','piece','count','black','white','grey','gray','bundle','kit','model','series','edition','color','colour','size','plus','pro','max','mini','ultra','gen','generation','renewed','refurbished','open','box']);
  // The head noun of an English product name is at the end ("... Ergonomic Optical Mouse"), while an
  // earlier word is usually an adjective. Taking the longest word picked "ergonomic" and paired a
  // mouse with a chair, so the last qualifying word wins.
  const meaningful = words.filter(word => !stop.has(word) && !/^\d+$/.test(word) && !/(?:ic|al|ive|ous|able|ible|ing|ed)$/.test(word));
  return meaningful.at(-1) ?? '';
}
/** Retailer prefixes and colour/size qualifiers never distinguish two different products. */
function normalizeForMatch(item: ShoppingItem): string {
  return `${item.offer.product ?? ''} ${item.title}`
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:amazon|walmart|target|best buy|costco|woot|home depot|lowes|newegg|adorama|bh photo)\b/g, ' ')
    .replace(/\b(?:blue|black|white|grey|gray|red|green|silver|gold|pink|purple|navy|beige|brown)\b/g, ' ')
    .replace(/\bsizes?\s+[a-z0-9-]+/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:mm|cm|inch|inches|in|oz|lb|lbs|gb|tb|ml|l)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function wordSet(text: string): Set<string> {
  return new Set(text.split(' ').filter(word => word.length > 1));
}
/** Two listings of the same product, including colour or size variants, are not a comparison. */
function sameProduct(a: ShoppingItem, b: ShoppingItem): boolean {
  const left = normalizeForMatch(a), right = normalizeForMatch(b);
  if (!left || !right) return true;
  if (left === right) return true;
  const lw = wordSet(left), rw = wordSet(right);
  const shared = [...lw].filter(word => rw.has(word)).length;
  const overlap = shared / Math.max(lw.size, rw.size);
  if (overlap >= 0.6) return true;
  // The same model number is the same product however the listing brands it.
  const model = (item: ShoppingItem) => (item.offer.model ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ma = model(a), mb = model(b);
  return ma.length >= 4 && ma === mb;
}
/**
 * Both items must share the same core product noun. A single shared adjective ("ergonomic") is not
 * enough: the noun found for A must also be the core noun of B, so a mouse never pairs with a chair.
 */
function comparable(a: ShoppingItem, b: ShoppingItem): boolean {
  const nounA = productNoun(a), nounB = productNoun(b);
  if (!nounA || !nounB) return false;
  const textA = normalizeForMatch(a), textB = normalizeForMatch(b);
  return textA.includes(nounB) && textB.includes(nounA);
}
/**
 * Only a guide about one product type can produce a matchup. Brand hubs, grocery stock-ups and
 * mixed office or gift roundups list unrelated products, so pairing two of them means nothing.
 */
const MIXED_GUIDE=/\b(?:grocery|pantry|snacks|essentials|stock-?up|bundle|baskets?|gift|holiday|stocking|mixed|variety|assortment|playbooks?)\b/i;
/** "Desks and chairs" names two product types, so its rows are unrelated to each other. */
const MULTI_NOUN_GUIDE=/\b\w+s\s+(?:and|&|or)\s+\w+s\b/i;
function guideIsSingleProductType(page: PublicBestTopic): boolean {
  if (page.topic.categoryDisplay === 'Brand Deal Hubs') return false;
  const label = `${page.topic.slug} ${page.topic.shortTitle} ${page.topic.h1}`;
  return !MIXED_GUIDE.test(label) && !MULTI_NOUN_GUIDE.test(label.replace(/-/g, ' '));
}
function fromGuide(page: PublicBestTopic) {
  if (!guideIsSingleProductType(page)) return [];
  const products = page.items.slice(0, 5), result: PublicComparisonPair[] = [];
  for (let left = 0; left < products.length; left++) for (let right = left + 1; right < products.length; right++) {
    const a = products[left]!, b = products[right]!;
    if (sameProduct(a, b) || !comparable(a, b)) continue;
    const name = comparisonPairName(a, b);
    const itemA = name.leftId === a.id ? a : b, itemB = name.rightId === b.id ? b : a;
    result.push({
      slug: name.slug,
      title: `${name.leftName} vs ${name.rightName}`,
      itemA,
      itemB,
      verdictA: page.topic.productVerdicts[itemA.id] ?? null,
      verdictB: page.topic.productVerdicts[itemB.id] ?? null,
      guideSlugs: [page.topic.slug],
      updatedAt: page.topic.lastGeneratedAt,
    });
  }
  return result;
}

function makeComparisonPairs(pages:PublicBestTopic[]):PublicComparisonPair[]{
  const byProducts = new Map<string, PublicComparisonPair>();
  for (const page of pages) for (const pair of fromGuide(page)) {
    const key = [pair.itemA.id, pair.itemB.id].sort().join(':');
    const prior = byProducts.get(key);
    if (prior) {
      if (!prior.guideSlugs.includes(page.topic.slug)) prior.guideSlugs.push(page.topic.slug);
      if (Date.parse(pair.updatedAt) > Date.parse(prior.updatedAt)) prior.updatedAt = pair.updatedAt;
    } else byProducts.set(key, pair);
  }

  const pairs = [...byProducts.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  const slugCounts = new Map<string, number>();
  for (const pair of pairs) slugCounts.set(pair.slug, (slugCounts.get(pair.slug) ?? 0) + 1);
  for (const pair of pairs) if ((slugCounts.get(pair.slug) ?? 0) > 1) {
    pair.slug += `-${pair.itemA.id.slice(0, 5)}-${pair.itemB.id.slice(0, 5)}`;
  }
  return pairs;
}

/** Guides, sitemap timestamps, and matchups share one matched-product snapshot per calculation. */
export async function publicComparisonSnapshot(){
  const snapshot=await publicBestTopicSnapshot();
  return {bestPages:snapshot.sitemap,pairs:makeComparisonPairs(snapshot.pages)};
}

/** Head-to-head pages are derived only from current products already matched to published guides. */
export async function publicComparisonPairs(): Promise<PublicComparisonPair[]> {
  return (await publicComparisonSnapshot()).pairs;
}

export function comparisonLinksForItem(pairs: PublicComparisonPair[], itemId: string): PublicComparisonLink[] {
  return pairs.filter(pair => pair.itemA.id === itemId || pair.itemB.id === itemId)
    .map(({ slug, title }) => ({ slug, title }));
}

/** A single side of a matchup as the index card needs it: thumbnail, short label and deal price. */
function indexSide(item: ShoppingItem) {
  return {
    id: item.id,
    name: comparisonIndexLabel(item),
    image: item.image?.src ?? null,
    imageSet: item.image?.srcSet ?? null,
    priceCents: item.priceDisplay?.state === 'current' ? item.priceDisplay.amountCents : null,
    listPriceCents: item.offer.listedPriceCents,
    merchant: item.offer.merchant ?? null,
  };
}
/** Brand plus the product name, without the retailer noise a card has no room for. */
function comparisonIndexLabel(item: ShoppingItem): string {
  const d = item.offer;
  const product = (d.product ?? item.title).trim();
  const brand = d.brand?.trim();
  return brand && !product.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${product}` : product;
}
export function comparisonIndexItems(pairs: PublicComparisonPair[]) {
  return pairs.map(({ slug, title, guideSlugs, itemA, itemB }) => ({
    slug,
    title,
    guideSlugs,
    left: indexSide(itemA),
    right: indexSide(itemB),
  }));
}
