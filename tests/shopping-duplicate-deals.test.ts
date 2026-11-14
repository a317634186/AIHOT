import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameRetailerDeal} from '../packages/backend/src/publication/shopping.ts';
import {canonicalProductTargetKey,eventCampaignKey,normalizedCouponKey} from '../packages/contracts/src/shopping-dedup.ts';
import type {Offer} from '../packages/contracts/src/shopping.ts';

const first={kind:'product_deal',merchantId:'home-depot',merchant:'Home Depot',seller:'Home Depot',model:'DCS334BDCB2460C',buyUrl:'https://www.homedepot.com/p/DEWALT-20V-MAX-XR-Cordless-Brushless-Jigsaw-with-6-0-Ah-and-4-0-Ah-Starter-Kit-DCS334BDCB2460C/314645647',checkoutPriceCents:null,listedPriceCents:19900,currency:'USD',variant:'6.0 Ah and 4.0 Ah batteries with charger',condition:null,coupon:null,minimumSpend:null,membership:null,subscription:null,renewal:null,cashback:null,giftCard:null,points:null,unitLabel:null,unitQuantity:null,region:'US',shipping:'The source reports free shipping; free store pickup is an alternative.',fulfillment:'Free shipping or free store pickup, subject to local availability.',restrictions:['Product availability for store pickup may vary by location.'],status:'Unverified'} as Offer;
const second={...first,variant:null,condition:'New',region:null,shipping:'The source reports free shipping.',fulfillment:'Shipping',restrictions:[]};

test('matching retailer product, model and price merge despite missing variant and pickup wording',()=>{
 assert.equal(sameRetailerDeal(first,second),true);
});
test('different purchase terms and products do not merge',()=>{
 for(const change of [
  {listedPriceCents:18900},{model:'DCS334DIFFERENT'},{buyUrl:'https://www.homedepot.com/p/other/123456'},
  {merchantId:'amazon'},{variant:'Bare tool only'},{condition:'Refurbished'},{seller:'Third-party seller'},
  {coupon:'SAVE10'},{membership:'Membership required'},{restrictions:['In-store only']},
  {shipping:'Shipping is $9.99'}, {status:'Expired'},
 ])assert.equal(sameRetailerDeal(first,{...second,...change} as Offer),false,JSON.stringify(change));
});

test('broad storewide and clearance events share one campaign key while distinct category sales stay separate',()=>{
 const baseEvent={kind:'shopping_news',activityScope:'storewide',merchantId:'woot',merchant:'Woot',buyUrl:'https://www.woot.com/category/electronics',status:'Unverified'} as Offer;
 const k1=eventCampaignKey('Woot Warehouse Clean Out: Multi-Category Clearance Event',baseEvent);
 const k2=eventCampaignKey('Woot Warehouse Clean Out: Up to 80% Off Open-Box Items',{...baseEvent,kind:'product_deal',product:'Woot Warehouse Clean Out sale'});
 const k3=eventCampaignKey('Sellout.woot Warehouse Clean Out: Up to 70% Off Electronics, Home Goods & More',{...baseEvent,merchantId:null,merchant:null,buyUrl:null,activityScope:'event'});
 const k4=eventCampaignKey('Woot Warehouse Clean Out Part II: Up to 79% Off Electronics, Tools, and Home Goods',{...baseEvent,merchantId:null,merchant:null,buyUrl:null,activityScope:'event'});
 assert.equal(k1,'woot|event:clean out warehouse');
 assert.equal(k2,k1);
 assert.equal(k3,k1);
 assert.equal(k4,k1);

 const daily1=eventCampaignKey('Select Woot Daily Deals: Up to 30% off with Code SAVETOBER at Woot',{...baseEvent,kind:'coupon_offer',activityScope:'multi_product',coupon:'SAVETOBER'});
 const daily2=eventCampaignKey('Select Woot Daily Deals: Up to 30% off with Code SAVETOBER',{...baseEvent,kind:'coupon_offer',activityScope:'multi_product',coupon:'Use code SAVETOBER at checkout'});
 assert.equal(daily1,daily2);

 const distinct=[
  eventCampaignKey('Woot Toys Under $25 Sale: Up to 50% Off Plus $10 Off $30 with Code TOYTIME',{...baseEvent,kind:'coupon_offer',activityScope:'event',coupon:'TOYTIME'}),
  eventCampaignKey('All Things Kitchen Sale: Up to 60% off + Extra 20% to 30% off with Code SAVETOBER at Woot',{...baseEvent,kind:'coupon_offer',activityScope:'event',coupon:'SAVETOBER'}),
  eventCampaignKey('Floorcare Sale: Up to 68% off at Woot',{...baseEvent,kind:'buying_guide',activityScope:'multi_product'}),
  eventCampaignKey('Woot Fashion Clearance: Up to 80% Off Plus Extra $10 Off $40 Orders',{...baseEvent,kind:'coupon_offer',activityScope:'multi_product'}),
  k1,
  daily1,
 ];
 assert.equal(new Set(distinct).size,distinct.length);
});

test('product target URLs and coupon phrasings normalize across duplicate reports of the same deal',()=>{
 assert.equal(canonicalProductTargetKey('https://www.amazon.com/dp/B0FQFB8FMG?language=en_US'),'amazon:asin:B0FQFB8FMG');
 assert.equal(canonicalProductTargetKey('https://www.amazon.com/Apple-AirPods-Pro-3/gp/product/B0FQFB8FMG/ref=ox_sc_act_title_1?smid=ATVPDKIKX0DER&psc=1'),'amazon:asin:B0FQFB8FMG');
 assert.equal(normalizedCouponKey('Promo code S09PS0EL takes $30 off at checkout, according to the source.'),'code:s09ps0el');
 assert.equal(normalizedCouponKey('Promo code S09PS0EL at checkout.'),'code:s09ps0el');

 const airpodsA={...first,merchantId:'amazon',merchant:'Amazon',seller:'Amazon',product:'Apple AirPods Pro 3',model:'AirPods Pro 3',variant:null,buyUrl:'https://www.amazon.com/dp/B0FQFB8FMG?language=en_US',checkoutPriceCents:19900,listedPriceCents:24900,shipping:null,fulfillment:null,restrictions:[]} as Offer;
 const airpodsB={...airpodsA,product:'AirPods Pro 3',model:null,buyUrl:'https://www.amazon.com/gp/product/B0FQFB8FMG/ref=sr_1_1?psc=1',shipping:'Free shipping'};
 assert.equal(sameRetailerDeal(airpodsA,airpodsB),true);
});
