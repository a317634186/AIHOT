import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moderationStatus} from '../packages/backend/src/community/moderation-policy.ts';

test('comments and replies are moderated automatically regardless of member level',()=>{
 for(const kind of ['product_comment','reply']){
  assert.equal(moderationStatus(kind,0,{decision:'allow',confidence:0.93}),'published');
  assert.equal(moderationStatus(kind,0,{decision:'allow',confidence:0.92}),'rejected');
  assert.equal(moderationStatus(kind,3,{decision:'review',confidence:0.99}),'rejected');
  assert.equal(moderationStatus(kind,3,{decision:'reject',confidence:0.8}),'rejected');
  assert.equal(moderationStatus(kind,0,undefined),'pending_ai');
 }
});

test('deal submissions and discussions retain their existing review rules',()=>{
 const allow={decision:'allow' as const,confidence:0.99};
 assert.equal(moderationStatus('offer_submission',3,allow),'pending_review');
 assert.equal(moderationStatus('discussion',0,allow),'pending_review');
 assert.equal(moderationStatus('discussion',2,allow),'published');
});
