import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referencePriceFromSource, sentencesOf } from '@aihot/contracts/price-reference';

/**
 * Every case here comes from a real feed item that the extractor got wrong in production. The rule
 * being protected: a stated was price must be found, and anything ambiguous must stay null.
 */
const accepted: Array<[string, number, number, string]> = [
  ['VitaUp Beet Root Gummies for just $12.46 shipped or less (regularly $24.91) when you clip the coupon', 1246, 2491, 'parenthetical regularly'],
  ["adidas Women's Adizero Boston 12 Running Shoes $67 $160 free shipping more With promo code \"COZY\"", 6720, 16000, 'rounded feed header'],
  ["at $45.99, down from $79.99. That's the lowest price we could find", 4599, 7999, 'down from'],
  ["the Sonos Play Portable Speaker down at $209.30 shipped. You're looking at a regularly $299 speaker", 20930, 29900, 'reference in next sentence'],
  ['The deal: $239.99 at Target, down from $279.99', 23999, 27999, 'down from with label'],
  ['List price $40, now $25 at Target', 2500, 4000, 'list price first'],
  ['MSRP $40 — on sale for $25', 2500, 4000, 'msrp'],
  ['Compare at $40: $25 today only', 2500, 4000, 'compare at'],
  ['Retails for $40, we found $25', 2500, 4000, 'retails for'],
  ['Normally $40, this is $25', 2500, 4000, 'normally'],
  ['It was $40, now $25 at Amazon', 2500, 4000, 'bare was'],
  ['$25 after coupon. Reg. price $40.', 2500, 4000, 'abbreviation must not split the sentence'],
  ['$1,299 down from $1,899 on the laptop', 129900, 189900, 'thousands separator'],
  ['Get it for $25 (was $40)', 2500, 4000, 'parenthetical was'],
];

const rejected: Array<[string, number, string]> = [
  ['it originally cost over $500 for this 7W model', 9500, 'vague range is not a price'],
  ['at $20 per month for 36 months with a plan, down from $36 per month', 2000, 'payment schedule'],
  ["Lowe's offers two of these 5-gallon buckets for $6 after an in-cart discount", 600, 'bundle against unit price'],
  ['This Lisen tablet holder is $6 off the regular price of $23 at Amazon', 600, 'saving, not the charged amount'],
  ['Save $50 on orders over $100 when you buy the $25 toaster', 2500, 'threshold and saving'],
  ['$25 shipped. Shipping was $8.', 2500, 'shipping fee'],
  ['$25 vs $40 elsewhere', 2500, 'versus is not a was-price cue'],
  ['for only $39.99 shipped! Even better, through November 14th', 3999, 'no reference stated'],
  ['Nike Air Max DN8s are $85 (instead of $220), and Skechers drop to $19', 1900, 'must not borrow another product'],
  ["Chaps Men's Printed Polo from $2.63 $18 free shipping", 243, 'variant range has no single was price'],
];

test('a stated was price is recovered from every supported phrasing', () => {
  for (const [text, current, expected, label] of accepted) {
    const found = referencePriceFromSource(text, current);
    assert.equal(found?.wasCents ?? null, expected, label);
  }
});

test('ambiguous or unrelated amounts never become a was price', () => {
  for (const [text, current, label] of rejected) {
    assert.equal(referencePriceFromSource(text, current), null, label);
  }
});

test('sentence splitting keeps abbreviation dots inside the sentence', () => {
  assert.deepEqual(sentencesOf('$25 after coupon. Reg. price $40.'), ['$25 after coupon.', 'Reg. price $40.']);
});

test('no current price means no reference price', () => {
  assert.equal(referencePriceFromSource('was $40, now $25', null), null);
  assert.equal(referencePriceFromSource('was $40, now $25', 0), null);
});