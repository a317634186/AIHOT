export interface BlogPostMeta {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  excerpt: string;
  category: string;
  readTimeMinutes: number;
  published: string;
  modified: string;
  relatedBest: string[];
  relatedStores: string[];
  relatedPaths: string[];
}

export const BLOG_POSTS_META: BlogPostMeta[] = [
  {
    slug: 'how-to-spot-fake-black-friday-discounts',
    title: 'How to Spot Fake Black Friday List Prices on Amazon & Walmart (2026 Guide)',
    shortTitle: 'Spot Fake Black Friday List Prices',
    description: 'A practical 2026 guide to inflated MSRPs, fake list prices, coupon math, and how to verify a Black Friday deal against recorded price history.',
    excerpt: 'A $300 list price is not evidence of a $300 value. Learn how to separate a real Black Friday markdown from an inflated reference price before checkout.',
    category: 'Black Friday',
    readTimeMinutes: 9,
    published: '2026-11-13T10:00:00-05:00',
    modified: '2026-11-13T10:00:00-05:00',
    relatedBest: ['big-screen-75-plus-tvs', 'air-fryers-under-100'],
    relatedStores: ['amazon', 'walmart'],
    relatedPaths: ['/black-friday', '/about', '/archive'],
  },
  {
    slug: 'black-friday-vs-cyber-monday-when-to-buy',
    title: 'Black Friday vs. Cyber Monday 2026: When to Buy TVs, Laptops & AirPods',
    shortTitle: 'Black Friday vs. Cyber Monday',
    description: 'Compare 2026 Black Friday and Cyber Monday timing for TVs, laptops, monitors, software, tools, and Apple accessories.',
    excerpt: 'The best day depends on the product. TVs and tools usually peak earlier; laptops, monitors, software, and Apple accessories often improve on Cyber Monday.',
    category: 'Seasonal Shopping',
    readTimeMinutes: 8,
    published: '2026-11-13T10:15:00-05:00',
    modified: '2026-11-13T10:15:00-05:00',
    relatedBest: ['big-screen-75-plus-tvs', 'budget-laptops-under-500', 'apple-airpods-and-beats-deals'],
    relatedStores: ['amazon', 'best-buy', 'walmart'],
    relatedPaths: ['/black-friday', '/cyber-monday'],
  },
  {
    slug: 'amazon-prime-vs-walmart-plus-target-circle',
    title: 'Amazon Prime vs. Walmart+ vs. Target Circle: Which Saves More in 2026?',
    shortTitle: 'Prime vs. Walmart+ vs. Target Circle',
    description: 'A 2026 comparison of Amazon Prime, Walmart+, and Target Circle membership perks, shipping thresholds, early deal access, and break-even math.',
    excerpt: 'Membership value comes down to delivery frequency, early-access deals, and whether you already shop one retailer often enough to use the perks.',
    category: 'Membership',
    readTimeMinutes: 9,
    published: '2026-11-13T10:30:00-05:00',
    modified: '2026-11-13T10:30:00-05:00',
    relatedBest: ['household-essentials-stock-up', 'holiday-gifts-under-25'],
    relatedStores: ['amazon', 'walmart', 'target'],
    relatedPaths: ['/coupons'],
  },
  {
    slug: 'dewalt-vs-milwaukee-vs-ryobi-cordless-tools',
    title: 'DeWalt 20V vs. Milwaukee M18 vs. Ryobi 18V: Which Cordless Tool Kit Is Best?',
    shortTitle: 'DeWalt vs. Milwaukee vs. Ryobi',
    description: 'Compare DeWalt 20V MAX, Milwaukee M18, and Ryobi ONE+ 18V battery ecosystems, brushless tools, combo kits, and holiday buying strategy.',
    excerpt: 'The cheapest starter drill is rarely the cheapest system. Compare battery lock-in, brushless value, and which holiday combo kits make sense for your workload.',
    category: 'Tools',
    readTimeMinutes: 10,
    published: '2026-11-13T10:45:00-05:00',
    modified: '2026-11-13T10:45:00-05:00',
    relatedBest: ['dewalt-20v-max-tool-deals', 'milwaukee-m18-and-m12-tool-deals', 'ryobi-and-craftsman-tool-deals', 'cordless-drill-and-impact-kits'],
    relatedStores: ['home-depot', 'amazon'],
    relatedPaths: ['/black-friday'],
  },
  {
    slug: 'air-fryer-size-guide-4qt-vs-6qt-vs-dual',
    title: 'Single vs. Dual-Basket Air Fryers (4-Qt vs. 6-Qt): What Size Should You Buy?',
    shortTitle: '4-Qt vs. 6-Qt Air Fryers',
    description: 'Choose the right air fryer size and basket style for one person, couples, families, meal prep, counter space, and cleanup.',
    excerpt: 'A 6-quart basket sounds better until it crowds your counter. Match capacity to household size, batch cooking, and how often you want to wash the basket.',
    category: 'Kitchen',
    readTimeMinutes: 7,
    published: '2026-11-13T11:00:00-05:00',
    modified: '2026-11-13T11:00:00-05:00',
    relatedBest: ['air-fryers-under-100', 'ninja-kitchen-appliance-deals'],
    relatedStores: ['amazon', 'walmart', 'target'],
    relatedPaths: ['/compare'],
  },
  {
    slug: 'how-to-stack-promo-codes-and-clipped-coupons',
    title: 'How to Stack Promo Codes, Clipped Coupons & Holiday Rebates Without Getting Scammed',
    shortTitle: 'Stack Promo Codes Safely',
    description: 'A step-by-step guide to Amazon, Target, and Walmart coupon stacking rules, retailer rebates, gift cards, and common checkout traps.',
    excerpt: 'Stacking works only when the rules allow it. Learn how to verify coupon order, eligibility, gift-card math, and the final checkout total.',
    category: 'Savings',
    readTimeMinutes: 8,
    published: '2026-11-13T11:15:00-05:00',
    modified: '2026-11-13T11:15:00-05:00',
    relatedBest: ['stocking-stuffers-under-15', 'holiday-gifts-under-25'],
    relatedStores: ['amazon', 'walmart', 'target'],
    relatedPaths: ['/coupons'],
  },
];

export function blogPostMeta(slug: string): BlogPostMeta | null {
  return BLOG_POSTS_META.find(post => post.slug === slug) ?? null;
}
