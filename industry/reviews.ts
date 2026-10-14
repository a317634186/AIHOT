// Discovery allowlist: named public media/independent sites, not arbitrary search-result hosts.
export const REVIEW_SOURCES=[
 {id:'gadgeteer',name:'The Gadgeteer',domain:'the-gadgeteer.com',type:'independent'},
 {id:'dcrainmaker',name:'DC Rainmaker',domain:'dcrainmaker.com',type:'independent'},
 {id:'soundguys',name:'SoundGuys',domain:'soundguys.com',type:'media'},
 {id:'tomsguide',name:'Tom’s Guide',domain:'tomsguide.com',type:'media'},
 {id:'techradar',name:'TechRadar',domain:'techradar.com',type:'media'},
 {id:'digitaltrends',name:'Digital Trends',domain:'digitaltrends.com',type:'media'},
 {id:'futurepedia',name:'Futurepedia',domain:'futurepedia.io',type:'directory'},
] as const;
export function reviewSourceFor(url:string){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return null;return REVIEW_SOURCES.find(s=>u.hostname===s.domain||u.hostname.endsWith('.'+s.domain))??null;}catch{return null;}}
