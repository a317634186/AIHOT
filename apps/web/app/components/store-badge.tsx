import type { ReactNode } from 'react';

const STORES: Record<string, { label: string; className: string }> = {
  amazon: { label: 'Amazon', className: 'amazon' },
  walmart: { label: 'Walmart', className: 'walmart' },
  target: { label: 'Target', className: 'target' },
  'best-buy': { label: 'Best Buy', className: 'best-buy' },
  'home-depot': { label: 'Home Depot', className: 'home-depot' },
  costco: { label: 'Costco', className: 'costco' },
};

function storeKey(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (normalized.includes('amazon') || normalized === 'whole-foods') return 'amazon';
  if (normalized.includes('walmart')) return 'walmart';
  if (normalized.includes('target')) return 'target';
  if (normalized.includes('best-buy')) return 'best-buy';
  if (normalized.includes('home-depot')) return 'home-depot';
  if (normalized.includes('costco')) return 'costco';
  return normalized;
}

export function StoreBadge({ merchant, as = 'span', children }: { merchant: string | null | undefined; as?: 'span' | 'strong'; children?: ReactNode }) {
  const label = merchant?.trim() || 'Retailer';
  const key = storeKey(label);
  const store = STORES[key];
  const Tag = as;
  return <Tag className={`db-store-badge db-store-${store?.className ?? 'default'}`} title={label}>{children ?? store?.label ?? label}</Tag>;
}
