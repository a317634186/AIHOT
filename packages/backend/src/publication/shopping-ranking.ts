import type {PriceObservation} from '@aihot/contracts/shopping';
import { isCalibratedRegularPrice } from '@aihot/contracts/shopping';
import type {CommunityRating,ShoppingItem} from './shopping.ts';

/** Rank evidence and community feedback with high time freshness weight (80% time, 20% quality/signals). */
export function dealRank(item:ShoppingItem,rating:CommunityRating,history:PriceObservation[],now:number,brandPopularity=0):number{
 const bucket=Math.floor(now/3_600_000)*3_600_000;
 const age=Math.max(0,(bucket-Date.parse(item.publishedAt))/3_600_000);
 // 80% weight on time decay over 72 hours (max 80 points)
 const timeWeight=Number.isFinite(age)?Math.max(0,80*(1-age/72)):0;
 const verified=item.priceDisplay.state==='current'&&item.priceDisplay.verification==='merchant-verified';
 const votes=rating.votes>0?6*(rating.worthIt-rating.notWorthIt)/(rating.votes+4):0;
 const retailerRating=item.offer.retailerRating;
 const ratingSignal=retailerRating&&retailerRating.count>=10?Math.max(-4,Math.min(4,(retailerRating.value-3.5)*2.5*Math.min(1,retailerRating.count/100))):0;
 let observedReduction=0;
 if(verified&&item.priceDisplay.amountCents!==null){
  const current=item.priceDisplay.amountCents,verifiedAt=Date.parse(item.priceDisplay.verifiedAt??'');
  const observations=history.filter(h=>h.basis==='merchant-verified'&&h.currency==='USD'&&Number.isFinite(verifiedAt)&&Date.parse(h.at)<=verifiedAt+60_000)
   .map(h=>({at:Date.parse(h.at),price:item.offer.checkoutPriceCents!==null?h.checkoutPriceCents:h.listedPriceCents}))
   .filter((h):h is {at:number;price:number}=>Number.isFinite(h.at)&&h.price!==null&&h.price>=0).sort((a,b)=>a.at-b.at);
  const latest=observations.at(-1),prior=observations.slice(0,-1).reverse().find(h=>latest&&h.at<latest.at&&h.price>current);
  if(latest?.price===current&&prior&&prior.price>0)observedReduction=Math.min(5,Math.max(0,(prior.price-current)/prior.price*15));
 }
 // 20% quality/evidence signals (max ~20 points)
 const qualityWeight=(verified?8:0)+votes+observedReduction+Math.min(3,Math.log1p(brandPopularity)*0.6)+ratingSignal-(retailerRating&&retailerRating.count>=10&&retailerRating.value<3?4:0)-(item.thirdPartySeller?3:0)+(item.timing?.state==='ending'?1:0);
 const penalty=(isCalibratedRegularPrice(item.offer)?80:0)+(item.offer.priceIssue?25:0);
 return timeWeight+qualityWeight-penalty;
}
