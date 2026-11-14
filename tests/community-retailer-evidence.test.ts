import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractRetailerEvidence,sameRetailerPage} from '../packages/backend/src/community/retailer-evidence.ts';
const url='https://www.amazon.com/dp/B012345678';
const product={ '@type':'Product',url,name:'Example tool kit',offers:{'@type':'Offer',price:'24.99',priceCurrency:'USD',seller:{name:'Amazon'},availability:'https://schema.org/InStock'}};
const html=(data:unknown)=>`<script type="application/ld+json">${JSON.stringify(data)}</script>`;

test('only a matching retailer product and unconditional in-stock retailer offer establish a verified price',()=>{
 assert.deepEqual(extractRetailerEvidence(html(product),url),{productName:'Example tool kit',state:'verified',priceCents:2499,seller:'Amazon'});
 assert.equal(extractRetailerEvidence(html({...product,url:'https://www.amazon.com/dp/B099999999'}),url),null);
 for(const change of [{seller:{name:'Third party'}},{'@type':'AggregateOffer'},{priceCurrency:'CAD'},{availability:'https://schema.org/PreOrder'},{priceSpecification:{price:24.99}},{validForMemberTier:'Prime'},{itemCondition:'https://schema.org/UsedCondition'}]){
  const result=extractRetailerEvidence(html({...product,offers:{...product.offers,...change}}),url);
  assert.equal(result?.state,'unverified',JSON.stringify(change));assert.equal(result?.priceCents,null);
 }
 assert.equal(extractRetailerEvidence(html({...product,offers:[product.offers,product.offers]}),url)?.state,'unverified');
 assert.equal(extractRetailerEvidence(html({...product,offers:{...product.offers,availability:'https://schema.org/OutOfStock'}}),url)?.state,'out_of_stock');
 assert.equal(sameRetailerPage(url,'https://www.amazon.com/dp/B012345678?tag=savlume-20'),true);
 assert.equal(sameRetailerPage(url,'https://www.amazon.com/dp/B099999999'),false);
});
