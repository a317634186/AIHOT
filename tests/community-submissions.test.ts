import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isCommunitySubmissionUrl} from '../packages/backend/src/community/submissions.ts';
import {affiliateLink,cleanMerchantLink} from '../packages/contracts/src/shopping.ts';

test('community submissions accept direct product and sale links while rejecting intermediaries and redirects',()=>{
 assert.equal(isCommunitySubmissionUrl('https://www.amazon.com/dp/B012345678?tag=someone-20','product'),true);
 assert.equal(isCommunitySubmissionUrl('https://www.walmart.com/deals','event'),true);
 assert.equal(isCommunitySubmissionUrl('https://www.walmart.com/deals','product'),false);
 assert.equal(isCommunitySubmissionUrl('https://slickdeals.net/f/1234-example','product'),false);
 assert.equal(isCommunitySubmissionUrl('https://goto.walmart.com/deals','event'),false);
 assert.equal(isCommunitySubmissionUrl('https://www.walmart.com/deals?url=https://example.com','event'),false);
 assert.equal(isCommunitySubmissionUrl('https://www.amazon.com/ap/signin','event'),false);
 assert.equal(new URL(affiliateLink(cleanMerchantLink('https://www.amazon.com/dp/B012345678?tag=someone-20'))!).searchParams.get('tag'),'savlume-20');
});
