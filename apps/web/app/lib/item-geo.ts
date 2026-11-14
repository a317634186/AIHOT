import { isCalibratedRegularPrice, isOffer, offerSavings, type Offer } from '@aihot/contracts/shopping';

export interface GeoItem {
  title: string;
  summary?: string;
  source?: string;
  offer: Offer;
  priceDisplay?: { state: 'current' | 'ended' | 'stale' | 'unavailable'; amountCents: number | null };
}

const usd = (cents: number) => '$' + (cents / 100).toFixed(2).replace(/\.00$/, '');
const BOILERPLATE = /\b(?:not|never)\s+(?:stated|specified|provided|given|mentioned|listed|disclosed|confirmed)\b|\bno\s+(?:time|timezone|time zone|deadline|end date|details?)\s+(?:is |was |were )?(?:given|stated|provided|specified)\b|\bgives?\s+no\b|\bsupplied text\b|\bdoes(?:n't| not)\s+(?:state|say|specify|give|provide|mention)\b|\bunclear\s+(?:whether|if)\b.*\b(?:shipping|returns?|warranty)\b/i;

export function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function attributeSource(text: string, source?: string) {
  const name = source?.trim();
  if (!name) return text;
  return text
    .replace(/(^|[.!?]\s+)[Tt]he source (?:says|states|reports|notes|lists|mentions)(?:\s+that)?,?\s*/g, (_m, lead: string) => `${lead}According to ${name}, `)
    .replace(/\b[Tt]he source (?:says|states|reports|notes|lists|mentions)(?:\s+that)?\b/g, `${name} reports that`)
    .replace(/(^|[.!?]\s+)[Aa]ccording to the source,?\s*/g, (_m, lead: string) => `${lead}According to ${name}, `)
    .replace(/\b[Aa]ccording to the source\b/g, `as reported by ${name}`);
}

export function genuineCautions(cautions: string[] | undefined, source?: string) {
  return (cautions ?? []).filter(text => !BOILERPLATE.test(text)).map(text => attributeSource(text, source));
}

export function shortModel(item: GeoItem) {
  const d = item.offer;
  const brand = d.brand?.trim() ?? '';
  let name = (d.model && d.model.length >= 3 && d.product && !d.product.toLowerCase().includes(d.model.toLowerCase()) ? d.product + ' ' + d.model : d.product || d.model || item.title).trim();
  if (brand && name.toLowerCase().startsWith(brand.toLowerCase())) name = name.slice(brand.length).trim() || name;
  if (name.length > 42) name = name.replace(/\s+(?:with|for|and|\&|-|–|—|,)\s+.*$/i, '').split(/\s+/).slice(0, 6).join(' ').replace(/[,;:\-–—]+$/, '');
  return { brand, short: name, full: brand ? brand + ' ' + name : name };
}

function currentAmount(item: GeoItem) {
  if (item.priceDisplay) return item.priceDisplay.state === 'current' ? item.priceDisplay.amountCents : null;
  return item.offer.checkoutPriceCents;
}

export function priceFacts(item: GeoItem) {
  const d = item.offer;
  const current = currentAmount(item);
  const saving = current !== null && d.listedPriceCents !== null ? offerSavings({ listedPriceCents: d.listedPriceCents, checkoutPriceCents: current }) : null;
  const unit = d.unitPriceCents && d.unitLabel ? `${usd(d.unitPriceCents)} per ${d.unitLabel}` : null;
  return { current, saving, unit, comparison: d.comparison?.trim() || null, retailer: d.merchant };
}

export function leadSentence(item: GeoItem, summary: string) {
  const d = item.offer;
  if (!isOffer(d) || isCalibratedRegularPrice(d) || d.status === 'Expired' || d.status === 'Out of Stock') return '';
  const { current, saving, retailer } = priceFacts(item);
  if (current === null || !saving) return '';
  const lower = summary.toLowerCase();
  if (lower.includes(usd(saving.wasCents).toLowerCase()) || lower.includes(saving.percent + '%')) return '';
  const code = d.coupon && d.coupon.length <= 22 ? ` with code ${d.coupon}` : '';
  return `At ${usd(current)} (${saving.percent}% off its ${usd(saving.wasCents)} regular price${retailer ? ' at ' + retailer : ''})${code}, this ${shortModel(item).full} offer saves you ${usd(saving.wasCents - current)}.`;
}

export function offerHeading(item: GeoItem) {
  return `What you should know about ${shortModel(item).full}`;
}

export function itemProsCons(item: GeoItem) {
  const ai = item.offer.aiOverview;
  return { pros: ai?.highlights ?? [], cons: genuineCautions(ai?.cautions, item.source), bestFor: ai?.bestFor ?? null };
}

const joinSentences = (parts: Array<string | null | undefined | false>) => parts.filter((part): part is string => Boolean(part)).map(part => part.trim().replace(/\.?$/, '.')).join(' ');

export function itemFaqs(item: GeoItem): Array<{ question: string; answer: string }> {
  const d = item.offer;
  if (!isOffer(d) || d.kind === 'buying_guide') return [];
  const { full } = shortModel(item);
  const retailer = d.merchant ?? 'the retailer';
  const { current, saving, unit, comparison } = priceFacts(item);
  const { pros, cons, bestFor } = itemProsCons(item);
  const calibrated = isCalibratedRegularPrice(d);
  const faqs: Array<{ question: string; answer: string }> = [];
  const priceAnswer = joinSentences([
    current !== null ? `${calibrated ? 'The current store price is' : 'The current price is'} ${usd(current)}` : null,
    saving ? `That is ${saving.percent}% off the ${usd(saving.wasCents)} regular price, saving ${usd(saving.wasCents - (current ?? 0))}` : d.listedPriceCents !== null && current !== null ? `The listed price is ${usd(d.listedPriceCents)}` : null,
    comparison ? sentenceCase(attributeSource(comparison, item.source)) : null,
    unit ? `Unit price is ${unit}` : null,
  ]);
  if (priceAnswer) faqs.push({ question: `Is the ${full} deal at ${retailer} a good price?`, answer: priceAnswer + ' Prices can change; confirm at checkout.' });
  const prosCons = joinSentences([bestFor ? `Best suited for ${bestFor.replace(/\.$/, '')}` : null, pros.length ? 'What stands out: ' + pros.slice(0, 3).map(text => text.replace(/\.$/, '')).join('; ') : null, cons.length ? 'Before you buy: ' + cons.slice(0, 3).map(text => text.replace(/\.$/, '')).join('; ') : null]);
  if (prosCons) faqs.push({ question: `What are the main pros and trade-offs of the ${full}?`, answer: prosCons });
  const code = d.coupon && d.coupon.length <= 22 ? d.coupon : null;
  const redeem = joinSentences([
    code ? `Apply promo code ${code} at ${retailer} checkout` : d.coupon ? sentenceCase(d.coupon) : null,
    !code && !d.coupon && d.steps?.length ? sentenceCase(d.steps[0]!) : null,
    d.membership ? `${d.membership} membership is required for this price` : null,
    !code && !d.coupon && !d.membership && !d.steps?.length ? `No promo code or membership was reported; the price applies at ${retailer}` : null,
    d.expiresAt ? `Offer end date: ${d.expiresAt.slice(0, 10)}` : d.deadlineOriginal ? `Deadline: ${d.deadlineOriginal}` : 'No end date was reported',
  ]);
  if (current !== null) faqs.push({ question: `How do I get the ${usd(current)} price on ${full} at ${retailer}?`, answer: redeem });
  return faqs;
}
