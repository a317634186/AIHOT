import { isOffer, type Offer } from './shopping.ts';
const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export function offerPriceText(d:Offer):string {
 if(!isOffer(d))return 'This is a shopping update, not a priced offer.';
 if(d.checkoutPriceCents!==null)return `${usd(d.checkoutPriceCents)} at checkout before tax, ${d.status==='Active'?'confirmed on the retailer page':'as stated by the source'}${d.listedPriceCents!==null&&d.listedPriceCents>d.checkoutPriceCents?` (regular price ${usd(d.listedPriceCents)})`:''}. Shipping and eligibility can change the final total.`;
 if(d.listedPriceCents!==null)return `${usd(d.listedPriceCents)} listed price, as stated by the source. The checkout total was not given.`;
 return 'No price was stated. Check the source and the retailer.';
}
export function offerQuestions(d:Offer):{question:string;answer:string}[]{
 if(!isOffer(d))return [];
 return [
  {question:'What price is reported?',answer:offerPriceText(d)},
  {question:'Is this offer verified?',answer:d.status==='Active'?'The retailer page matched this offer when we last checked. Reconfirm the total and stock before ordering.':d.status==='Expired'?'This offer has expired or passed its stated deadline. It stays here for reference only.':d.status==='Out of Stock'?'The retailer reported this item out of stock when we last checked.':'The price and stock come from the source report; we have not checked them on the retailer page. Confirm at the retailer before you order.'},
  {question:'Which conditions matter?',answer:[d.condition?`Condition: ${d.condition}.`:null,d.seller?`Seller: ${d.seller}.`:null,d.coupon?`Coupon: ${d.coupon}.`:null,...d.restrictions,d.membership,d.subscription,d.minimumSpend?`Minimum spend: ${d.minimumSpend}.`:null,d.shipping].filter(Boolean).join(' ')||'No special conditions were stated. Standard retailer terms apply.'},
  {question:'When does the offer end?',answer:d.deadlineOriginal??(d.expiresAt?`Recorded deadline: ${d.expiresAt}.`:'No deadline was stated. The price or availability may change at any time.')},
  {question:'Are rewards included in the price?',answer:[d.cashback?`Cashback: ${d.cashback}.`:null,d.giftCard?`Gift card: ${d.giftCard}.`:null,d.points?`Points: ${d.points}.`:null].filter(Boolean).join(' ')+' Cashback, gift cards and points, if offered, are separate from the checkout price.'},
 ];
}
