import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isReviewContent,publicVideoUrl,type ReviewSummary} from '@aihot/contracts/reviews';
import {reviewSourceFor} from '@aihot/industry/reviews';
import {observedLinks} from '@aihot/backend/shopping/offers';
import {citedSearchUrls} from '@aihot/backend/shopping/discovery';

test('reviews require review or buying guidance, not every sale roundup or named product',()=>{
 assert.ok(isReviewContent({kind:'buying_guide'},'Headphone review after six months'));
 assert.ok(!isReviewContent({kind:'buying_guide'},'Up to 50% off in a retailer sale'));
 assert.ok(!isReviewContent({kind:'product_deal'},'Best price on headphones'));
 assert.ok(!isReviewContent({kind:'buying_guide'},'Best Buy Highlights Featured Deals Across Electronics'));
 assert.ok(!isReviewContent({kind:'buying_guide'},'The best deals this week'));
 assert.ok(isReviewContent({kind:'buying_guide'},'The best headphones for travel'));
 const review={format:'user_experience'} as ReviewSummary;
 assert.ok(isReviewContent({kind:'buying_guide',review},'My headphones after a year'));
 assert.ok(!isReviewContent({kind:'recall',review},'Safety notice'));
 assert.ok(!isReviewContent({kind:'buying_guide'},'How to Stream Liverpool vs. Man City'));
 assert.ok(!isReviewContent({kind:'buying_guide',review},'Guide: macOS security settings'));
});
test('video destinations must come from observed source links and known public video hosts',()=>{
 const id='abcdefghijk';const html=`<article><iframe title="Product review" src="https://www.youtube-nocookie.com/embed/${id}"></iframe><div data-provider="youtube" data-src="https://www.youtube.com/embed/${id}"></div><a href="https://youtu.be/${id}">Video</a><a href="https://www.youtube.com.evil.example/watch?v=${id}">Fake</a></article>`;
 const found=observedLinks(html,'https://the-gadgeteer.com/example-review');assert.equal(found.videos.length,1);assert.equal(found.videos[0]!.url,'https://www.youtube.com/watch?v='+id);assert.equal(found.videos[0]!.embedded,true);
 assert.equal(publicVideoUrl('javascript:alert(1)'),null);assert.equal(publicVideoUrl('https://youtube.com.evil.example/watch?v='+id),null);
 assert.equal(publicVideoUrl('https://www.youtube.com/embed/notvalid'),null);assert.equal(publicVideoUrl('https://player.vimeo.com/video/123456'),'https://vimeo.com/123456');
});
test('search prose alone is not search evidence and source hosts cannot be impersonated',()=>{
 const message={type:'message',content:[{annotations:[{type:'url_citation',url:'https://www.dcrainmaker.com/review'}]}]};
 assert.deepEqual(citedSearchUrls({output:[message]}),[]);
 assert.deepEqual(citedSearchUrls({output:[{type:'web_search_call',status:'completed'},message]}),['https://www.dcrainmaker.com/review']);
 assert.equal(reviewSourceFor('https://www.dcrainmaker.com/review')?.id,'dcrainmaker');assert.equal(reviewSourceFor('https://dcrainmaker.com.evil.example/review'),null);
});
