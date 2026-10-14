// Site policy, shared by deterministic checks, worker schedules, and the public reader.
export const SHOPPING = {
  enabled: !(typeof process !== "undefined" && process.env.AIHOT_INVARIANT_MODE === "true"),
  locale: "en-US",
  currency: "USD",
  timeZone: "America/New_York",
  briefingHour: 8,
  verificationMaxAgeHours: 4,
  recheckMinutes: 30,
  dealDiscoveryMaxAgeDays: 7,
  /**
   * How long an offer without any stated deadline is still shown as current. A product price or
   * promo code older than this is labelled "may have ended" and leaves Best Deals; a store-wide
   * coupon, cashback or freebie gets a longer run. Offers with a stated deadline use that instead.
   */
  productDealShelfDays: 3,
  couponShelfDays: 10,
  calibration: "Provisional: shopping thresholds have not been calibrated against human-labeled examples.",
} as const;
export const MERCHANTS = [
  {
    "id": "amazon",
    "name": "Amazon",
    "domains": [
      "amazon.com"
    ]
  },
  {
    "id": "walmart",
    "name": "Walmart",
    "domains": [
      "walmart.com"
    ]
  },
  {
    "id": "target",
    "name": "Target",
    "domains": [
      "target.com"
    ]
  },
  {
    "id": "best-buy",
    "name": "Best Buy",
    "domains": [
      "bestbuy.com"
    ]
  },
  {
    "id": "costco",
    "name": "Costco",
    "domains": [
      "costco.com"
    ]
  },
  {
    "id": "sams-club",
    "name": "Sam’s Club",
    "domains": [
      "samsclub.com"
    ]
  },
  {
    "id": "newegg",
    "name": "Newegg",
    "domains": [
      "newegg.com"
    ]
  },
  {
    "id": "bh-photo",
    "name": "B&H Photo",
    "domains": [
      "bhphotovideo.com"
    ]
  },
  {
    "id": "home-depot",
    "name": "Home Depot",
    "domains": [
      "homedepot.com"
    ]
  },
  {
    "id": "lowes",
    "name": "Lowe’s",
    "domains": [
      "lowes.com"
    ]
  },
  {
    "id": "cvs",
    "name": "CVS",
    "domains": [
      "cvs.com"
    ]
  },
  {
    "id": "walgreens",
    "name": "Walgreens",
    "domains": [
      "walgreens.com"
    ]
  },
  {
    "id": "sephora",
    "name": "Sephora",
    "domains": [
      "sephora.com"
    ]
  },
  {
    "id": "ulta",
    "name": "Ulta Beauty",
    "domains": [
      "ulta.com"
    ]
  },
  {
    "id": "nike",
    "name": "Nike",
    "domains": [
      "nike.com"
    ]
  },
  {
    "id": "adidas",
    "name": "Adidas",
    "domains": [
      "adidas.com"
    ]
  }
,
 {id:"under-armour",name:"Under Armour",domains:["underarmour.com"]},
 {id:"woot",name:"Woot",domains:["woot.com"]},
 {id:"dell",name:"Dell",domains:["dell.com"]},
 {id:"samsung",name:"Samsung",domains:["samsung.com"]},
 {id:"apple",name:"Apple",domains:["apple.com"]},
 {id:"chewy",name:"Chewy",domains:["chewy.com"]},
 {id:"kohls",name:"Kohl’s",domains:["kohls.com"]},
 {id:"staples",name:"Staples",domains:["staples.com"]},
 {id:"fosi-audio",name:"Fosi Audio",domains:["fosiaudio.com"]},
 {id:"sabrent",name:"Sabrent",domains:["sabrent.com"]}
] as const;
/** Apple hosts that are media or developer services, not the store; a link there is not a purchase destination. */
const NOT_A_STORE = /^(?:apps|itunes|podcasts|tv|music|books|support|developer)\.apple\.com$/;
export function merchantFor(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || NOT_A_STORE.test(u.hostname)) return null;
    return MERCHANTS.find(m => m.domains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`))) ?? null;
  } catch { return null; }
}

/**
 * Link shorteners and affiliate redirectors publishers put in front of merchant links. When a source's
 * anchor names one of these instead of a merchant, the redirect is followed (HEAD, hop by hop) only
 * until a merchant in MERCHANTS appears; the merchant page is never requested in that step and a chain
 * ending anywhere else yields no link.
 */
export const LINK_REDIRECTORS = [
 "amzn.to", "a.co", "on.ltk.com", "howl.link", "howl.me", "go.shopmy.us", "shoplowes.me", "bhpho.to",
 "lvnta.com", "go.magik.ly", "geni.us", "bestbuycreators.7tiv.net", "clicks.trx-hub.com",
] as const;
export function redirectorFor(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return LINK_REDIRECTORS.find(d => u.hostname === d || u.hostname.endsWith(`.${d}`)) ?? null;
  } catch { return null; }
}

export const DEAL_GUIDES = [
 {id:'bensbargains',name:"Ben’s Bargains",domain:'bensbargains.com'},
 {id:'dealnews',name:'DealNews',domain:'dealnews.com'},
 {id:'hip2save',name:'Hip2Save',domain:'hip2save.com'},
 {id:'9to5toys',name:'9to5Toys',domain:'9to5toys.com'},
 {id:'slickdeals',name:'Slickdeals',domain:'slickdeals.net'},
] as const;
export function guideFor(url:string){
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return null;return DEAL_GUIDES.find(s=>u.hostname===s.domain||u.hostname.endsWith('.'+s.domain))??null;}catch{return null;}
}
