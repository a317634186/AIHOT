// One-time, evidence-guarded corrections for the reported examples; no network or model calls.
import {createHash} from 'node:crypto';
import {sql,closeDb} from '@aihot/backend/db';
import {offerIdentity,type Offer} from '@aihot/contracts/shopping';
import {isSaleAnnouncement,saleAnnouncementAsNews,sourceOfferPrice} from '@aihot/contracts/shopping-integrity';

const ids=['og6eiioa6oii1g3plbahirdjs','met76rgcjipo3065o333dvswh','fgc3iqcpe2a0f1nwl5xgri74a'];
try{
 const results=await sql.begin(async tx=>{
  const result:{id:string;action:string}[]=[];
  for(const id of ids){
   const [row]=await tx<{title:string;source_title:string;url:string;body_text:string;data:Offer}[]>`SELECT p.title,a.title AS source_title,a.url,a.body_text,d.data FROM shopping_offers d JOIN publications p ON p.article_id=d.article_id JOIN articles a ON a.id=d.article_id WHERE d.article_id=${id} FOR UPDATE OF d`;
   if(!row)throw new Error(`Missing expected record ${id}`);
   const before=row.data;let after:Offer;let reason:string;let evidence:unknown;
   if(id===ids[0]){
    if(before.kind==='shopping_news'){result.push({id,action:'already classified'});continue;}
    if(!isSaleAnnouncement(row.title,before)||!row.body_text.includes('five different sections')||!row.body_text.includes('October 30th and runs through November 30th'))throw new Error('Costco announcement evidence changed; no update applied');
    after=saleAnnouncementAsNews(before);reason='The article describes a multi-product ad with different promotional windows, not one product offer.';evidence={sourceUrl:row.url,sourceTitle:row.source_title};
   }else if(id===ids[1]){
    if(before.checkoutPriceCents===450){result.push({id,action:'already corrected'});continue;}
    if(before.verifiedAt||before.checkoutPriceCents!==null||before.listedPriceCents!==950||before.coupon!=='LBBH8WQH'||!row.source_title.includes('$4.50')||!row.body_text.includes('$5 off the $9.50 list price')||!row.body_text.includes('LBBH8WQH'))throw new Error('Bath mat evidence changed; no update applied');
    after={...before,checkoutPriceCents:450,...({checkoutPrice:'4.50'} as Record<string,string>),status:'Unverified',verifiedAt:null,verificationNote:'The original title reports $4.50 after code LBBH8WQH and the source describes $5 off $9.50; its offer display rounds these to $5 and $10. The retailer price, code, and availability have not been independently confirmed.'};
    reason='Source title and stated coupon arithmetic support $4.50; the source also displays rounded amounts.';evidence={sourceUrl:row.url,sourceTitle:row.source_title,quote:before.priceEvidence};
   }else{
    if(before.checkoutPriceCents===11900){result.push({id,action:'already corrected'});continue;}
    const found=sourceOfferPrice(row.title,before,row.body_text);
    if(before.verifiedAt||before.checkoutPriceCents!==null||before.listedPriceCents!==null||found?.priceCents!==11900)throw new Error('Charger evidence changed; no update applied');
    after={...before,checkoutPriceCents:11900,...({checkoutPrice:'119.00'} as Record<string,string>),priceEvidence:found.quote,status:'Unverified',verifiedAt:null,verificationNote:'The original source reports $119 for this charger at Amazon. Retailer price and availability have not been independently confirmed.'};
    reason='Original source names the same charger and retailer and explicitly reports the $119 offer price.';evidence={sourceUrl:row.url,quote:found.quote};
   }
   const identity=offerIdentity(after);after.identity=identity?createHash('sha256').update(identity).digest('hex'):null;
   await tx`UPDATE shopping_offers SET data=${tx.json(after as never)},identity_key=${after.identity},next_check_at=now(),updated_at=now() WHERE article_id=${id}`;
   await tx`INSERT INTO shopping_checks(article_id,url,status,evidence) VALUES(${id},${row.url},${id===ids[0]?'SourceReclassified':'SourcePriceCorrected'},${tx.json(evidence as never)})`;
   await tx`INSERT INTO audit_log(actor,action,subject,reason,before,after) VALUES('system:shopping',${id===ids[0]?'shopping.source-reclassified':'shopping.source-price-repair'},${id},${reason},${tx.json({kind:before.kind,listedPriceCents:before.listedPriceCents,checkoutPriceCents:before.checkoutPriceCents} as never)},${tx.json({kind:after.kind,listedPriceCents:after.listedPriceCents,checkoutPriceCents:after.checkoutPriceCents} as never)})`;
   result.push({id,action:id===ids[0]?'reclassified as shopping news':'corrected source-reported price'});
  }
  return result;
 });
 console.log(JSON.stringify(results));
}finally{await closeDb();}
