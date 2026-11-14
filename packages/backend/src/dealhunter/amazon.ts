import { load } from "cheerio";

export type AmazonPriceType = "current_selling" | "deal" | "prime_exclusive";
export interface AmazonProductEvidence {
  asin: string;
  name: string;
  brand: string | null;
  variant: string | null;
  size: string | null;
  color: string | null;
  image: string | null;
  description: string;
  price: number;
  listPrice: number | null;
  priceType: AmazonPriceType;
  subscribeAndSavePrice: number | null;
  couponText: string | null;
  availability: string;
  seller: string | null;
  rating: number | null;
  reviewCount: number | null;
  currency: "USD";
  priceObservedAt: string;
  sourcePage: string;
}
export interface AmazonExtractionDiagnostics {
  asin: string | null;
  methodsAttempted: string[];
  methodSucceeded: string | null;
  jsonLdFound: boolean;
  embeddedProductDataFound: boolean;
  priceElementsFound: boolean;
  currencyDetection: string;
  failureReason: string | null;
}
export interface AmazonExtractionResult {
  product: AmazonProductEvidence | null;
  diagnostics: AmazonExtractionDiagnostics;
}

export function amazonAsin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)amazon\.com$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product|clp)\/([A-Z0-9]{10})(?:[/?]|$)/i)
      ?? parsed.pathname.match(/\/exec\/obidos\/ASIN\/([A-Z0-9]{10})(?:[/?]|$)/i);
    return match?.[1]?.toUpperCase() ?? null;
  } catch { return null; }
}

function dollars(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const match = value.replace(/\u00a0/g, " ").match(/^\s*\$\s*([\d,]+(?:\.\d{1,2})?)\s*$/);
  if (!match) return null;
  const amount = Number(match[1]!.replaceAll(",", ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function structuredAmount(value: unknown): number | null {
  const display = dollars(value);
  if (display !== null) return display;
  if (typeof value !== "string" || !/^\s*[\d,]+(?:\.\d{1,2})?\s*$/.test(value)) return null;
  const amount = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function exactAsin(value: unknown, asin: string): boolean {
  return typeof value === "string" && value.trim().toUpperCase() === asin;
}

function findAsin(value: Record<string, any>): unknown {
  return value.asin ?? value.ASIN ?? value.productASIN ?? value.parentAsin;
}

function textValue($: ReturnType<typeof load>, selector: string): string | null {
  const value = $(selector).first().attr("content") ?? $(selector).first().attr("value") ?? $(selector).first().text();
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function productAsins(product: Record<string, any>): string[] {
  return [product.asin, product.ASIN, product.sku, product.productID, product.mpn]
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.toUpperCase());
}

function embeddedOffer(value: unknown, asin: string): { price: number; currency: string; kind: AmazonPriceType } | null {
  let found: { price: number; currency: string; kind: AmazonPriceType } | null = null;
  const seen = new Set<object>();
  const visit = (node: unknown, parentKey = "") => {
    if (!node || typeof node !== "object" || seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) { for (const item of node) visit(item, parentKey); return; }
    const object = node as Record<string, any>;
    if (exactAsin(findAsin(object), asin)) {
      const keys: Array<[string, AmazonPriceType]> = [
        ["priceToPay", "current_selling"], ["dealPrice", "deal"], ["dealPriceToPay", "deal"],
        ["primeExclusivePrice", "prime_exclusive"], ["primePrice", "prime_exclusive"],
        ["offeringPrice", "current_selling"], ["currentPrice", "current_selling"],
      ];
      for (const [key, kind] of keys) {
        const raw = object[key];
        const amount = structuredAmount(typeof raw === "object" && raw !== null ? raw.amount ?? raw.value ?? raw.price : raw);
        const currency = typeof raw === "object" && raw !== null ? raw.currencyCode ?? raw.currency ?? object.currencyCode ?? object.priceCurrency : object.currencyCode ?? object.priceCurrency;
        if (amount && currency === "USD") { found = { price: amount, currency, kind }; return; }
      }
      const offer = object.offer ?? object.offers;
      if (offer && typeof offer === "object") {
        const offerCurrency = offer.currencyCode ?? offer.priceCurrency ?? object.currencyCode ?? object.priceCurrency;
        const amount = structuredAmount(offer.priceToPay?.amount ?? offer.priceToPay?.value ?? offer.price ?? offer.priceAmount);
        if (amount && offerCurrency === "USD") { found = { price: amount, currency: offerCurrency, kind: "current_selling" }; return; }
      }
    }
    for (const [key, child] of Object.entries(object)) visit(child, key);
  };
  visit(value);
  return found;
}

function embeddedListPrice(value: unknown, asin: string): number | null {
  let found: number | null = null; const seen = new Set<object>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object" || seen.has(node as object)) return;
    seen.add(node as object);
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const object = node as Record<string, any>;
    if (exactAsin(findAsin(object), asin)) {
      for (const key of ["listPrice", "wasPrice", "regularPrice", "referencePrice", "basisPrice", "msrp"]) {
        const raw = object[key];
        const currency = typeof raw === "object" && raw !== null ? raw.currencyCode ?? raw.currency ?? object.currencyCode ?? object.priceCurrency : object.currencyCode ?? object.priceCurrency;
        const amount = structuredAmount(typeof raw === "object" && raw !== null ? raw.amount ?? raw.value ?? raw.price : raw);
        if (amount && (!currency || currency === "USD")) { found = amount; return; }
      }
    }
    for (const child of Object.values(object)) visit(child);
  };
  visit(value); return found;
}

function jsonLdProducts(html: string): { found: boolean; products: Record<string, any>[] } {
  const $ = load(html); const products: Record<string, any>[] = []; let found = false;
  const walk = (value: any) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== "object") return;
    const type = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (type.includes("Product")) products.push(value);
    if (value["@graph"]) walk(value["@graph"]);
    for (const key of ["itemListElement", "mainEntity", "offers"]) if (value[key]) walk(value[key]);
  };
  $("script[type='application/ld+json']").each((_i, element) => {
    found = true;
    try { walk(JSON.parse($(element).text())); } catch {}
  });
  return { found, products };
}

function schemaOffer(product: Record<string, any>, asin: string) {
  const productId = productAsins(product);
  if (productId.length && !productId.includes(asin)) return null;
  const offers = Array.isArray(product.offers) ? product.offers : product.offers ? [product.offers] : [];
  for (const offer of offers) {
    if (!offer || offer["@type"] === "AggregateOffer") continue;
    const price = structuredAmount(offer.price ?? offer.priceSpecification?.price);
    if (price && offer.priceCurrency === "USD") return { offer, price };
  }
  return null;
}

export function extractAmazonProduct(html: string, pageUrl: string): AmazonExtractionResult {
  const asin = amazonAsin(pageUrl);
  const diagnostics: AmazonExtractionDiagnostics = { asin, methodsAttempted: [], methodSucceeded: null, jsonLdFound: false, embeddedProductDataFound: false, priceElementsFound: false, currencyDetection: "not_checked", failureReason: null };
  if (!asin) { diagnostics.failureReason = "Amazon URL does not contain a supported exact ASIN path"; return { product: null, diagnostics }; }
  const $ = load(html);
  const pageTitle = textValue($, "#productTitle") ?? textValue($, "#title_feature_div #title") ?? textValue($, "h1#title") ?? textValue($, "meta[property='og:title']")?.replace(/^Amazon\.com:\s*/i, "") ?? textValue($, "title")?.replace(/^Amazon\.com:\s*/i, "") ?? "";
  const brandText = textValue($, "#bylineInfo")?.replace(/^Visit the\s+/i, "").replace(/\s+Store$/i, "") ?? null;
  const variant = ["#variation_size_name .selection", "#variation_style_name .selection", "#variation_pattern_name .selection"].map((selector) => textValue($, selector)).find(Boolean) ?? null;
  const size = textValue($, "#variation_size_name .selection, #inline-twister-row-size_name .selection");
  const color = textValue($, "#variation_color_name .selection, #inline-twister-row-color_name .selection");
  const image = $("#landingImage").attr("data-old-hires") ?? $("#landingImage").attr("src") ?? $("meta[property='og:image']").attr("content") ?? null;
  const description = textValue($, "#feature-bullets") ?? textValue($, "#productDescription") ?? "";
  const availability = textValue($, "#availability") ?? "";
  const seller = textValue($, "#sellerProfileTriggerId, #merchant-info")?.replace(/\s+/g, " ").slice(0, 180) ?? null;
  const rating = Number($("#acrPopover").attr("title")?.match(/[\d.]+/)?.[0]) || null;
  const reviewCount = Number($("#acrCustomerReviewText").text().replace(/[^\d]/g, "")) || null;
  let price: number | null = null, listPrice: number | null = null, priceType: AmazonPriceType = "current_selling", method: string | null = null;
  let subscribeAndSavePrice: number | null = null, couponText: string | null = null;
  diagnostics.methodsAttempted.push("json-ld-product-offer");
  const ld = jsonLdProducts(html); diagnostics.jsonLdFound = ld.found;
  const matchingProducts = ld.products.filter((item) => productAsins(item).includes(asin));
  if (!matchingProducts.length && ld.products.length === 1) matchingProducts.push(ld.products[0]!);
  let matchedProduct: Record<string, any> | null = matchingProducts[0] ?? null;
  for (const candidate of matchingProducts) {
    const match = schemaOffer(candidate, asin);
    if (match) { matchedProduct = candidate; price = match.price; method = "json-ld-product-offer"; break; }
  }
  if (matchedProduct) {
    const rawList = matchedProduct.listPrice ?? matchedProduct.msrp ?? matchedProduct.offers?.priceSpecification?.referencePrice;
    listPrice = dollars(rawList);
  }

  diagnostics.methodsAttempted.push("amazon-microdata-product-offer");
  if (!price) {
    const value = (node: ReturnType<typeof $>) => node.attr("content") ?? node.attr("href") ?? node.text().trim();
    $("[itemscope][itemtype*='Product']").each((_i, element) => {
      if (price) return;
      const node = $(element), sku = value(node.find("[itemprop='sku'], [itemprop='productID']").first());
      if (sku && sku.toUpperCase() !== asin) return;
      const offer = node.find("[itemprop='offers'][itemscope]").first();
      const amount = dollars(value(offer.find("[itemprop='price']").first()));
      const currency = value(offer.find("[itemprop='priceCurrency']").first());
      if (!amount || currency !== "USD") return;
      const availability = value(offer.find("[itemprop='availability']").first());
      const name = value(node.find("[itemprop='name']").first()) || pageTitle;
      price = amount; method = "amazon-microdata-product-offer";
      matchedProduct = { name, brand: value(node.find("[itemprop='brand'] [itemprop='name'], [itemprop='brand']").first()), description: value(node.find("[itemprop='description']").first()), image: value(node.find("[itemprop='image']").first()), offers: { availability } };
    });
  }

  diagnostics.methodsAttempted.push("embedded-product-json");
  const embeddedValues: unknown[] = [];
  $("script").each((_i, element) => {
    const text = $(element).text().trim();
    if (!text || text.length > 4_000_000) return;
    try { embeddedValues.push(JSON.parse(text)); } catch {
      const marker = text.match(/(?:window\.__(?:INITIAL_STATE|APOLLO_STATE)__|ue\s*\(\s*\w+\s*,\s*['"]\w+['"]\s*,)\s*(\{[\s\S]*\})\s*;?$/);
      if (marker) try { embeddedValues.push(JSON.parse(marker[1]!)); } catch {}
    }
  });
  diagnostics.embeddedProductDataFound = embeddedValues.length > 0;
  if (!price) for (const value of embeddedValues) {
    const offer = embeddedOffer(value, asin);
    if (offer) { price = offer.price; priceType = offer.kind; method = "embedded-product-json"; break; }
  }
  if (!listPrice) for (const value of embeddedValues) { listPrice = embeddedListPrice(value, asin); if (listPrice) break; }

  diagnostics.methodsAttempted.push("amazon-product-price-html");
  const currentSelectors = [
    "#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen",
    "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen",
    "#apex_offerDisplay_desktop .a-price:not(.a-text-price) .a-offscreen",
    ".apexPriceToPay .a-offscreen", "#priceblock_dealprice", "#priceblock_ourprice", "#price_inside_buybox", "#newBuyBoxPrice",
  ];
  const foundPrices: number[] = [];
  for (const selector of currentSelectors) {
    $(selector).each((_i, element) => {
      const node = $(element), raw = node.attr("content") ?? node.text();
      const amount = dollars(raw);
      if (!amount) return;
      diagnostics.priceElementsFound = true; foundPrices.push(amount);
      const context = `${node.attr("id") ?? ""} ${node.parent().attr("class") ?? ""} ${node.closest("[id]").attr("id") ?? ""} ${node.closest("[class]").attr("class") ?? ""}`.toLowerCase();
      if (!price) {
        price = amount;
        priceType = /prime.?exclusive|prime.?price/.test(context) ? "prime_exclusive" : /deal|saving/.test(context) ? "deal" : "current_selling";
        method = "amazon-product-price-html";
      }
    });
    if (price) break;
  }
  const listSelectors = ["#corePrice_feature_div .a-text-price .a-offscreen", "#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen", "#listPrice", ".basisPrice .a-offscreen"];
  for (const selector of listSelectors) { const foundListPrice = dollars($(selector).first().attr("content") ?? $(selector).first().text()); if (foundListPrice) { listPrice = foundListPrice; break; } }
  subscribeAndSavePrice = dollars($("#sns-base-price .a-offscreen, #sns-base-price").first().attr("data-price") ?? $("#sns-base-price .a-offscreen, #sns-base-price").first().text());
  couponText = textValue($, "#couponText, #couponFeature, .couponBadge");
  diagnostics.currencyDetection = price ? "USD from explicit $ price on amazon.com product page" : diagnostics.priceElementsFound ? "price elements found; USD amount not confirmed" : "no current price or currency found";

  if (!price) {
    const bodyStart = $.root().text().slice(0, 40000);
    diagnostics.failureReason = /captcha|robot check|automated access|sorry, we just need to make sure/i.test(bodyStart)
      ? "Amazon returned a bot-check or access-restriction page; no bypass attempted"
      : diagnostics.priceElementsFound ? "Amazon price markup exists but contains no unambiguous current USD selling price" : "Amazon product HTML contained no supported current-price element";
    return { product: null, diagnostics };
  }
  const productAsinOnPage = $("#ASIN").attr("value") ?? $("input[name='ASIN']").first().attr("value");
  if (productAsinOnPage && productAsinOnPage.toUpperCase() !== asin) {
    diagnostics.failureReason = `Page selected ASIN ${productAsinOnPage}, not requested ASIN ${asin}`;
    return { product: null, diagnostics };
  }
  if (foundPrices.length > 1 && new Set(foundPrices).size > 1) diagnostics.currencyDetection += `; multiple current-price candidates (${foundPrices.slice(0, 5).join(", ")})`;
  const productName = String(matchedProduct?.name ?? pageTitle).trim();
  if (!productName) {
    diagnostics.failureReason = `Current USD price found for ASIN ${asin}, but product title could not be matched`;
    return { product: null, diagnostics };
  }
  diagnostics.methodSucceeded = method;
  return { product: {
    asin, name: productName.slice(0, 500), brand: matchedProduct?.brand?.name ?? matchedProduct?.brand ?? brandText,
    variant, size, color, image: Array.isArray(matchedProduct?.image) ? matchedProduct.image[0] : matchedProduct?.image ?? image,
    description: String(matchedProduct?.description ?? description).slice(0, 2500), price, listPrice: listPrice && listPrice > price ? listPrice : null,
    priceType, subscribeAndSavePrice, couponText, availability: String(matchedProduct?.offers?.availability ?? availability),
    seller: matchedProduct?.offers?.seller?.name ?? seller, rating: Number(matchedProduct?.aggregateRating?.ratingValue) || rating,
    reviewCount: Number(matchedProduct?.aggregateRating?.reviewCount ?? matchedProduct?.aggregateRating?.ratingCount) || reviewCount,
    currency: "USD", priceObservedAt: new Date().toISOString(), sourcePage: pageUrl,
  }, diagnostics };
}

export function extractAmazonSearchPrice(html: string, searchUrl: string, asin: string) {
  const $ = load(html); const card = $(`[data-asin='${asin}']`).first();
  if (!card.length) return { price: null, name: null, variant: null, reason: "Exact ASIN was absent from Amazon search/listing results" };
  const name = card.find("h2 a span").first().text().replace(/\s+/g, " ").trim() || null;
  const priceText = card.find(".a-price:not(.a-text-price) .a-offscreen").first().text().trim();
  const price = dollars(priceText);
  const variant = card.find(".a-size-base-plus").first().text().trim() || null;
  return { price, name, variant, reason: price ? null : "Exact ASIN result had no current USD price" };
}
