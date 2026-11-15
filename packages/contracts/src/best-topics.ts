export interface BestTopicDefinition {
  slug: string;
  h1: string;
  shortTitle: string;
  category: 'electronics' | 'home' | 'power' | 'pets' | 'kitchen' | 'personal-care' | 'auto' | 'fashion' | 'kids' | 'grocery' | 'beauty' | 'outdoors' | 'software';
  categoryDisplay: string;
  priceFilter?: { min?: number; max?: number };
  keywords: string[];
  requiredKeywords?: string[];
  excludeKeywords?: string[];
  matchCategories?: string[];
  promptContext: string;
  relatedSlugs?: string[];
}

export interface BestTopicSource {
  articleId: string;
  name: string;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt?: string;
  relatedProductIds?: string[];
}

export interface BestProductVerdict {
  whyBuy: string;
  tradeOff: string;
  mediaConsensus?: string;
  priceVerdict?: string;
}

export interface GeneratedBestTopic extends BestTopicDefinition {
  productIds: string[];
  marketConsensusSummary: string;
  productVerdicts: Record<string, BestProductVerdict>;
  buyingTips: string[];
  faqs: Array<{ question: string; answer: string }>;
  sources: BestTopicSource[];
  lastGeneratedAt: string;
}

export interface BestTopicSummary {
  slug: string;
  h1: string;
  shortTitle: string;
  category: BestTopicDefinition['category'];
  categoryDisplay: string;
  productCount: number;
  verifiedCount: number;
  lastGeneratedAt: string;
  /** Up to three product thumbnails from the guide, used as its cover collage. */
  coverImages?: string[];
}
