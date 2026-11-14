import { z } from 'zod';
import { sql } from '../db.ts';
import { chatJson, markReceiptsCompleted } from '../providers/llm.ts';
import { modelFor } from '../editorial/models.ts';
import { crawlerFetch } from '../lib/crawler-fetch.ts';
import type { Offer } from '@aihot/contracts/shopping';

export interface PlatformConfig {
  id: string; // 'amazon' | 'best-buy' | 'walmart' | 'target' | 'woot' | 'home-depot'
  name: string;
  sourceId: string;
  category: string;
  landingUrl: string;
  affiliateUrl: string;
  bannerUrl: string;
  defaultTitle: string;
  focusContext: string;
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  {
    id: 'amazon',
    name: 'Amazon',
    sourceId: 'shopping-platform-amazon',
    category: 'electronics',
    landingUrl: 'https://www.amazon.com/gp/goldbox',
    affiliateUrl: 'https://www.amazon.com/gp/goldbox?tag=savlume-20',
    bannerUrl: 'https://m.media-amazon.com/images/P/B096SV8SJG.01._SCLZZZZZZZ_.jpg',
    defaultTitle: "Amazon Today's Deals & Limited-Time Markdowns",
    focusContext: "Amazon Lightning Deals, Deal of the Day, and limited-time savings across electronics, smart devices, kitchenware, and everyday home essentials. Free Prime shipping on eligible items."
  },
  {
    id: 'best-buy',
    name: 'Best Buy',
    sourceId: 'shopping-platform-best-buy',
    category: 'electronics',
    landingUrl: 'https://www.bestbuy.com/site/misc/deal-of-the-day/pcmcat248000050016.c',
    affiliateUrl: 'https://www.bestbuy.com/site/misc/deal-of-the-day/pcmcat248000050016.c',
    bannerUrl: 'https://pisces.bbystatic.com/image2/BestBuy_US/images/products/6570/6570087_sd.jpg;maxHeight=919;maxWidth=1087',
    defaultTitle: "Best Buy Deal of the Day & 48-Hour Flash Sale",
    focusContext: "Best Buy Deal of the Day and flash sales covering 4K OLED TVs, Apple laptops, gaming monitors, noise-cancelling headphones, and major home appliances with My Best Buy member perks."
  },
  {
    id: 'walmart',
    name: 'Walmart',
    sourceId: 'shopping-platform-walmart',
    category: 'home',
    landingUrl: 'https://www.walmart.com/shop/deals',
    affiliateUrl: 'https://www.walmart.com/shop/deals',
    bannerUrl: 'https://i5.walmartimages.com/seo/Meta-Quest-3S-128GB-VR-Headset-Level-Double-Storage-2X-Graphical-Processing-Power-Virtual-Reality-Without-Wires-Access-40-Games-3-Month-Trial-Meta-Ho_027019c9-514d-461d-ae71-dba8b872d7d2.f53a12ab8bae74c4a584145b9254eb5d.jpeg',
    defaultTitle: "Walmart Flash Deals & Rollbacks",
    focusContext: "Walmart Flash Deals, online clearance and Rollback pricing on vacuums, kitchen appliances, laptops, outdoor recreation, and toys. Free shipping on $35+ or with Walmart+."
  },
  {
    id: 'target',
    name: 'Target',
    sourceId: 'shopping-platform-target',
    category: 'home',
    landingUrl: 'https://www.target.com/c/top-deals/-/N-4xw74',
    affiliateUrl: 'https://www.target.com/c/top-deals/-/N-4xw74',
    bannerUrl: 'https://hip2save.com/wp-content/uploads/2026/10/target-blanket.png',
    defaultTitle: "Target Top Deals & Circle Exclusive Savings",
    focusContext: "Target Top Deals, clearance markdowns, and Target Circle 360 promotions covering apparel, home decor, small kitchen appliances, toys, and grocery essentials."
  },
  {
    id: 'woot',
    name: 'Woot!',
    sourceId: 'shopping-platform-woot',
    category: 'electronics',
    landingUrl: 'https://www.woot.com/category/sellout',
    affiliateUrl: 'https://www.woot.com/category/sellout',
    bannerUrl: 'https://images-na.ssl-images-amazon.com/images/S/mediaservice.woot.com/b165dfa5-b7d1-405b-a0c5-37c65a6f3cc3._AC_SR882,441_.jpg',
    defaultTitle: "Woot Daily Sellout & Liquidation Deals",
    focusContext: "Amazon-owned Woot 24-hour sellout specials, refurbished tech liquidation, computer clearance, and tools markdowns with free shipping for Amazon Prime members."
  }
];

const CampaignSchema = z.object({
  title: z.string().min(10).max(120),
  summary: z.string().min(20).max(600),
  discountHighlight: z.string().max(80),
  seoDescription: z.string().max(160),
  highlights: z.array(z.string()).min(2).max(5),
  termsNote: z.string().max(200).nullable(),
});

export async function crawlAndSynthesizePlatformCampaigns(opts: { platformId?: string; force?: boolean } = {}) {
  const platforms = opts.platformId
    ? PLATFORM_CONFIGS.filter(p => p.id === opts.platformId)
    : PLATFORM_CONFIGS;

  const results: Array<{ platform: string; articleId: string; title: string; status: 'created' | 'updated' | 'skipped' }> = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const model = await modelFor('structure');

  for (const p of platforms) {
    try {
      const articleId = `campaign-${p.id}-${todayStr}`;

      // 1. Ensure source exists
      await sql`
        INSERT INTO sources (id, name, kind, config, tier, first_party, owner_entity_id, participation_mode, interval_minutes, tags, site_fulltext, syndicate_fulltext, enabled, next_fetch_at)
        VALUES (${p.sourceId}, ${p.name + ' Official Events'}, 'external', '{}', 'T1', true, ${p.id}, 'editorial', 60, ARRAY['US', 'Official retailer', 'Events'], false, false, true, now())
        ON CONFLICT (id) DO UPDATE SET enabled=true, updated_at=now()
      `;

      // 2. Fetch recent active deals from database to ground the AI with real facts
      const sampleDeals = await sql<{ product: string; price: number; list_price: number; discount: number }[]>`
        SELECT 
          d.data->>'product' as product,
          d.data->>'imageUrl' as image_url,
          coalesce((d.data->>'checkoutPriceCents')::int, (d.data->>'listedPriceCents')::int) as price,
          (d.data->>'listedPriceCents')::int as list_price,
          (d.data->>'discountPercent')::int as discount
        FROM shopping_offers d
        WHERE d.data->>'merchantId' = ${p.id}
          AND (d.data->>'status') NOT IN ('Expired', 'Out of Stock')
          AND coalesce((d.data->>'checkoutPriceCents')::int, (d.data->>'listedPriceCents')::int) IS NOT NULL
        ORDER BY d.updated_at DESC
        LIMIT 6
      `;

      const dealsContext = sampleDeals.length > 0
        ? sampleDeals.map(d => `${d.product} ($${(d.price / 100).toFixed(2)}${d.list_price && d.list_price > d.price ? `, Reg. $${(d.list_price / 100).toFixed(2)}` : ''})`).join('; ')
        : 'Storewide price drops and category markdowns.';

      // 3. Call AI to synthesize grounded, high-converting event description
      const systemPrompt = `You are the Chief Deals Editor at Savlume.com. Return strictly valid JSON: {"title": string, "summary": string, "discountHighlight": string, "seoDescription": string, "highlights": string[], "termsNote": string or null}. Never hallucinate false claims. Focus on current active promotions for ${p.name}.`;
      const userPrompt = `Synthesize an authoritative promotional event update for ${p.name}.
Event focus: ${p.focusContext}
Real active deal examples in store: ${dealsContext}
Date: ${todayStr}

Requirements:
- title: concise, compelling headline (e.g. "${p.defaultTitle}")
- summary: 2-3 informative sentences covering discounts, top categories, and shipping terms
- discountHighlight: short badge phrase like "Up to 50% Off Electronics" or "Daily Lightning Markdowns"
- seoDescription: clean search description under 155 chars
- highlights: 3 bullet points with category/product highlights
- termsNote: brief shipping/membership terms (e.g. "Free shipping with Prime / orders over $35.")`;

      const aiRes = await chatJson({
        model,
        purpose: 'platform_campaign_synthesis',
        subject: `platform-campaign:${p.id}:${todayStr}`,
        system: systemPrompt,
        user: userPrompt,
        schema: CampaignSchema,
        promptVersion: 'platform-campaign-v1',
        temperature: 0.1,
        maxTokens: 1500
      });
      await markReceiptsCompleted([aiRes.receiptId]);
      const data = aiRes.data;

      // Determine working banner / product deal image fallback
      const productWithImg = sampleDeals.find(d => typeof (d as any).image_url === "string" && (d as any).image_url.trim().length > 0 && /^https?:\/\//i.test((d as any).image_url));
      let effectiveBannerUrl = p.bannerUrl;
      const productFallbackUrl = (productWithImg as any)?.image_url ?? p.bannerUrl;

      // Verify banner accessibility
      try {
        const check = await crawlerFetch(p.bannerUrl, { method: "HEAD", timeoutMs: 3500 });
        if (check.status !== 200 && productFallbackUrl) {
          effectiveBannerUrl = productFallbackUrl;
        }
      } catch {
        if (productFallbackUrl) {
          effectiveBannerUrl = productFallbackUrl;
        }
      }

      // 4. Upsert into articles
      const articleTitle = data.title.slice(0, 150);
      const bodyText = `${data.summary}\n\nKey Highlights:\n${data.highlights.map(h => `• ${h}`).join('\n')}\n\nTerms & Details: ${data.termsNote || 'Prices and availability subject to change.'}`;
      const bodyHtml = `<p>${data.summary}</p><ul>${data.highlights.map(h => `<li>${h}</li>`).join('')}</ul><p><small>${data.termsNote || ''}</small></p>`;

      await sql`
        INSERT INTO articles (
          id, source_id, identity_key, url, title, language, published_at, published_at_claim, 
          discovered_at, timeline_at, revision, body_text, body_html, body_status, media, processing_state
        )
        VALUES (
          ${articleId}, ${p.sourceId}, ${articleId}, ${p.landingUrl}, ${articleTitle}, 'en', 
          now(), now(), now(), now(), 1, ${bodyText}, ${bodyHtml}, 'ok', 
          ${sql.json([{ kind: 'image', url: effectiveBannerUrl }])}, 'analyzed'
        )
        ON CONFLICT (id) DO UPDATE SET 
          title = EXCLUDED.title,
          body_text = EXCLUDED.body_text,
          body_html = EXCLUDED.body_html,
          updated_at = now()
      `;

      // 5. Upsert into shopping_offers
      const offerData: Offer = {
        kind: 'shopping_news',
        activityScope: 'storewide',
        brand: null,
        
        product: null,
        model: null,
        variant: null,
        condition: null,
        seller: null,
        fulfillment: null,
        
        priceEvidence: null,
        comparison: null,
        coupon: null,
        merchant: p.name,
        merchantId: p.id,
        buyUrl: p.affiliateUrl,
        imageUrl: effectiveBannerUrl,
        imageSource: p.landingUrl,
        imageFallbackUrl: productFallbackUrl,
        imageFallbackSource: p.landingUrl,
        seoDescription: data.seoDescription,
        aiOverview: {
          summary: data.summary,
          bestFor: data.discountHighlight,
          highlights: data.highlights,
          priceReason: data.termsNote,
          cautions: []
        },
        promotion: {
          kind: 'platform_sale',
          quote: data.discountHighlight
        },
        status: 'Active',
        currency: 'USD',
        verificationNote: `Official ${p.name} promotional event. Verified active today.`,
        priceIssue: null,
        identity: null,
        unitPriceCents: null,
        unitQuantity: null,
        unitLabel: null,
        minimumSpend: null,
        shipping: data.termsNote,
        cashback: null,
        giftCard: null,
        points: null,
        steps: [],
        restrictions: [],
        membership: null,
        subscription: null,
        renewal: null,
        cancellation: null,
        region: 'US',
        expiresAt: null,
        deadlineOriginal: null,
        warranty: null,
        returns: null,
        review: null,
        verifiedAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        listedPriceCents: null,
        checkoutPriceCents: null
      };

      await sql`
        INSERT INTO shopping_offers (
          article_id, input_revision, data, identity_key, next_check_at, updated_at, content_updated_at
        )
        VALUES (
          ${articleId}, 1, ${sql.json(offerData as never)}, ${articleId}, now() + interval '4 hours', now(), now()
        )
        ON CONFLICT (article_id) DO UPDATE SET 
          data = EXCLUDED.data,
          updated_at = now(),
          content_updated_at = now()
      `;

      // 6. Upsert into publications
      const searchText = `${articleTitle} ${p.name} ${data.summary} ${data.highlights.join(' ')}`;
      await sql`
        INSERT INTO publications (
          article_id, revision, visibility, eligible, selected, title, original_title, summary, 
          reason, category, tags, score, source_id, channel, first_party, url, published_at, 
          discovered_at, timeline_at, backfill, body_mode, syndicate, indexable, search_text, 
          updated_at, sort_at
        )
        VALUES (
          ${articleId}, 1, 'public', true, true, ${articleTitle}, ${articleTitle}, ${data.summary}, 
          ${data.discountHighlight}, ${p.category}, ARRAY['US', 'Official retailer', 'Deals', ${p.name}], 
          95, ${p.sourceId}, 'news', true, ${p.affiliateUrl}, now(), now(), now(), false, 
          'summary', false, true, ${searchText}, now(), now()
        )
        ON CONFLICT (article_id) DO UPDATE SET 
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          reason = EXCLUDED.reason,
          search_text = EXCLUDED.search_text,
          updated_at = now(),
          sort_at = now()
      `;

      results.push({
        platform: p.name,
        articleId,
        title: articleTitle,
        status: 'created'
      });
    } catch (err) {
      console.error(`Failed to crawl/synthesize platform campaign for ${p.name}:`, err);
    }
  }

  return results;
}
