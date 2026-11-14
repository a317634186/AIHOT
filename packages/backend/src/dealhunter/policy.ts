export type DealScore = { priceAdvantage: number; quality: number; trust: number; offerValidity: number; competition: number; completeness: number };

export function evidenceCappedScore(input: { scores: DealScore; hasHistoricalPrice: boolean; hasListPrice: boolean; hasMarketPrices: boolean; hasReviewMetrics: boolean; hasProduct: boolean; directRetailer: boolean; hasCurrentUsdPrice: boolean; inStock: boolean; threshold: number }) {
  const scores = { ...input.scores };
  if (!input.hasHistoricalPrice && !input.hasListPrice) scores.priceAdvantage = Math.min(scores.priceAdvantage, 8);
  if (!input.hasMarketPrices) scores.competition = Math.min(scores.competition, 2);
  if (!input.hasReviewMetrics) scores.quality = Math.min(scores.quality, 8);
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const keyFactsVerified = input.hasProduct && input.directRetailer && input.hasCurrentUsdPrice && input.inStock;
  return { scores, total: keyFactsVerified ? total : Math.min(total, 69), keyFactsVerified, eligible: keyFactsVerified && total >= input.threshold };
}
