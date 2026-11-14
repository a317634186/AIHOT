import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dealRank} from '../packages/backend/src/publication/shopping-ranking.ts';
import {supportedPriceReason} from '../packages/backend/src/shopping/recommendations.ts';
import type {ShoppingItem} from '../packages/backend/src/publication/shopping.ts';
import type {PriceObservation} from '../packages/contracts/src/shopping.ts';

const now=Date.parse('2026-10-29T12:00:00Z');
const base={id:'example',publishedAt:'2026-10-29T00:00:00Z',thirdPartySeller:false,timing:null,offer:{checkoutPriceCents:8000},priceDisplay:{state:'current',amountCents:8000,verification:'source-reported',verifiedAt:null}} as unknown as ShoppingItem;
const neutral={worthIt:0,notWorthIt:0,votes:0};
const observation=(at:string,price:number,basis:'source-reported'|'merchant-verified'):PriceObservation=>({at,listedPriceCents:null,checkoutPriceCents:price,currency:'USD',basis,sourceUrl:'https://example.invalid'});
test('community votes and verified price evidence influence ranking without treating reference prices as savings',()=>{
 const plain=dealRank(base,neutral,[],now);
 assert.ok(dealRank(base,{worthIt:5,notWorthIt:0,votes:5},[],now)>plain);
 assert.ok(dealRank(base,{worthIt:0,notWorthIt:5,votes:5},[],now)<plain);
 assert.ok(dealRank({...base,thirdPartySeller:true},neutral,[],now)<plain);
 const verified={...base,priceDisplay:{...base.priceDisplay,verification:'merchant-verified',verifiedAt:'2026-10-29T11:55:00Z'}} as ShoppingItem;
 const current=observation('2026-10-29T11:55:00Z',8000,'merchant-verified');
 const prior=observation('2026-10-28T11:00:00Z',10000,'merchant-verified');
 const sourceOnly=observation('2026-10-28T11:00:00Z',10000,'source-reported');
 assert.ok(dealRank(verified,neutral,[],now)>plain);
 assert.ok(dealRank(verified,neutral,[prior,current],now)>dealRank(verified,neutral,[sourceOnly,current],now));
 assert.equal(dealRank(verified,neutral,[sourceOnly,current],now),dealRank(verified,neutral,[current],now));
 assert.equal(dealRank(base,neutral,[],now),dealRank(base,neutral,[],now+1000));
});
test('AI price context must use known amounts and include the current price when quoting figures',()=>{
 const source='Source reports $100 before a $90 checkout price.';
 assert.match(supportedPriceReason('The reported $90 is below $100.',9000,source,[]),/\$90/);
 assert.match(supportedPriceReason('The reported $90 is below $100.',8500,source,[]),/needs review/);
 assert.match(supportedPriceReason('The $90 price is below $300.',9000,source,[]),/needs review/);
});
