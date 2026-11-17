import { cents } from './shopping.ts';

/**
 * Reference ("was") price recovery from source text.
 *
 * The rule this file enforces: a reference price is accepted only when the source states it in the
 * same sentence as the deal price and links the two with an explicit cue. A wrong reference price
 * manufactures a fake discount, which is worse for a reader than showing no discount at all, so
 * every ambiguous case resolves to "unknown".
 */

interface Amount { value: number; index: number }

const MONEY = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)(?!\d|\.\d)/g;

function amountsIn(text: string): Amount[] {
  const found: Amount[] = [];
  for (const match of text.matchAll(MONEY)) {
    const value = cents(match[1]);
    if (value !== null) found.push({ value, index: match.index ?? 0 });
  }
  return found;
}

/** Abbreviation dots are not sentence ends; shielding them keeps "reg. $55" in one sentence. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\b(reg|vs|approx|est|incl|excl|inc|co|corp|ltd|no|st|mt|dr|jr|sr)\./gi, '$1\u0000'],
  [/\b([ei])\.([ei])\./gi, '$1\u0000$2\u0000'],
];

export function sentencesOf(text: string): string[] {
  let shielded = text;
  for (const [pattern, replacement] of ABBREVIATIONS) shielded = shielded.replace(pattern, replacement);
  const restored = (value: string) => value.replaceAll('\u0000', '.');
  return shielded
    .split(/(?<=[.!?;])\s+|\n{2,}/)
    .map(part => restored(part).trim())
    .filter(Boolean);
}

/**
 * Cues that introduce a reference price, checked in the words immediately before the amount.
 * "was", "reg.", "regularly", "list price", "retails for", "originally", "MSRP", "instead of",
 * "down from", "compared to", "normally", "previously", and the bare adjective "regular $299".
 */
const CUE_BEFORE = /(?:\bwas|\breg\.?(?:\s+price)?|\bregular(?:ly)?(?:\s+price)?|\blist\s+price|\bretail(?:s)?(?:\s+for)?|\boriginally|\bMSRP|\binstead\s+of|\bdown\s+from|\bcompare[sd]?\s+(?:at|to|with)|\bnormally|\bpreviously)\s*(?:of\s+)?[:,-]?\s*$/i;
/** "Reg. price $40" puts the noun between the cue and the amount; allow that one intervening word. */
const CUE_WITH_NOUN = /\b(?:reg\.?|regular|list|retail|original|compare[sd]?)\s+price\s*(?:of\s*)?[:,-]?\s*$/i;
/** "(reg. $55.99)" and similar parenthetical forms carry the cue after the price, not before it. */
const CUE_AFTER = /^\s*\)?\s*(?:reg\.?|regularly|was|list|retail|orig(?:inally)?|normally|MSRP)\b/i;

/**
 * A payment schedule or a percentage is not a was price. "$36 per month" and "30% off" both look
 * like money next to a deal price and would silently inflate the shown discount.
 */
const SCHEDULE_OR_PERCENT = /\bper\s+(?:month|mo|year|week|day)|\/\s*mo\b|\ba\s+month\b|\bper\s+year\b|\bannual\b|%\s*off|\bmonthly\b|\bper\s+paycheck\b/i;
/** Vague amounts ("over $500") are not a price the source ever states. */
const VAGUE = /\b(?:over|about|nearly|around|approximately|almost|roughly|up\s+to|under|as\s+low\s+as)\s*(?:of\s+)?$/i;
/** Money that is a threshold, credit or fee rather than a product price. */
const NOT_A_PRICE_AFTER = /^\s*(?:off\b|minimum\b|order\b|purchase\b|credit\b|gift\s*card\b|cashback\b|rewards?\b|savings?\b|discount\b|shipping\b|delivery\b|trade-?in\b)/i;
/**
 * "from $2.63 $18 free shipping" prices the cheapest variant in a range, so the adjacent amount is
 * not that variant's was price. A tiered price cannot support a single reference amount.
 */
const VARIANT_RANGE_BEFORE = /\bfrom\s*$/i;
/** "2 for $6.49" prices a bundle; the was price next to it may price a single unit. */
const UNIT_BUNDLE = /\b\d+\s+for\s*$/i;
/** Extra freight is not a product price. */
const SHIPPING_CONTEXT = /\b(?:shipping|delivery|postage|freight)\b/i;
/**
 * When reading one sentence ahead for a was price, a promotional sentence ("Save $50 on orders over
 * $100") prices something other than the product in hand.
 */
const NOT_A_PRODUCT_SENTENCE = /\b(?:save|savings?|spend|orders?\s+over|minimum|threshold|coupon\s+code|free\s+shipping)\b/i;

export interface ReferencePrice {
  /** The was price, in cents. */
  wasCents: number;
  /** The exact sentence the pair was read from, for auditability. */
  evidence: string;
}

function cueIntroduces(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 60), index);
  if (!CUE_BEFORE.test(before) && !CUE_WITH_NOUN.test(before)) return false;
  // "was $X" is a cue; "was over $X" is a range and is not a stated amount.
  return !VAGUE.test(before.replace(CUE_BEFORE, '').replace(CUE_WITH_NOUN, ''));
}

/**
 * Deal feeds commonly print the pair as a bare "$45 $75 free shipping" header with no cue word.
 * Two adjacent amounts where the second is larger are read as deal-then-reference only in that
 * exact shape, which keeps ordinary prose from being misread. Headers round ("$67" for $67.20), so
 * the comparison allows a small tolerance rather than demanding an exact match.
 */
function adjacentHeaderReference(sentence: string, currentCents: number): number | null {
  const roundsToCurrent = (value: number) =>
    value === currentCents || Math.abs(value - currentCents) <= Math.max(currentCents * 0.01, 100);
  for (const match of sentence.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)\s+\$\s*(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const first = cents(match[1]);
    const second = cents(match[2]);
    if (first === null || second === null) continue;
    if (!roundsToCurrent(first) || second <= first || second > currentCents * 8) continue;
    // The header pair may round the deal price ("$67" for $67.20) while prose later states the exact
    // amount. When the rounded value is not the accepted price, the caller still needs to know.
    return second;
  }
  return null;
}
/** Whether the sentence prints the deal price rounded, as feed headers do next to a was price. */
function headerPrintsRoundedCurrent(sentence: string, currentCents: number): boolean {
  const roundsToCurrent = (value: number) =>
    value !== currentCents && Math.abs(value - currentCents) <= Math.max(currentCents * 0.01, 100);
  for (const match of sentence.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)\s+\$\s*(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const first = cents(match[1]);
    const second = cents(match[2]);
    if (first !== null && second !== null && roundsToCurrent(first) && second > first) return true;
  }
  return false;
}

/**
 * Recover the reference price a source states next to its deal price.
 *
 * @param text Source text (article body, excerpt or headline).
 * @param currentCents The deal price already accepted for this offer.
 * @returns The was price when the source states one unambiguously, otherwise null.
 */
export function referencePriceFromSource(text: string, currentCents: number | null): ReferencePrice | null {
  if (currentCents === null || !Number.isSafeInteger(currentCents) || currentCents <= 0) return null;

  const sentences = sentencesOf(text);
  for (let index = 0; index < sentences.length; index++) {
    const sentence = sentences[index]!;
    const found = amountsIn(sentence);
    if (!found.length) continue;
    const current = found.find(entry => entry.value === currentCents);
    // A feed header rounds the deal price ("$67 $160") while the body states "$67.20". That rounded
    // header is still this offer, so the sentence is eligible even without an exact match.
    const roundedHeader = !current && headerPrintsRoundedCurrent(sentence, currentCents);
    if (!current && !roundedHeader) continue;
    if (SCHEDULE_OR_PERCENT.test(sentence)) continue;
    // A bundle price cannot be compared against a per-unit was price.
    if (current && UNIT_BUNDLE.test(sentence.slice(Math.max(0, current.index - 30), current.index))) continue;

    const header = adjacentHeaderReference(sentence, currentCents);
    // "from $2.63 $18" prices a variant range, so the pair is not one product's was price.
    if (header !== null && !VARIANT_RANGE_BEFORE.test(sentence.slice(0, sentence.indexOf('$')))) {
      return { wasCents: header, evidence: sentence };
    }

    // A publisher often states the deal in one sentence and the was price in the next
    // ("down at $209.30 shipped. You're looking at a regularly $299 speaker"). Read the following
    // sentence too, but only for a cued amount, and never when it introduces another current price.
    const next = sentences[index + 1] ?? '';
    const candidates = [
      ...found.filter(entry => entry.value > currentCents).map(entry => ({ entry, inNext: false })),
      ...amountsIn(next).filter(entry => entry.value > currentCents).map(entry => ({ entry, inNext: true })),
    ];

    for (const { entry, inNext } of candidates) {
      // A was price far above the deal price is almost always a different product or a typo.
      if (entry.value > currentCents * 8) continue;
      const host = inNext ? next : sentence;
      const before = host.slice(Math.max(0, entry.index - 60), entry.index);
      const afterPrice = host.slice(entry.index).replace(/^\$\s*\d[\d,]*(?:\.\d{1,2})?/, '');
      if (NOT_A_PRICE_AFTER.test(afterPrice)) continue;
      // "X off the regular price of $Y" states a saving, not the amount actually charged.
      if (/\b\d+\s+off\b/i.test(before)) continue;
      if (SHIPPING_CONTEXT.test(before.slice(-40)) && !CUE_BEFORE.test(before)) continue;
      if (inNext && (SCHEDULE_OR_PERCENT.test(next) || NOT_A_PRODUCT_SENTENCE.test(next))) continue;

      const cued = cueIntroduces(host, entry.index) || CUE_AFTER.test(afterPrice.slice(0, 12));
      if (!cued) continue;

      return { wasCents: entry.value, evidence: inNext ? `${sentence} ${next}` : sentence };
    }
  }

  return null;
}