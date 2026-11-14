import { existsSync } from "node:fs";
import { load } from "cheerio";
import { Configuration, PlaywrightCrawler } from "@crawlee/playwright";
import { chromium } from "playwright-core";
import { z } from "zod";
import { merchantFor, isDirectRetailerProductUrl } from "@aihot/industry/shopping";
import { crawlerFetch, crawlerRobotsAllows } from "../lib/crawler-fetch.ts";
import { chatJson } from "../providers/llm.ts";
import { amazonAsin, extractAmazonProduct } from "./amazon.ts";

export interface PageDomSnapshot {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  crawlerEngine: "crawlee-playwright-chromium" | "direct-html";
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogImage: string | null;
  canonicalUrl: string | null;
  detectedAsin: string | null;
  jsonLdBlocks: unknown[];
  priceBlocksText: string[];
  buyBoxText: string;
  domExcerpt: string;
  rawHtml: string;
}

const LlmProductJudgmentSchema = z.object({
  isProductPage: z.boolean().catch(true),
  productTitle: z.string().nullable().catch(null),
  brand: z.string().nullable().catch(null),
  asin: z.string().nullable().catch(null),
  model: z.string().nullable().catch(null),
  variant: z.string().nullable().catch(null),
  currentPriceUsd: z.number().nullable().catch(null),
  listPriceUsd: z.number().nullable().catch(null),
  promoCode: z.string().nullable().catch(null),
  couponText: z.string().nullable().catch(null),
  inStock: z.boolean().catch(true),
  seller: z.string().nullable().catch(null),
  imageUrl: z.string().nullable().catch(null),
  confidence: z.number().min(0).max(1).catch(0.8),
  reasoning: z.string().catch(""),
});

export interface ValidatedProductAgentResult {
  valid: boolean;
  validationReason: string | null;
  product: {
    asin: string | null;
    name: string;
    brand: string | null;
    model: string | null;
    variant: string | null;
    image: string | null;
    description: string;
    price: number;
    listPrice: number | null;
    priceType: "deal" | "current_selling";
    couponText: string | null;
    availability: string;
    seller: string | null;
    rating: number | null;
    reviewCount: number | null;
    currency: "USD";
    priceObservedAt: string;
    sourcePage: string;
  } | null;
  diagnostics: Record<string, unknown>;
}

function extractDomAndJsonLd(html: string, requestedUrl: string, finalUrl: string, httpStatus: number | null, engine: PageDomSnapshot["crawlerEngine"]): PageDomSnapshot {
  const $ = load(html);
  const jsonLdBlocks: unknown[] = [];
  $("script[type='application/ld+json']").each((_i, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      jsonLdBlocks.push(JSON.parse(raw));
    } catch {}
  });

  const priceSelectors = [
    "#corePriceDisplay_desktop_feature_div",
    "#corePrice_feature_div",
    "#apex_desktop",
    "#apex_offerDisplay_desktop",
    "#buybox",
    "#desktop_buybox",
    "#price",
    "#tp_price_block_total_price_ww",
    "[data-testid='price-wrap']",
    "[itemprop='offers']",
    ".a-price",
    "#promoPriceBlockMessage_feature_div",
    "#couponFeature",
  ];
  const priceBlocksText: string[] = [];
  const seenPriceText = new Set<string>();
  for (const sel of priceSelectors) {
    $(sel).each((_i, el) => {
      const txt = $(el).text().replace(/\s+/g, " ").trim().slice(0, 320);
      if (txt && !seenPriceText.has(txt) && priceBlocksText.length < 16) {
        seenPriceText.add(txt);
        priceBlocksText.push(txt);
      }
    });
  }

  const detectedAsin =
    $("#ASIN").attr("value") ||
    $("input[name='ASIN']").first().attr("value") ||
    $("[data-asin]").first().attr("data-asin") ||
    amazonAsin(finalUrl) ||
    amazonAsin(requestedUrl);

  const ogImage =
    $("meta[property='og:image']").attr("content") ||
    $("#landingImage").attr("data-old-hires") ||
    $("#landingImage").attr("src") ||
    null;

  const buyBoxText = $("#centerCol, #ppd, main, article, body").first().text().replace(/\s+/g, " ").trim().slice(0, 2800);
  const domExcerpt = [
    $("#productTitle, h1").first().text().replace(/\s+/g, " ").trim(),
    $("#bylineInfo").text().replace(/\s+/g, " ").trim(),
    $("#availability").text().replace(/\s+/g, " ").trim(),
    $("#feature-bullets").text().replace(/\s+/g, " ").trim(),
  ].filter(Boolean).join(" | ").slice(0, 2000);

  return {
    requestedUrl,
    finalUrl,
    httpStatus,
    crawlerEngine: engine,
    title: $("title").first().text().replace(/\s+/g, " ").trim(),
    metaDescription: $("meta[name='description']").attr("content")?.trim() ?? "",
    ogTitle: $("meta[property='og:title']").attr("content")?.trim() ?? "",
    ogImage: ogImage && /^https?:\/\//i.test(ogImage) ? ogImage : null,
    canonicalUrl: $("link[rel='canonical']").attr("href")?.trim() ?? null,
    detectedAsin: detectedAsin ? detectedAsin.toUpperCase() : null,
    jsonLdBlocks: jsonLdBlocks.slice(0, 6),
    priceBlocksText,
    buyBoxText,
    domExcerpt,
    rawHtml: html,
  };
}

/**
 * Stage 2 & 3: Crawlee PlaywrightCrawler + Chromium (with fast HTTP pre-check) to capture rendered DOM & JSON-LD.
 */
export async function crawlPageDomWithCrawlee(targetUrl: string): Promise<PageDomSnapshot | null> {
  if (!(await crawlerRobotsAllows(targetUrl))) return null;

  // Fast HTTP fetch first; if blocked or missing price DOM, escalate to Crawlee PlaywrightCrawler + Chromium.
  let fastSnapshot: PageDomSnapshot | null = null;
  try {
    const res = await crawlerFetch(targetUrl, {
      timeoutMs: 12_000,
      maxBytes: 4_000_000,
      headers: { "accept-language": "en-US,en;q=0.9" },
    });
    if (res.status === 200) {
      const html = res.text();
      if (!/captcha|robot check|automated access|sorry, we just need to make sure/i.test(html.slice(0, 25_000))) {
        fastSnapshot = extractDomAndJsonLd(html, targetUrl, res.url, res.status, "direct-html");
        if (fastSnapshot.jsonLdBlocks.length > 0 || fastSnapshot.priceBlocksText.some((t) => /\$\s*\d/.test(t))) {
          return fastSnapshot;
        }
      }
    }
  } catch {}

  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
    (["/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/chromium-browser"].find(existsSync) ?? "/usr/bin/chromium");
  if (!existsSync(executablePath)) return fastSnapshot;

  let renderedSnapshot: PageDomSnapshot | null = null;
  const config = new Configuration({ persistStorage: false, purgeOnStart: true });
  const crawler = new PlaywrightCrawler(
    {
      maxRequestsPerCrawl: 1,
      maxRequestRetries: 0,
      requestHandlerTimeoutSecs: 18,
      navigationTimeoutSecs: 14,
      headless: true,
      preNavigationHooks: [
        async (_ctx, gotoOptions) => {
          gotoOptions.waitUntil = "domcontentloaded";
        },
      ],
      launchContext: {
        launcher: chromium,
        launchOptions: {
          executablePath,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        },
      },
      async requestHandler({ page, request, response }) {
        await page.waitForTimeout(600);
        const html = await page.content();
        if (/captcha|robot check|automated access|sorry, we just need to make sure/i.test(html.slice(0, 25_000))) return;
        renderedSnapshot = extractDomAndJsonLd(
          html,
          request.url,
          page.url(),
          response?.status() ?? 200,
          "crawlee-playwright-chromium",
        );
      },
      failedRequestHandler() {},
    },
    config,
  );

  try {
    await crawler.run([{ url: targetUrl, uniqueKey: `${targetUrl}:${Date.now()}` }]);
  } catch {}

  return renderedSnapshot ?? fastSnapshot;
}

/**
 * Stage 4 & 5: LLM Product Agent judges Product, ASIN, and Price from DOM/JSON-LD + Source Clues, then Validator verifies.
 */
export async function runProductAgentPipeline(input: {
  productUrl: string;
  sourceUrl?: string;
  sourceHint?: string;
  sourceEvidence?: string;
}): Promise<ValidatedProductAgentResult> {
  const expectedAsin = amazonAsin(input.productUrl);
  const merchant = merchantFor(input.productUrl);
  const snapshot = await crawlPageDomWithCrawlee(input.productUrl);

  // First try deterministic Amazon/structured extraction if DOM snapshot is available
  if (snapshot && merchant?.id === "amazon") {
    const deterministic = extractAmazonProduct(snapshot.rawHtml, snapshot.finalUrl);
    if (deterministic.product && deterministic.product.price > 0) {
      return {
        valid: true,
        validationReason: null,
        product: {
          asin: deterministic.product.asin,
          name: deterministic.product.name,
          brand: deterministic.product.brand,
          model: deterministic.product.asin,
          variant: deterministic.product.variant,
          image: deterministic.product.image ?? snapshot.ogImage,
          description: deterministic.product.description,
          price: deterministic.product.price,
          listPrice: deterministic.product.listPrice,
          priceType: deterministic.product.listPrice && deterministic.product.listPrice > deterministic.product.price ? "deal" : "current_selling",
          couponText: deterministic.product.couponText,
          availability: deterministic.product.availability || "https://schema.org/InStock",
          seller: deterministic.product.seller ?? "Amazon",
          rating: deterministic.product.rating,
          reviewCount: deterministic.product.reviewCount,
          currency: "USD",
          priceObservedAt: new Date().toISOString(),
          sourcePage: snapshot.finalUrl,
        },
        diagnostics: {
          pipeline: "crawlee-dom-deterministic",
          crawlerEngine: snapshot.crawlerEngine,
          asin: deterministic.product.asin,
          httpStatus: snapshot.httpStatus,
        },
      };
    }
  }

  // Stage 4: LLM Product Agent inspects DOM + JSON-LD + Source Clues to extract Product, ASIN, and USD Price
  const agentPayload = {
    productUrl: input.productUrl,
    expectedAsin,
    merchant: merchant?.name ?? null,
    sourceHint: input.sourceHint?.slice(0, 400) ?? null,
    sourceEvidence: input.sourceEvidence?.slice(0, 1200) ?? null,
    dom: snapshot
      ? {
          finalUrl: snapshot.finalUrl,
          title: snapshot.title,
          ogTitle: snapshot.ogTitle,
          ogImage: snapshot.ogImage,
          detectedAsin: snapshot.detectedAsin,
          jsonLdBlocks: snapshot.jsonLdBlocks,
          priceBlocksText: snapshot.priceBlocksText,
          domExcerpt: snapshot.domExcerpt,
          buyBoxText: snapshot.buyBoxText.slice(0, 1500),
        }
      : null,
  };

  try {
    const llmRes = await chatJson({
      model: "gemini-3.8-flash-high",
      purpose: "deal_hunter_product_agent",
      subject: `product-agent:${expectedAsin ?? input.productUrl.slice(0, 120)}`,
      promptVersion: "product-agent-v1",
      system:
        'You are the Savlume Product Agent. Inspect the retailer page DOM/JSON-LD and source evidence to extract the exact product, ASIN/model, and USD selling price. Never invent a price not present in either the DOM/JSON-LD or the cited deal source evidence. Return ONLY a JSON object with exact keys: {"isProductPage":boolean,"productTitle":string|null,"brand":string|null,"asin":string|null,"model":string|null,"variant":string|null,"currentPriceUsd":number|null,"listPriceUsd":number|null,"promoCode":string|null,"couponText":string|null,"inStock":boolean,"seller":string|null,"imageUrl":string|null,"confidence":number,"reasoning":string}.',
      user: JSON.stringify(agentPayload),
      schema: LlmProductJudgmentSchema,
      temperature: 0.1,
      maxTokens: 3500,
    });

    const j = llmRes.data;
    // Stage 5: Validator — verify product title, ASIN consistency, USD price sanity, and stock status
    const resolvedAsin = (j.asin || snapshot?.detectedAsin || expectedAsin || null)?.toUpperCase() ?? null;
    if (expectedAsin && resolvedAsin && expectedAsin !== resolvedAsin) {
      return {
        valid: false,
        validationReason: `Validator rejected ASIN mismatch: expected ${expectedAsin}, got ${resolvedAsin}`,
        product: null,
        diagnostics: { pipeline: "product-agent-validator", expectedAsin, resolvedAsin },
      };
    }
    const price = typeof j.currentPriceUsd === "number" && Number.isFinite(j.currentPriceUsd) && j.currentPriceUsd > 0 && j.currentPriceUsd < 25_000 ? Number(j.currentPriceUsd.toFixed(2)) : null;
    const title = (j.productTitle || snapshot?.ogTitle || snapshot?.title || input.sourceHint || "").replace(/\s+/g, " ").trim();
    if (!price || !title || title.length < 4) {
      return {
        valid: false,
        validationReason: !price ? "Validator rejected: no verifiable USD price in DOM or source evidence" : "Validator rejected: missing product title",
        product: null,
        diagnostics: { pipeline: "product-agent-validator", price, title, crawlerEngine: snapshot?.crawlerEngine ?? "none" },
      };
    }
    if (!j.inStock) {
      return {
        valid: false,
        validationReason: "Validator rejected: product is out of stock",
        product: null,
        diagnostics: { pipeline: "product-agent-validator", inStock: false },
      };
    }
    const listPrice = typeof j.listPriceUsd === "number" && Number.isFinite(j.listPriceUsd) && j.listPriceUsd > price && j.listPriceUsd <= price * 6 ? Number(j.listPriceUsd.toFixed(2)) : null;
    const imageUrl = (j.imageUrl && /^https:\/\//i.test(j.imageUrl) ? j.imageUrl : snapshot?.ogImage) ?? null;
    return {
      valid: true,
      validationReason: null,
      product: {
        asin: resolvedAsin,
        name: title.slice(0, 480),
        brand: j.brand?.trim() || null,
        model: j.model?.trim() || resolvedAsin,
        variant: j.variant?.trim() || null,
        image: imageUrl,
        description: snapshot?.metaDescription || snapshot?.domExcerpt.slice(0, 800) || title,
        price,
        listPrice,
        priceType: listPrice && listPrice > price ? "deal" : "current_selling",
        couponText: j.promoCode ? `Code ${j.promoCode}` : j.couponText,
        availability: "https://schema.org/InStock",
        seller: j.seller?.trim() || merchant?.name || "Retailer",
        rating: null,
        reviewCount: null,
        currency: "USD",
        priceObservedAt: new Date().toISOString(),
        sourcePage: snapshot?.finalUrl || input.productUrl,
      },
      diagnostics: {
        pipeline: "deal-hunter-product-agent-crawlee-validator",
        crawlerEngine: snapshot?.crawlerEngine ?? "source-plus-llm",
        asin: resolvedAsin,
        confidence: j.confidence,
        reasoning: j.reasoning,
        directRetailerUrl: isDirectRetailerProductUrl(input.productUrl),
      },
    };
  } catch (error) {
    return {
      valid: false,
      validationReason: `Product Agent error: ${String(error).slice(0, 240)}`,
      product: null,
      diagnostics: { pipeline: "product-agent-error", error: String(error).slice(0, 240) },
    };
  }
}
