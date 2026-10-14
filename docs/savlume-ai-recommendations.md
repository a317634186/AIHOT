# AI purchase reasons — 2026-10-11

Product-offer detail pages now show **AI Recommendation Reasons**, explaining why the offer is worth considering, who it suits, concrete reasons to buy, **Why the Price Makes Sense**, and relevant purchase restrictions. News and recall items remain informational briefs. Source links and AI attribution accompany the text.

The existing `aiOverview` JSON object stores the generated copy, with optional `format: recommendation` and `priceReason` fields. Older data remains compatible; no database migration is needed. The shared editorial prompt links supported product facts to buyer benefits and requires qualification when price/availability is unverified, expired, or unsupported. It distinguishes MSRP/retailer reference prices from market selling prices, source-reported comparisons from merchant checks, and limited Savlume observations from full price history. Rewards are separate from checkout cost. Conflicting source discount arithmetic must be explained or omitted.

New offers receive the purchase rationale during ordinary worker extraction. Existing public offers are updated through `scripts/refresh-shopping-recommendations.ts`, using the configured writing model, normal paid-request receipts and budgets. Requests include original source text, stored offer facts, exact listed-versus-checkout arithmetic and up to 30 comparable price observations. Model calls never occur during page loads.

The refresh updates only the `aiOverview` JSON path. It preserves offer prices, identity, verification, reviews, publication eligibility and history; concurrent article revisions or offer changes discard stale generated text. The existing content-timestamp trigger updates SEO modification dates. The public Markdown representation includes the same reasons and price explanation for search/AI readers.

Manual bounded refresh (1–300 items, three simultaneous requests):

```bash
docker compose run --rm --no-deps worker node scripts/refresh-shopping-recommendations.ts 300
```

Completed items are skipped when resuming. Rejected/invalid individual outputs are reported without blocking the rest of the batch; budget limits stop the run. Unknown or pending receipts defer only the affected article, even when prompts/models change, until the existing receipt recovery policy releases it. An hourly worker task fills up to 20 missing rationales; failed-attempt totals are capped at three per article for this batch path. No recovery policy is bypassed.

Validation: typecheck and production builds passed; 17/17 web tests passed, including mobile purchase reasons, price explanation, recorded chart, sharing and likes. Four new isolated-backend tests passed, covering source/history input, price-record preservation, Markdown output, repeated-refresh avoidance, recall/withdrawal exclusion and rejection of results after a concurrent price change, and prevention of resends while a prior model request remains unresolved. Full backend suite: 210/214 passed; the same four pre-existing analyze/translate shutdown and X/WeChat recovery failures remain. After the price-arithmetic and recovery refinements, all four focused tests passed. Public, shopping and SEO smoke checks passed, and a live detail page's HTML/Markdown was verified.

Final live audit: **202/202** public product-deal, coupon, cashback and freebie entries contained both the recommendation format and a nonempty price explanation; none contained Chinese text. The initial 199-item set was refreshed and three newly processed entries already used the new extraction prompt. Two gateway-error entries were completed with assistant-written copy checked directly against their stored original source text, offer fields and recorded observations. That editorial write was logged as `shopping.recommendation-editorial-finish` and made no extra gateway request; the unknown gateway receipt retains the normal recovery policy. A source's contradictory $31/$25/$6.20 wallet comparison was corrected to disclose the discrepancy. Live checks covered these corrected pages and an informational recall page.

Examples:
- https://savlume.com/items/lgjgdd2rh9e9btdfhc7kphtr8 — a source-reported retailer comparison and purchasing restrictions.
- https://savlume.com/items/zays1o02py5k2n1kbrf3ioh90 — the effect of $7 shipping on a reported $14 hoodie.
- https://savlume.com/items/ggl7d9lgndnmg1xzaunvlz96u — conditional promo-code pricing and unsupported delivered-total/history claims explicitly avoided.
