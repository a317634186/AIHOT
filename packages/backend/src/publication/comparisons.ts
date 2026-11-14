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

function fromGuide(page: PublicBestTopic) {
  const products = page.items.slice(0, 5), result: PublicComparisonPair[] = [];
  for (let left = 0; left < products.length; left++) for (let right = left + 1; right < products.length; right++) {
    const a = products[left]!, b = products[right]!, name = comparisonPairName(a, b);
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

export function comparisonIndexItems(pairs: PublicComparisonPair[]) {
  return pairs.map(({ slug, title, guideSlugs }) => ({ slug, title, guideSlugs }));
}
