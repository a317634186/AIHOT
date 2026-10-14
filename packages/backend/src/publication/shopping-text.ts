import type { ShoppingItem } from './shopping.ts';
import { offerQuestions } from '@aihot/contracts/shopping-facts';
import { isOffer } from '@aihot/contracts/shopping';
import { REVIEW_LABELS } from '@aihot/contracts/reviews';
import { SITE } from '@aihot/industry/site';
// Text is plain evidence: escape source Markdown, never include fetched HTML or hidden instructions.
const plain=(s:string)=>s.replace(/[\r\n]+/g,' ').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_\[\]#]/g,'\\$&');
export function shoppingText(item:ShoppingItem,base:string){
 const lines=[`# ${plain(item.title)}`,'',`Canonical page: ${base}/items/${item.id}`,`Publisher: ${SITE.name}`,`Published on ${SITE.name}: ${item.publishedAt}`,`Content updated: ${item.updatedAt??item.publishedAt}`,`Source publication time: ${item.sourcePublishedAt??'Not specified'}`,`Offer status: ${item.offer.status}`,'',plain(item.summary),''];
 for(const q of offerQuestions(item.offer))lines.push('## '+q.question,'',plain(q.answer.trim()),'');
 const ai=item.offer.aiOverview;
 if(isOffer(item.offer)&&ai){lines.push('## AI Recommendation Reasons','',plain(ai.summary),'');if(ai.bestFor)lines.push('Best suited for: '+plain(ai.bestFor),'');if(ai.highlights.length){lines.push('### Why It’s Worth Buying','');for(const reason of ai.highlights)lines.push('- '+plain(reason));}if(ai.priceReason)lines.push('','### Why the Price Makes Sense','',plain(ai.priceReason));if(ai.cautions.length){lines.push('','### Consider before buying','');for(const caution of ai.cautions)lines.push('- '+plain(caution));}lines.push('');}
 const review=item.offer.review;
 if(review){lines.push('## '+REVIEW_LABELS[review.format],'',plain(review.verdict),'','Attribution: '+plain(item.source+(review.author?' · '+review.author:'')),'AI-assisted summary of source text, not a Savlume hands-on test.','');for(const x of review.strengths)lines.push('- Source-reported strength: '+plain(x));for(const x of review.limitations)lines.push('- Source-reported limitation: '+plain(x));for(const q of review.questions)lines.push('','### '+plain(q.question),'',plain(q.answer));if(review.videoUrl)lines.push('','Original video: '+review.videoUrl);}
 lines.push('## Evidence and sources','',plain(item.offer.verificationNote??''),`Last attempted check: ${item.offer.lastCheckedAt??'Not recorded'}`,`Last successful verification: ${item.offer.verifiedAt??'Not recorded'}`,'');
 for(const source of item.sources)lines.push(`${plain(source.name)}: ${source.url}`);
 if(item.offer.buyUrl)lines.push('',`Purchase destination: ${item.offer.buyUrl}`);
 lines.push('','AI-assisted summary of cited source material. Not a hands-on review. Prices and availability can change.');
 return lines.join('\n')+'\n';
}
