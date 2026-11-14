export interface ComparisonProductName {
  id: string;
  title: string;
  offer?: { brand?: string | null; product?: string | null; model?: string | null; variant?: string | null };
}

export interface ComparisonPairName {
  slug: string;
  leftId: string;
  rightId: string;
  leftName: string;
  rightName: string;
}

export function comparisonProductName(item: ComparisonProductName): string {
  const offer = item.offer;
  const product = offer?.product?.trim() || item.title.trim();
  const model = offer?.model?.trim();
  const core = model && !product.toLowerCase().includes(model.toLowerCase()) ? `${product} ${model}` : product;
  const variant = offer?.variant?.trim();
  const withVariant = variant && !core.toLowerCase().includes(variant.toLowerCase()) ? `${core} ${variant}` : core;
  const brand = offer?.brand?.trim();
  return brand && !withVariant.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${withVariant}` : withVariant;
}

function modelSlug(value: string): string {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length <= 54) return slug;
  return slug.slice(0, 54).replace(/-+[^-]*$/, '').replace(/-+$/g, '');
}

export function comparisonPairName(a: ComparisonProductName, b: ComparisonProductName): ComparisonPairName {
  const leftName = comparisonProductName(a), rightName = comparisonProductName(b);
  const leftSlug = modelSlug(leftName), rightSlug = modelSlug(rightName);
  const aFirst = leftSlug.localeCompare(rightSlug) <= 0;
  return aFirst
    ? { slug: `${leftSlug}-vs-${rightSlug}`, leftId: a.id, rightId: b.id, leftName, rightName }
    : { slug: `${rightSlug}-vs-${leftSlug}`, leftId: b.id, rightId: a.id, leftName: rightName, rightName: leftName };
}

export function comparisonPairsForProducts(items: ComparisonProductName[]): ComparisonPairName[] {
  const top = items.slice(0, 5), pairs: ComparisonPairName[] = [];
  for (let left = 0; left < top.length; left++) {
    for (let right = left + 1; right < top.length; right++) pairs.push(comparisonPairName(top[left]!, top[right]!));
  }
  return pairs;
}
