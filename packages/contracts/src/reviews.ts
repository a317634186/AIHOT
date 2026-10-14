import type { Offer } from './shopping.ts';
export interface ReviewSummary {
 format:'media_review'|'user_experience'|'buying_guide'|'ai_pick'|'video_review';
 author:string|null;verdict:string;bestFor:string|null;strengths:string[];limitations:string[];
 testingNote:string|null;questions:{question:string;answer:string}[];
 videoUrl:string|null;basis:'source_text';
}
export const REVIEW_LABELS:Record<ReviewSummary['format'],string>={media_review:'Media review',user_experience:'User experience',buying_guide:'Buying guide',ai_pick:'AI-assisted pick',video_review:'Video review'};
/** Headlines that announce or relay a product rather than evaluate it; a stored review on such an article is not enough to shelve it as a review. */
const ANNOUNCEMENT=/\b(?:reports?|announces?|unveils?|launches?|introduces?|debuts?|confirms?|highlights?|teases?|leaks?|now available|pre-?orders?|preorder|goes on sale|rumou?red|reportedly)\b/i;
export function isReviewContent(d:Pick<Offer,'kind'|'review'>,title=''){
 if(d.kind!=='buying_guide')return false;
 if(/\bhow to (?:watch|stream)\b|\blive[- ]?stream\b|\bsecurity settings\b/i.test(title))return false;
 const evaluative=/\breview|hands[ -]on|\btested\b|\bbest\s+(?!deals?\b|offers?\b|prices?\b|discounts?\b|sales?\b)|buying guide|comparison|\bvs\.?\b|worth (?:it|buying)|should you buy/i.test(title.replace(/\bBest Buy\b/gi,'retailer'));
 // An announcement headline ("X reports/launches/highlights Y") is news unless the headline itself
 // evaluates, whatever review format the extractor attached to it.
 if(ANNOUNCEMENT.test(title)&&!evaluative)return false;
 return !!d.review||evaluative;
}
export function publicVideoUrl(raw:string):string|null {
 try{const u=new URL(raw);if(u.protocol!=='https:')return null;
 if(u.hostname==='youtu.be'){const id=u.pathname.slice(1);return /^[\w-]{11}$/.test(id)?'https://www.youtube.com/watch?v='+id:null;}
 if(['youtube.com','www.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com','m.youtube.com'].includes(u.hostname)){
  const id=u.pathname==='/watch'?u.searchParams.get('v'):/^\/(?:embed|shorts)\/([\w-]{11})\/?$/.exec(u.pathname)?.[1];return id&&/^[\w-]{11}$/.test(id)?'https://www.youtube.com/watch?v='+id:null;
 }
 if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname)){const id=/^\/(?:video\/)?(\d+)\/?$/.exec(u.pathname)?.[1];return id?'https://vimeo.com/'+id:null;}
 }catch{}return null;
}
