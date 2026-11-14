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
  /**
   * Daily admission. Every article gets the cheap prefilter and one score; only the best go on to the
   * paid writing and extraction steps. Below 60% of the cap anything that scores at least
   * `admissionFloor` is admitted; between 60% and 100% only selected items (at or above the source
   * tier's threshold); at the cap nothing more that day. A source's own cap (`_aihot.dailyQuota` in
   * its config, else `sourceDailyQuota`) bounds how many of its articles are even scored.
   */
  dailyPublishCap: 350,
  sourceDailyQuota: 60,
  admissionFloor: 40,
  calibration: "Provisional: shopping thresholds have not been calibrated against human-labeled examples.",
} as const;
/**
 * Affiliate programmes the site is enrolled in. The tag is a public link parameter, not a secret.
 * Amazon's operating agreement requires the disclosure below on the site and a timestamp beside any
 * displayed Amazon price; both are rendered from these values.
 */
export const AFFILIATE = {
  amazonTag: "savlume-20",
  disclosure: "As an Amazon Associate, Savlume earns from qualifying purchases.",
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
    "id": "ebay",
    "name": "eBay",
    "domains": [
      "ebay.com"
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
 {id:"bojangles",name:"Bojangles",domains:["bojangles.com"]},
 {id:"wellbots",name:"Wellbots",domains:["wellbots.com"]},
 {id:"macys",name:"Macy’s",domains:["macys.com"]},
 {id:"stack-social",name:"StackSocial",domains:["stacksocial.com"]},
 {id:"qvc",name:"QVC",domains:["qvc.com"]},
 {id:"vevor",name:"VEVOR",domains:["vevor.com"]},
 {id:"hsn",name:"HSN",domains:["hsn.com"]},
 {id:"zappos",name:"Zappos",domains:["zappos.com"]},
 {id:"wolverine",name:"Wolverine",domains:["wolverine.com"]},
 {id:"micro-center",name:"Micro Center",domains:["microcenter.com"]},
 {id:"degrees-32",name:"32 Degrees",domains:["32degrees.com"]},
 {id:"adorama",name:"Adorama",domains:["adorama.com"]},
 {id:"rei",name:"REI",domains:["rei.com"]},
 {id:"kroger",name:"Kroger",domains:["kroger.com"]},
 {id:"surfshark",name:"Surfshark",domains:["surfshark.com"]},
 {id:"gap-factory",name:"Gap Factory",domains:["gapfactory.com"]},
 {id:"merrell",name:"Merrell",domains:["merrell.com"]},
 {id:"innocn",name:"INNOCN",domains:["innocn.com"]},
 {id:"tractor-supply",name:"Tractor Supply",domains:["tractorsupply.com"]},
 {id:"foot-locker",name:"Foot Locker",domains:["footlocker.com"]},
 {id:"lg",name:"LG",domains:["lg.com"]},
 {id:"fandango-at-home",name:"Fandango at Home",domains:["fandango.com"]},
 {id:"sweetwater",name:"Sweetwater",domains:["sweetwater.com"]},
 {id:"watchgang",name:"Watch Gang",domains:["watchgang.com"]},
 {id:"bath-body-works",name:"Bath & Body Works",domains:["bathandbodyworks.com"]},
 {id:"ashford",name:"Ashford",domains:["ashford.com"]},
 {id:"kate-spade-outlet",name:"Kate Spade Outlet",domains:["katespadeoutlet.com"]},
 {id:"linens-hutch",name:"Linens & Hutch",domains:["linensandhutch.com"]},
 {id:"musicians-friend",name:"Musician’s Friend",domains:["musiciansfriend.com"]},
 {id:"eddie-bauer",name:"Eddie Bauer",domains:["eddiebauer.com"]},
 {id:"outback",name:"Outback Steakhouse",domains:["outback.com"]},
 {id:"buffalo-wild-wings",name:"Buffalo Wild Wings",domains:["buffalowildwings.com"]},
 {id:"craftsman",name:"CRAFTSMAN",domains:["craftsman.com"]},
 {id:"green-man-gaming",name:"Green Man Gaming",domains:["greenmangaming.com"]},
 {id:"xbox",name:"Xbox Store",domains:["xbox.com"]},
 {id:"casio",name:"Casio",domains:["casio.com"]},
 {id:"epic-games",name:"Epic Games Store",domains:["epicgames.com"]},
 {id:"jomashop",name:"Jomashop",domains:["jomashop.com"]},
 {id:"corsair",name:"Corsair",domains:["corsair.com"]},
 {id:"gap",name:"Gap",domains:["gap.com"]},
 {id:"taco-bell",name:"Taco Bell",domains:["tacobell.com"]},
 {id:"dicks-sporting-goods",name:"DICK'S Sporting Goods",domains:["dickssportinggoods.com"]},
 {id:"playstation-store",name:"PlayStation Store",domains:["playstation.com"]},
 {id:"steam",name:"Steam",domains:["steampowered.com"]},
 {id:"humble-bundle",name:"Humble Bundle",domains:["humblebundle.com"]},
 {id:"nintendo",name:"Nintendo",domains:["nintendo.com"]},
 {id:"sunlu",name:"SUNLU",domains:["sunlu.com"]},
 {id:"atmosfx",name:"AtmosFX",domains:["atmosfx.com"]},
 {id:"dell",name:"Dell",domains:["dell.com"]},
 {id:"samsung",name:"Samsung",domains:["samsung.com"]},
 {id:"apple",name:"Apple",domains:["apple.com"]},
 {id:"chewy",name:"Chewy",domains:["chewy.com"]},
 {id:"kohls",name:"Kohl’s",domains:["kohls.com"]},
 {id:"staples",name:"Staples",domains:["staples.com"]},
 {id:"fosi-audio",name:"Fosi Audio",domains:["fosiaudio.com"]},
 {id:"sabrent",name:"Sabrent",domains:["sabrent.com"]},
 {id:"lululemon",name:"lululemon",domains:["lululemon.com"]},
 {id:"marmot",name:"Marmot",domains:["marmot.com"]},
 {id:"wayfair",name:"Wayfair",domains:["wayfair.com"]},
 {id:"anker-solix",name:"Anker SOLIX",domains:["ankersolix.com"]},
 {id:"mint-mobile",name:"Mint Mobile",domains:["mintmobile.com"]},
 {id:"t-mobile",name:"T-Mobile",domains:["t-mobile.com","metrobyt-mobile.com"]},
 {id:"meh",name:"Meh",domains:["meh.com"]}
] as const;
/** Apple hosts that are media or developer services, not the store; a link there is not a purchase destination. */
const NOT_A_STORE = /^(?:apps|itunes|podcasts|tv|music|books|support|developer)\.apple\.com$/;
const NOT_A_RETAILER = /^(?:corporate\.(?:walmart|homedepot)\.com)$/;
const NOT_A_RETAILER_ACCOUNT = /^(?:account|accounts|login|signin|auth|identity|support|help|docs|documentation|forum|forums|community|blog|news|press|corporate|service|services|assets?|cdn|images?|img|media|static|content|gdx-assets)\./i;
export function merchantFor(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || NOT_A_RETAILER.test(u.hostname) || NOT_A_RETAILER_ACCOUNT.test(u.hostname) || (NOT_A_STORE.test(u.hostname) && u.hostname !== "tv.apple.com")) return null;
    return MERCHANTS.find(m => m.domains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`))) ?? null;
  } catch { return null; }
}
/** A retailer-owned landing page for a source-backed storewide sale or clearance event. */
export function isDirectRetailerEventUrl(raw:string|null|undefined):boolean{
 if(!raw)return false;const retailer=merchantFor(raw);if(!retailer)return false;
 try{
  const u=new URL(raw),path=u.pathname.replace(/\/+$/,'');
  if(!path||/^\/(?:search|s|account|login|signin|cart|checkout|help|support|home|welcome)(?:\/|$)/i.test(path))return false;
  if(retailer.id==='woot'&&/^\/category\/(?:electronics|computers|tools|home|sports|kids|clearance|sellout)(?:\/|$)/i.test(path))return true;
  if(retailer.id==='amazon'&&/^\/(?:gp\/goldbox|deals|b)(?:\/|$)/i.test(path))return true;
  return path.split('/').filter(Boolean).some(segment=>/^(?:sale|clearance|warehouse|events?|promotions?|outlet|sellout|deals?|goldbox|top[-_]deals|deal[-_]of[-_]the[-_]day)(?:[-_][a-z0-9]+)*$/i.test(segment));
 }catch{return false;}
}
/** Purchase destinations are retailer product/offer pages; search pages and unrelated storefronts are not purchase links. */
export function isDirectRetailerProductUrl(raw: string | null | undefined): boolean {
  if (!raw || !merchantFor(raw)) return false;
  try {
    const u = new URL(raw); const path = u.pathname.replace(/\/+$/, '');
    const hasId = ['asin','sku','pid','productid','item'].some(k => u.searchParams.has(k));
    const merchantId=merchantFor(raw)?.id;
    // Meh uses one permanent, product-specific /deals/{slug} page per daily offer.
    if(merchantId==='meh'&&/^\/deals\/[a-z0-9-]+$/i.test(path))return true;
    if(/\/CookieFailure\.do$/i.test(path))return false;
    if(/\/(?:help|support|customer-service|contact-us|faq|privacy(?:[-_]policy)?|terms(?:[-_]of[-_]use)?|cookie-policy|legal)(?:\/|\.|$)/i.test(path))return false;
    if(/\/(?:accessibility|careers?|investor-relations|about(?:-us)?|press-room|media-center)(?:\/|$)/i.test(path))return false;
    if(/\/(?:recommendations?|recommended)(?:\/|\.|$)/i.test(path)&&!hasId)return false;
    if(/\/(?:registry|gift-registry|rewards|track-order|order-status|wishlist|saved-items)(?:\/|$)/i.test(path)&&!hasId)return false;
    if(/\.(?:png|jpe?g|gif|webp|avif|svg|mp4|webm|pdf|zip|xml|json)$/i.test(path))return false;
    if(/^\/(?:reauthenticate|reauth|authenticate|authentication|sign-in|signin|login|auth|oauth|session)(?:\/|$)/i.test(path))return false;
    if(/^\/(?:email[-_]sign[-_]up(?:\.html)?|newsletter(?:[-_]sign[-_]up)?|subscribe)(?:\/|$)/i.test(path)&&!hasId)return false;
    if(/^\/(?:daily[-_]deals?|deal[-_]of[-_]the[-_]day|deals[-_]of[-_]the[-_]day|special[-_]buys?)(?:\/|$)/i.test(path)&&!hasId)return false;
    if(merchantId==='amazon'&&(/^\/promocode\/[A-Z0-9]+$/i.test(path)||/^\/hz\/audible\/arya\/mlp$/i.test(path)||/^\/gp\/video\/detail\/[A-Z0-9]{10}$/i.test(path)||/^\/fmc\/markdowndeals$/i.test(path)))return true;
    if(merchantId==='amazon'&&!/\/(?:dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}(?:\/|$)/i.test(path))return false;
    if (merchantFor(raw)?.id === 'best-buy' && /^\/gamers\/?$/i.test(path)) return true;
    if (merchantFor(raw)?.id === 't-mobile' && u.hostname === 'www.metrobyt-mobile.com' && /^\/deals\/40period\/?$/i.test(u.pathname)) return true;
    if (merchantId === 'bojangles' && /^\/order\/?$/i.test(path)) return true;
    if (merchantFor(raw)?.id === 'amazon' && (/^\/(?:checkpoint|ax\/claim)(?:\/|$)/i.test(path) || u.searchParams.has('token') && !/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(path))) return false;
    if (!hasId && /\/(?:saved-items|wishlist|favorites|shipping|returns?|return-policy|customer-service|contact-us|about-us|faq|store-locator|change-location|change-store|select-location|pickup-location)(?:\/|\.|$)/i.test(path)) return false;
    if(merchantId==='macys'&&/^\/shop\/product\/[^/]+/i.test(path))return true;
    if(merchantId==='green-man-gaming'&&/^\/games\/[a-z0-9-]+-pc\/?$/i.test(path))return true;
    if(merchantId==='woot'&&/^\/top-?20(?:\/|$)/i.test(path))return false;
    if(merchantId==='woot'&&/^\/category\/home(?:\/|$)/i.test(path))return false;
    if(merchantId==='green-man-gaming'&&/^\/games\/[a-z0-9-]+-pc\/?$/i.test(path))return true;
    if(merchantId==='humble-bundle'&&/^\/store\/(?:c|search|category)(?:\/|$)/i.test(path))return false;
    if(merchantId==='under-armour'&&(/^\/(?:en-us\/)?c\//i.test(path)||/\/(?:outlet|clearance)(?:\/|$)/i.test(path)))return false;
    if(merchantId==='lululemon'&&/^\/(?:[a-z]{2}-[a-z]{2}\/)?c\//i.test(path))return false;
    if (!path) return hasId;
    if (merchantFor(raw)?.id === 'amazon' && /\/b\/?$/i.test(path)) return false;
    if (/^\/gp\/(?:help|your-account|sign-in|cart|search|browse|customer|redirect)(?:\/|$)/i.test(path) && !hasId) return false;
    if (/^\/(?:q|search|search-results)(?:\/|$)/i.test(path) && !hasId) return false;
    if (/^\/(?:s|search|deals?|categor(?:y|ies)|browse|alldeals|stores|brands?|clearance|sale|shop|plus|collections?|promotions?|library|photos?|games?|gamers?|gaming|video-games|saved-items|wishlist|favorites|my|account|cart|checkout|login|signin|sign-in|auth|checkpoint|ap\/signin|profile|youraccount|services|help|support|home|welcome|create)(?:\/|$)/i.test(path) && !hasId) return false;
    if (/^\/store\/(?:home|all-products|prints|photo-books|cards|gifts|deals|same-day-pickup)(?:\/|$)/i.test(path) && !hasId) return false;
    if (['q','k','query'].some(k => u.searchParams.has(k)) && !hasId) return false;
    return true;
  } catch { return false; }
}

/**
 * Link shorteners and affiliate redirectors publishers put in front of merchant links. When a source's
 * anchor names one of these instead of a merchant, the redirect is followed (HEAD, hop by hop) only
 * until a merchant in MERCHANTS appears; the merchant page is never requested in that step and a chain
 * ending anywhere else yields no link.
 */
export const LINK_REDIRECTORS = [
 "amzn.to", "a.co", "link.amazon", "amzlinks.in", "on.ltk.com", "howl.link", "howl.me", "go.shopmy.us", "shoplowes.me", "bhpho.to",
 "lvnta.com", "go.magik.ly", "geni.us", "bestbuycreators.7tiv.net", "clicks.trx-hub.com", "zdcs.link",
 "goto.target.com", "anrdoezrs.net", "jdoqocy.com", "kqzyfj.com", "njih.net", "ojrq.net", "dotomi.com",
 "58dp.net", "pxf.io", "sjv.io",
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
 {id:'9to5mac',name:'9to5Mac',domain:'9to5mac.com'},
 {id:'krazycouponlady',name:'The Krazy Coupon Lady',domain:'thekrazycouponlady.com'},
 {id:'slickdeals',name:'Slickdeals',domain:'slickdeals.net'},
] as const;
export function guideFor(url:string){
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return null;return DEAL_GUIDES.find(s=>u.hostname===s.domain||u.hostname.endsWith('.'+s.domain))??null;}catch{return null;}
}
