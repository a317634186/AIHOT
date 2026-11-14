export function isAutomaticComment(kind:string){return kind==='product_comment'||kind==='reply'||kind==='review_submission';}

export function moderationStatus(kind:string,level:number,decision:{decision:'allow'|'reject'|'review';confidence:number}|undefined):'published'|'rejected'|'pending_review'|'pending_ai'{
 if(isAutomaticComment(kind)){
  if(!decision)return 'pending_ai';
  return decision.decision==='allow'&&decision.confidence>=0.93?'published':'rejected';
 }
 if(decision?.decision==='reject'&&decision.confidence>=0.97)return 'rejected';
 if(decision?.decision==='allow'&&decision.confidence>=0.93&&level>=2&&kind!=='offer_submission')return 'published';
 return 'pending_review';
}
