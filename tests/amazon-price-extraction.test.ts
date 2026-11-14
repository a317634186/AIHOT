import assert from "node:assert/strict";
import { test } from "node:test";
import { amazonAsin, extractAmazonProduct, extractAmazonSearchPrice } from "@aihot/backend/dealhunter/amazon";

test("Amazon product HTML extracts current selling price separately from struck list price", () => {
  const html = `<title>Amazon.com: Demo blender</title><input id="ASIN" value="B012345678"><span id="productTitle">Demo Blender 64 oz</span><div id="availability">In Stock</div><div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">$89.99</span></span><span class="a-price a-text-price"><span class="a-offscreen">$129.99</span></span></div>`;
  const result = extractAmazonProduct(html, "https://www.amazon.com/dp/B012345678");
  assert.equal(result.product?.asin, "B012345678");
  assert.equal(result.product?.name, "Demo Blender 64 oz");
  assert.equal(result.product?.price, 89.99);
  assert.equal(result.product?.listPrice, 129.99);
  assert.equal(result.product?.currency, "USD");
  assert.equal(result.product?.availability, "In Stock");
  assert.equal(result.diagnostics.methodSucceeded, "amazon-product-price-html");
});

test("Amazon embedded offer requires exact ASIN and explicit USD currency", () => {
  const state = { products: [
    { asin: "B099999999", priceToPay: { amount: "$14.99", currencyCode: "USD" } },
    { asin: "B012345678", priceToPay: { amount: 42.5, currencyCode: "USD" }, listPrice: { amount: 89.99, currencyCode: "USD" } },
  ] };
  const html = `<title>Amazon.com: Demo product</title><input id="ASIN" value="B012345678"><script id="some-state">${JSON.stringify(state)}</script>`;
  const result = extractAmazonProduct(html, "https://www.amazon.com/dp/B012345678");
  assert.equal(result.product?.price, 42.5);
  assert.equal(result.product?.listPrice, 89.99);
  assert.equal(result.diagnostics.methodSucceeded, "embedded-product-json");
});

test("Amazon JSON-LD scans matching Product offers instead of stopping at the first Product", () => {
  const data = { "@graph": [
    { "@type": "Product", name: "Unrelated item", sku: "B099999999", offers: { "@type": "Offer", price: "12.00", priceCurrency: "USD" } },
    { "@type": "Product", name: "Exact item", sku: "B012345678", offers: { "@type": "Offer", price: "49.95", priceCurrency: "USD", availability: "https://schema.org/InStock" } },
  ] };
  const html = `<input id="ASIN" value="B012345678"><script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const result = extractAmazonProduct(html, "https://www.amazon.com/dp/B012345678");
  assert.equal(result.product?.name, "Exact item");
  assert.equal(result.product?.price, 49.95);
  assert.equal(result.diagnostics.methodSucceeded, "json-ld-product-offer");
});

test("Amazon result fallback only reads the exact ASIN result card", () => {
  const html = `<div data-asin="B012345678" class="s-result-item"><h2><a><span>Exact blender</span></a></h2><span class="a-price"><span class="a-offscreen">$79.00</span></span></div><div data-asin="B099999999" class="s-result-item"><span class="a-offscreen">$9.00</span></div>`;
  assert.deepEqual(extractAmazonSearchPrice(html, "https://www.amazon.com/s?k=B012345678", "B012345678"), { price: 79, name: "Exact blender", variant: null, reason: null });
  assert.equal(extractAmazonSearchPrice(html, "https://www.amazon.com/s?k=B011111111", "B011111111").price, null);
});

test("Amazon ASIN parser supports product detail routes and rejects search URLs", () => {
  assert.equal(amazonAsin("https://www.amazon.com/dp/B012345678?th=1"), "B012345678");
  assert.equal(amazonAsin("https://www.amazon.com/gp/product/B012345678"), "B012345678");
  assert.equal(amazonAsin("https://www.amazon.com/clp/B012345678"), "B012345678");
  assert.equal(amazonAsin("https://www.amazon.com/s?k=B012345678"), null);
});
