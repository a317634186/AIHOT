import {isDirectRetailerProductUrl,merchantFor} from '@aihot/industry/shopping';

/** Only direct product pages or recognizable retailer sale pages may be shared. */
export function isCommunitySubmissionUrl(raw:string,type:'product'|'event'){
 const merchant=merchantFor(raw);
 if(!merchant)return false;
 const url=new URL(raw);
 if(!merchant.domains.some(domain=>url.hostname===domain||url.hostname===`www.${domain}`))return false;
 if([...url.searchParams.keys()].some(key=>/^(?:url|uri|dest|destination|redirect|redirect_url|target|next|u)$/i.test(key)))return false;
 if(isDirectRetailerProductUrl(raw))return true;
 if(type==='product')return false;
 return /^\/(?:deals?|sales?|offers?|promotions?|specials?|clearance)(?:\/[^?#]*)?\/?$/i.test(url.pathname);
}
