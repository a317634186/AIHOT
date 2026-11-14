import assert from 'node:assert/strict';
import test from 'node:test';
import { itemSeoTitle, supportedItemSeoTitle, type Offer, type SeoDescriptionItem } from '@aihot/contracts/shopping';

const base = {
  title: 'Select Melissa & Doug Toys for $19.99',
  summary: 'A Melissa & Doug wooden toy set for pretend play.',
  offer: {
    brand: 'Melissa & Doug',
    product: 'Wooden Play Set',
    model: 'MD-123',
    merchant: 'Amazon',
    coupon: null,
    status: 'Active',
    listedPriceCents: 2999,
    checkoutPriceCents: 1999,
  } as Offer,
  priceDisplay: {
    state: 'current',
    amountCents: 1999,
    label: 'Source-reported price',
    verification: 'source-reported',
    verifiedAt: null,
    lastCheckedAt: null,
  },
} satisfies SeoDescriptionItem;

test('item SEO titles reject prices and percent-off claims', () => {
  assert.equal(supportedItemSeoTitle('Melissa & Doug Wooden Play Set for $19.99 at Amazon', base), null);
  assert.equal(supportedItemSeoTitle('Melissa & Doug Wooden Play Set 50% Off at Amazon', base), null);
  assert.equal(supportedItemSeoTitle('Melissa & Doug Wooden Play Set Promo Code at Amazon', base), null);
});

test('generic select titles are replaced with a product-specific fallback', () => {
  assert.equal(supportedItemSeoTitle('Select Melissa & Doug Toys at Amazon', base), null);
  const title = itemSeoTitle(base);
  assert.match(title, /Melissa & Doug|Wooden Play Set/);
  assert.doesNotMatch(title, /\$|%/);
});

test('locked AI titles are used when they are specific and price-free', () => {
  const item = {
    ...base,
    offer: { ...base.offer, seoTitle: 'Melissa & Doug Wooden Play Set Deal & Review at Amazon' },
  } satisfies SeoDescriptionItem;
  assert.equal(itemSeoTitle(item), 'Melissa & Doug Wooden Play Set Deal & Review at Amazon');
});
