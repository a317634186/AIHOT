// US shopping taxonomy. Product categories, content types, offer mechanics, and restrictions are separate.
export const CATEGORIES = [
  {
    "key": "electronics",
    "label": "Electronics & Gaming",
    "section": "Electronics & Gaming",
    "guide": "Electronics & Gaming products and directly related consumer news."
  },
  {
    "key": "home",
    "label": "Home & Kitchen",
    "section": "Home & Kitchen",
    "guide": "Home & Kitchen products and directly related consumer news."
  },
  {
    "key": "grocery",
    "label": "Grocery & Household",
    "section": "Grocery & Household",
    "guide": "Grocery & Household products and directly related consumer news."
  },
  {
    "key": "beauty",
    "label": "Beauty & Personal Care",
    "section": "Beauty & Personal Care",
    "guide": "Beauty & Personal Care products and directly related consumer news."
  },
  {
    "key": "fashion",
    "label": "Fashion & Shoes",
    "section": "Fashion & Shoes",
    "guide": "Fashion & Shoes products and directly related consumer news."
  },
  {
    "key": "kids",
    "label": "Baby, Kids & Toys",
    "section": "Baby, Kids & Toys",
    "guide": "Baby, Kids & Toys products and directly related consumer news."
  },
  {
    "key": "pets",
    "label": "Pets",
    "section": "Pets",
    "guide": "Pets products and directly related consumer news."
  },
  {
    "key": "outdoors",
    "label": "Sports & Outdoors",
    "section": "Sports & Outdoors",
    "guide": "Sports & Outdoors products and directly related consumer news."
  },
  {
    "key": "software",
    "label": "Software & Subscriptions",
    "section": "Software & Subscriptions",
    "guide": "Software & Subscriptions products and directly related consumer news."
  }
] as const;
export const ITEM_TYPES = [
  "product_deal",
  "coupon_offer",
  "cashback_offer",
  "freebie",
  "shopping_news",
  "buying_guide",
  "recall"
] as const;
export const CATEGORY_TAGS = [
  "Product Deal",
  "Coupon Offer",
  "Cashback Offer",
  "Freebie",
  "Shopping News",
  "Buying Guide",
  "Recall"
] as const;
export const OFFER_TAGS = [
  "Price Drop",
  "Coupon Code",
  "Cashback",
  "Gift Card Offer",
  "Freebie",
  "Clearance",
  "Bundle",
  "Member Deal",
  "Refurbished / Open Box"
] as const;
export const RESTRICTION_TAGS = [
  "New Customers",
  "Targeted",
  "In-Store Only",
  "Pickup Only",
  "Subscription Required"
] as const;
export const TOPIC_TAGS = [...OFFER_TAGS, ...RESTRICTION_TAGS] as const;
export const ENTITY_TAGS = [
  "Amazon",
  "Walmart",
  "Target",
  "Best Buy",
  "Costco",
  "Sam’s Club",
  "Newegg",
  "B&H Photo",
  "Home Depot",
  "Lowe’s",
  "CVS",
  "Walgreens",
  "Sephora",
  "Ulta Beauty",
  "Nike",
  "Adidas"
] as const;
export const TAG_SYNONYMS: Readonly<Record<string,string>> = { "bundle": "Bundle", "coupon": "Coupon Code", "refurbished": "Refurbished / Open Box", "open box": "Refurbished / Open Box" };
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string,string>> = {
  "product_deal": "Product Deal",
  "coupon_offer": "Coupon Offer",
  "cashback_offer": "Cashback Offer",
  "freebie": "Freebie",
  "shopping_news": "Shopping News",
  "buying_guide": "Buying Guide",
  "recall": "Recall"
};
export const ENTITIES: Record<string,{name:string;displayTag:string|null;aliases:string[]}> = {
  "amazon": {
    "name": "Amazon",
    "displayTag": "Amazon",
    "aliases": [
      "Amazon"
    ]
  },
  "walmart": {
    "name": "Walmart",
    "displayTag": "Walmart",
    "aliases": [
      "Walmart"
    ]
  },
  "target": {
    "name": "Target",
    "displayTag": "Target",
    "aliases": [
      "Target"
    ]
  },
  "best-buy": {
    "name": "Best Buy",
    "displayTag": "Best Buy",
    "aliases": [
      "Best Buy"
    ]
  },
  "costco": {
    "name": "Costco",
    "displayTag": "Costco",
    "aliases": [
      "Costco"
    ]
  },
  "sams-club": {
    "name": "Sam’s Club",
    "displayTag": "Sam’s Club",
    "aliases": [
      "Sam’s Club"
    ]
  },
  "newegg": {
    "name": "Newegg",
    "displayTag": "Newegg",
    "aliases": [
      "Newegg"
    ]
  },
  "bh-photo": {
    "name": "B&H Photo",
    "displayTag": "B&H Photo",
    "aliases": [
      "B&H Photo"
    ]
  },
  "home-depot": {
    "name": "Home Depot",
    "displayTag": "Home Depot",
    "aliases": [
      "Home Depot"
    ]
  },
  "lowes": {
    "name": "Lowe’s",
    "displayTag": "Lowe’s",
    "aliases": [
      "Lowe’s"
    ]
  },
  "cvs": {
    "name": "CVS",
    "displayTag": "CVS",
    "aliases": [
      "CVS"
    ]
  },
  "walgreens": {
    "name": "Walgreens",
    "displayTag": "Walgreens",
    "aliases": [
      "Walgreens"
    ]
  },
  "sephora": {
    "name": "Sephora",
    "displayTag": "Sephora",
    "aliases": [
      "Sephora"
    ]
  },
  "ulta": {
    "name": "Ulta Beauty",
    "displayTag": "Ulta Beauty",
    "aliases": [
      "Ulta Beauty"
    ]
  },
  "nike": {
    "name": "Nike",
    "displayTag": "Nike",
    "aliases": [
      "Nike"
    ]
  },
  "adidas": {
    "name": "Adidas",
    "displayTag": "Adidas",
    "aliases": [
      "Adidas"
    ]
  }
};
export const IDENTITY_LEXICON: ReadonlyArray<{id:string;name:string;patterns:RegExp[]}> = Object.entries(ENTITIES).map(([id,e])=>({id,name:e.name,patterns:[new RegExp("\\b"+e.name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i")]}));
export const PUBLISHER_DOMAINS: ReadonlyArray<{entityId:string;domains:readonly string[]}> = [
  {
    "entityId": "amazon",
    "domains": [
      "amazon.com"
    ]
  },
  {
    "entityId": "walmart",
    "domains": [
      "walmart.com"
    ]
  },
  {
    "entityId": "target",
    "domains": [
      "target.com"
    ]
  },
  {
    "entityId": "best-buy",
    "domains": [
      "bestbuy.com"
    ]
  },
  {
    "entityId": "costco",
    "domains": [
      "costco.com"
    ]
  },
  {
    "entityId": "sams-club",
    "domains": [
      "samsclub.com"
    ]
  },
  {
    "entityId": "newegg",
    "domains": [
      "newegg.com"
    ]
  },
  {
    "entityId": "bh-photo",
    "domains": [
      "bhphotovideo.com"
    ]
  },
  {
    "entityId": "home-depot",
    "domains": [
      "homedepot.com"
    ]
  },
  {
    "entityId": "lowes",
    "domains": [
      "lowes.com"
    ]
  },
  {
    "entityId": "cvs",
    "domains": [
      "cvs.com"
    ]
  },
  {
    "entityId": "walgreens",
    "domains": [
      "walgreens.com"
    ]
  },
  {
    "entityId": "sephora",
    "domains": [
      "sephora.com"
    ]
  },
  {
    "entityId": "ulta",
    "domains": [
      "ulta.com"
    ]
  },
  {
    "entityId": "nike",
    "domains": [
      "nike.com"
    ]
  },
  {
    "entityId": "adidas",
    "domains": [
      "adidas.com"
    ]
  }
];
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{entityId:string;pattern:RegExp}> = [];
