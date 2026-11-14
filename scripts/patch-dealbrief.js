import fs from 'fs';

let code = fs.readFileSync('apps/web/app/routes/dealbrief.tsx', 'utf8');

// 1. JSON-LD Breadcrumbs
code = code.replace(
  "jsonLd:[breadcrumbLd([{name:'Home',path:'/'},{name:'Best Deals',path:'/best'},{name:topic.shortTitle,path}])",
  "jsonLd:[breadcrumbLd([{name:'Home',path:'/'},{name:'Buying Guides',path:'/reviews'},{name:'Best Deals',path:'/best'},{name:topic.shortTitle,path}])"
);
code = code.replace(
  "jsonLd:breadcrumbLd([{name:'Home',path:'/'},{name:'Best Deals',path:'/best'},{name:topic.shortTitle,path}])",
  "jsonLd:breadcrumbLd([{name:'Home',path:'/'},{name:'Buying Guides',path:'/reviews'},{name:'Best Deals',path:'/best'},{name:topic.shortTitle,path}])"
);
code = code.replace(
  "jsonLd:[breadcrumbLd([{name:'Home',path:'/'},{name:'Best Deals',path}])",
  "jsonLd:[breadcrumbLd([{name:'Home',path:'/'},{name:'Buying Guides',path:'/reviews'},{name:'Best Deals',path}])"
);

// 2. PrimaryNavigation
const oldNav = `function PrimaryNavigation({path}:{path:string}){
 const links=[['/','AI Best Picks'],['/categories','Categories'],['/stores','Stores'],['/community','Community'],['/reviews','Buying Guides']];
 const active=(url:string)=>path===url||url==='/categories'&&path.startsWith('/deals/')||url==='/stores'&&path.startsWith('/stores/')||url==='/community'&&path.startsWith('/community/')||url==='/reviews'&&path==='/news';
 const guideSection=path==='/reviews'||path==='/news';
 return <><nav className="db-primary-nav" aria-label="Main navigation">{links.map(([url,label])=><Link key={url} to={url!} prefetch="intent" aria-current={active(url!)?'page':undefined}>{label}</Link>)}</nav>{guideSection&&<nav className="db-secondary-nav db-secondary-mobile" aria-label="Guide topics"><Link to="/reviews" aria-current={path==='/reviews'?'page':undefined}>Reviews & Buying Guides</Link><Link to="/news" aria-current={path==='/news'?'page':undefined}>Shopping News</Link></nav>}<MobileSearchPlaceholder/></>;
}`;

const newNav = `function PrimaryNavigation({path}:{path:string}){
 const links=[['/','AI Best Picks'],['/categories','Categories'],['/stores','Stores'],['/community','Community'],['/reviews','Buying Guides']];
 const guideSection=path==='/reviews'||path==='/news'||path==='/best'||path.startsWith('/best/');
 const active=(url:string)=>path===url||url==='/categories'&&path.startsWith('/deals/')||url==='/stores'&&path.startsWith('/stores/')||url==='/community'&&path.startsWith('/community/')||url==='/reviews'&&guideSection;
 return <><nav className="db-primary-nav" aria-label="Main navigation">{links.map(([url,label])=><Link key={url} to={url!} prefetch="intent" aria-current={active(url!)?'page':undefined}>{label}</Link>)}</nav>{guideSection&&<nav className="db-secondary-nav db-secondary-mobile" aria-label="Guide topics"><Link to="/best" aria-current={path==='/best'||path.startsWith('/best/')?'page':undefined}>Best Deals</Link><Link to="/reviews" aria-current={path==='/reviews'?'page':undefined}>Reviews & Buying Guides</Link><Link to="/news" aria-current={path==='/news'?'page':undefined}>Shopping News</Link></nav>}<MobileSearchPlaceholder/></>;
}`;

if (!code.includes(oldNav)) {
  console.error('Could not find oldNav');
} else {
  code = code.replace(oldNav, newNav);
}

// 3. BestTopicIndex breadcrumb
code = code.replace(
  '<nav className="db-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span> / </span><span>Best Deals</span></nav>',
  '<nav className="db-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span> / </span><Link to="/reviews">Buying Guides</Link><span> / </span><span>Best Deals</span></nav>'
);

// 4. BestTopicGuide
const guideStart = 'function BestTopicGuide({topic,items,topics,now}:{topic:GeneratedBestTopic;items:Item[];topics:BestTopicSummary[];now:number}){';
const guideEnd = 'function amazonTopicSearch(topic:BestTopicDefinition){';

const startIdx = code.indexOf(guideStart);
const endIdx = code.indexOf(guideEnd);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find guide bounds', { startIdx, endIdx });
} else {
  const newGuideBlock = `function BestTopicGuide({topic,items,topics,now}:{topic:GeneratedBestTopic;items:Item[];topics:BestTopicSummary[];now:number}){
 const related=(topic.relatedSlugs??[]).flatMap(slug=>{const entry=topics.find(candidate=>candidate.slug===slug);return entry?[entry]:[];});
 const updated=new Intl.DateTimeFormat('en-US',{timeZone:SHOPPING.timeZone,month:'short',year:'numeric'}).format(new Date(topic.lastGeneratedAt));
 const cleanSources=(topic.sources||[]).filter(s=>!/(dealnews|slickdeals|bensbargains|moneysavingmom|hip2save)/i.test(s.url));
 return <article className="db-best-guide">
  <nav className="db-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span> / </span><Link to="/reviews">Buying Guides</Link><span> / </span><Link to="/best">Best Deals</Link><span> / </span><span>{topic.shortTitle}</span></nav>
  <h1>{topic.h1}</h1>
  <p className="db-best-updated">Updated {updated} · {items.length} current offers · {items.filter(item=>item.offer.status==='Active').length} retailer-verified</p>
  <section className="db-best-consensus">
   <p className="db-eyebrow">MARKET CONSENSUS NOTE</p>
   <p>{topic.marketConsensusSummary}</p>
   <p className="db-best-disclosure">Editorial synthesis of cited review coverage and current retail offers; Savlume does not claim hands-on testing.</p>
   {cleanSources.length>0&&<ul>{cleanSources.map(source=><li key={source.articleId}><a href={source.url} target="_blank" rel="nofollow noopener noreferrer">{source.name}: {source.title}</a></li>)}</ul>}
  </section>
  <section className="db-best-products">
   <h2>Current offers</h2>
   <div className="db-grid">
    {items.map((item,index)=>{
     const directUrl=item.offer.buyUrl&&isDirectRetailerUrl(item.offer.buyUrl)?(item.offer.merchantId==='amazon'?(affiliateLink(item.offer.buyUrl)||item.offer.buyUrl):item.offer.buyUrl):('https://www.amazon.com/s?k='+encodeURIComponent([item.offer.brand,item.offer.product,item.offer.model].filter(Boolean).join(' '))+'&tag='+(process.env.NEXT_PUBLIC_AMAZON_AFFILIATE_TAG||'savlume-20'));
     const merchantLabel=item.offer.merchant||'Amazon';
     return <div className="db-best-product" key={item.id}>
      <Card item={item} priority={index<4} now={now}/>
      {topic.productVerdicts[item.id]&&<aside className="db-best-verdict">
       <div className="db-best-verdict-top">
        <span className="db-best-price-status">{item.offer.status==='Active'?'Retailer verified':'Source reported'}</span>
        <a className="db-best-amazon-link" href={directUrl} target="_blank" rel="nofollow sponsored noopener noreferrer">View on {merchantLabel} ↗</a>
       </div>
       <strong>Editor’s Verdict</strong>
       <p className="why-buy">✓ Why Buy: {topic.productVerdicts[item.id]!.whyBuy}</p>
       <p className="trade-off">⚠ Trade-off: {topic.productVerdicts[item.id]!.tradeOff}</p>
       {topic.productVerdicts[item.id]!.mediaConsensus&&<p className="media-consensus">📰 Review Consensus: {topic.productVerdicts[item.id]!.mediaConsensus}</p>}
      </aside>}
     </div>;
    })}
   </div>
  </section>
  <section className="db-best-tips">
   <h2>Buying tips</h2>
   <div>{topic.buyingTips.map((tip,index)=><article key={index}><span>{index+1}</span><p>{tip}</p></article>)}</div>
  </section>
  <section className="db-best-faq">
   <h2>Questions shoppers ask</h2>
   {topic.faqs.map(faq=><details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}
  </section>
  {related.length>0&&<nav className="db-best-related" aria-label="Related buying guides">
   <h2>Related guides</h2>
   {related.map(entry=><Link key={entry.slug} to={'/best/'+entry.slug}>{entry.shortTitle} →</Link>)}
  </nav>}
 </article>;
}
`;
  code = code.slice(0, startIdx) + newGuideBlock + code.slice(endIdx);
}

// 5. BestTopicPending breadcrumb
code = code.replace(
  'function BestTopicPending({topic}:{topic:BestTopicDefinition}){return <section className="db-best-pending"><nav className="db-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span> / </span><Link to="/best">Best Deals</Link><span> / </span><span>{topic.shortTitle}</span></nav>',
  'function BestTopicPending({topic}:{topic:BestTopicDefinition}){return <section className="db-best-pending"><nav className="db-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span> / </span><Link to="/reviews">Buying Guides</Link><span> / </span><Link to="/best">Best Deals</Link><span> / </span><span>{topic.shortTitle}</span></nav>'
);

fs.writeFileSync('apps/web/app/routes/dealbrief.tsx', code);
console.log('dealbrief.tsx successfully patched');
