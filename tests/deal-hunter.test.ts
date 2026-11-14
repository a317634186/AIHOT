import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceCappedScore } from "@aihot/backend/dealhunter/policy";
import { dealHunterDay, releaseDealHunterSlot, reserveDealHunterSlot } from "@aihot/backend/dealhunter/index";
import { sql } from "@aihot/backend/db";

test("AI Deal Hunter caps unverified scoring evidence and blocks missing key facts", () => {
  const weakEvidence = evidenceCappedScore({ scores: { priceAdvantage: 30, quality: 20, trust: 15, offerValidity: 15, competition: 10, completeness: 10 }, hasHistoricalPrice: false, hasListPrice: false, hasMarketPrices: false, hasReviewMetrics: false, hasProduct: true, directRetailer: true, hasCurrentUsdPrice: true, inStock: true, threshold: 80 });
  assert.equal(weakEvidence.scores.priceAdvantage, 8);
  assert.equal(weakEvidence.scores.competition, 2);
  assert.equal(weakEvidence.scores.quality, 8);
  assert.equal(weakEvidence.eligible, false);
  const missingPrice = evidenceCappedScore({ scores: { priceAdvantage: 30, quality: 20, trust: 15, offerValidity: 15, competition: 10, completeness: 10 }, hasHistoricalPrice: true, hasListPrice: true, hasMarketPrices: true, hasReviewMetrics: true, hasProduct: true, directRetailer: true, hasCurrentUsdPrice: false, inStock: true, threshold: 70 });
  assert.equal(missingPrice.total, 69);
  assert.equal(missingPrice.keyFactsVerified, false);
  assert.equal(missingPrice.eligible, false);
});

test("AI Deal Hunter daily quota is atomic under concurrent reservations", async () => {
  const timezone = "America/Los_Angeles";
  const day = dealHunterDay(timezone);
  await sql`DELETE FROM deal_hunter_daily_quota WHERE quota_day=${day}`;
  try {
    const reservations = await Promise.all(Array.from({ length: 64 }, () => reserveDealHunterSlot(timezone, 50)));
    assert.equal(reservations.filter(Boolean).length, 50);
    const [quota] = await sql`SELECT reserved,submitted FROM deal_hunter_daily_quota WHERE quota_day=${day}`;
    assert.equal(quota?.reserved, 50);
    await releaseDealHunterSlot(day);
    const [afterRelease] = await sql`SELECT reserved FROM deal_hunter_daily_quota WHERE quota_day=${day}`;
    assert.equal(afterRelease?.reserved, 49);
  } finally {
    await sql`DELETE FROM deal_hunter_daily_quota WHERE quota_day=${day}`;
  }
});
