import { Link, data as routeData, useLoaderData } from 'react-router';
import { apiGet } from '../lib/api.server';
import { BlogShell } from '../components/blog-shell';
import { blogPostMeta, type BlogPostMeta } from '@aihot/industry/blog';
import { blogArticle, blogWordCount, type BlogArticle, type BlogBlock } from '../lib/blog-content';
import { itemPath } from '@aihot/contracts/shopping';
import { breadcrumbLd, pageMeta, siteUrl } from '../lib/seo';
import type { Route } from './+types/blog-post';

interface BlogDealItem {
  id: string;
  title: string;
  priceDisplay?: { state: string; amountCents: number | null } | null;
  offer: { product?: string | null; merchant?: string | null; imageUrl?: string | null; imageSource?: string | null };
  image?: { src: string; srcSet: string | null; hero: string; sourceUrl: string | null } | null;
}

interface LiveDeal {
  guideSlug: string;
  guideTitle: string;
  item: BlogDealItem;
}

interface BlogPostData {
  post: BlogPostMeta;
  article: BlogArticle;
  liveDeals: LiveDeal[];
  wordCount: number;
}

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(value));
const money = (cents: number | null | undefined) => cents == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export async function loader({ params, request }: Route.LoaderArgs) {
  const post = params.slug ? blogPostMeta(params.slug) : null;
  const article = params.slug ? blogArticle(params.slug) : null;
  if (!post || !article) throw new Response('Not found', { status: 404 });
  const guideSlugs = [...new Set([...post.relatedBest, ...article.blocks.flatMap(block => block.type === 'deals' ? block.guideSlugs : [])])].slice(0, 4);
  const guidePages = await Promise.all(guideSlugs.map(slug => apiGet<{ topic: { shortTitle: string }; items: BlogDealItem[] }>(`/api/best-topics/${encodeURIComponent(slug)}`, { signal: request.signal }).catch(() => null)));
  const seen = new Set<string>();
  const liveDeals: LiveDeal[] = [];
  for (let index = 0; index < guidePages.length; index++) {
    const page = guidePages[index];
    const item = page?.items.find(entry => !seen.has(entry.id) && entry.priceDisplay?.state === 'current' && entry.priceDisplay.amountCents != null);
    if (!page || !item) continue;
    seen.add(item.id);
    liveDeals.push({ guideSlug: guideSlugs[index]!, guideTitle: page.topic.shortTitle, item });
  }
  const wordCount = blogWordCount(article);
  return routeData<BlogPostData>({ post, article, liveDeals, wordCount }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=900' } });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const data = loaderData as BlogPostData | undefined;
  if (!data) return [{ title: 'Shopping Playbook Not Found | Savlume' }, { name: 'robots', content: 'noindex, follow' }];
  const { post, article } = data;
  const base = siteUrl();
  return pageMeta({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    type: 'article',
    image: '/og/site.png',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        '@id': `${base}/blog/${post.slug}#article`,
        headline: post.title,
        description: post.description,
        datePublished: post.published,
        dateModified: post.modified,
        inLanguage: 'en-US',
        articleSection: post.category,
        wordCount: data.wordCount,
        author: { '@type': 'Organization', name: 'Savlume Editorial Team', url: `${base}/about` },
        publisher: { '@type': 'Organization', name: 'Savlume', url: base, logo: { '@type': 'ImageObject', url: `${base}/icon.png` } },
        mainEntityOfPage: `${base}/blog/${post.slug}`,
        image: [`${base}/og/site.png`],
        ...(article.faqs.length ? { about: article.faqs.map(faq => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })) } : {}),
      },
      breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Buying Guides', path: '/best' }, { name: 'Shopping Playbooks', path: '/blog' }, { name: post.shortTitle, path: `/blog/${post.slug}` }]),
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': `${base}/blog/${post.slug}#faq`,
        mainEntity: article.faqs.map(faq => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
      },
    ],
  });
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      return href.startsWith('/')
        ? <Link key={index} to={href}>{label}</Link>
        : <a key={index} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
    }
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <span key={index}>{part}</span>;
  })}</>;
}

function LiveDeals({ deals }: { deals: LiveDeal[] }) {
  if (!deals.length) return null;
  return <section className="db-blog-live-deals" aria-labelledby="db-blog-live-deals-title">
    <div className="db-blog-live-head">
      <div><p className="db-eyebrow">EDITOR'S WATCHLIST</p><h2 id="db-blog-live-deals-title">Worth comparing from our current guides</h2><p>Selected from Savlume’s active product research. Prices and availability can change.</p></div>
      <Link to="/best">All buying guides →</Link>
    </div>
    <div className="db-blog-deal-grid">
      {deals.map(({ guideSlug, guideTitle, item }) => {
        const image = item.image?.src || item.offer.imageUrl || null;
        const price = money(item.priceDisplay?.amountCents);
        return <article className="db-blog-deal" key={item.id}>
          <Link to={itemPath(item)} className="db-blog-deal-image" aria-label={item.title}>
            {image ? <img src={image} alt={item.title} loading="lazy" decoding="async" /> : <span aria-hidden>□</span>}
          </Link>
          <div className="db-blog-deal-body">
            <span className="db-blog-deal-guide">{guideTitle}</span>
            <h3><Link to={itemPath(item)}>{item.offer.product || item.title}</Link></h3>
            <div className="db-blog-deal-bottom">
              {price && <strong>{price}</strong>}
              {item.offer.merchant && <span>{item.offer.merchant}</span>}
              <Link to={itemPath(item)}>View deal ↗</Link>
            </div>
            <Link className="db-blog-deal-link" to={`/best/${guideSlug}`}>Compare the full guide →</Link>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function Block({ block }: { block: BlogBlock }) {
  if (block.type === 'h2') return <h2 id={block.id}>{block.text}</h2>;
  if (block.type === 'h3') return <h3>{block.text}</h3>;
  if (block.type === 'p') return <p><Inline text={block.text} /></p>;
  if (block.type === 'ul') return <ul className="db-blog-list">{block.items.map((item, index) => <li key={index}><Inline text={item} /></li>)}</ul>;
  if (block.type === 'ol') return <ol>{block.items.map((item, index) => <li key={index}><Inline text={item} /></li>)}</ol>;
  if (block.type === 'callout') return <aside className="db-blog-callout"><strong>{block.title}</strong><p><Inline text={block.text} /></p></aside>;
  if (block.type === 'table') return <div className="db-blog-table-wrap"><table><caption>{block.caption}</caption><thead><tr>{block.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} data-label={block.headers[cellIndex]}><Inline text={cell} /></td>)}</tr>)}</tbody></table></div>;
  if (block.type === 'links') return <section className="db-blog-links"><h2>{block.title}</h2><div>{block.links.map(link => link.href.startsWith('/') ? <Link key={link.href} to={link.href}><strong>{link.label}</strong>{link.note && <span>{link.note}</span>}</Link> : <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"><strong>{link.label}</strong>{link.note && <span>{link.note}</span>}</a>)}</div></section>;
  return null;
}

export default function BlogPost() {
  const { post, article, liveDeals, wordCount } = useLoaderData<typeof loader>();
  const headings = article.blocks.filter((block): block is Extract<BlogBlock, { type: 'h2' }> => block.type === 'h2');
  return <BlogShell>
    <article className="db-blog-article">
      <nav className="db-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span> / </span><Link to="/best">Buying Guides</Link><span> / </span><Link to="/blog">Shopping Playbooks</Link><span> / </span><span>{post.shortTitle}</span></nav>
      <header className="db-blog-header">
        <span className="db-blog-badge">{post.category}</span>
        <h1>{post.title}</h1>
        <p className="db-blog-deck">{post.description}</p>
        <div className="db-blog-byline"><span>By Savlume Editorial Team</span><time dateTime={post.published}>Published {dateLabel(post.published)}</time><span>{Math.max(3,Math.round(wordCount/220))} min read</span><span>{wordCount.toLocaleString('en-US')} words</span></div>
      </header>
      {/* One summary box: the verdict reads as its lead, the takeaways follow as a list. */}
      <section className="db-blog-takeaways" aria-labelledby="db-blog-takeaways-title">
        <h2 id="db-blog-takeaways-title">Key Takeaways</h2>
        <p className="db-blog-takeaways-verdict">{article.editorialVerdict}</p>
        <ul className="db-blog-takeaways-list">{article.keyTakeaways.map(item => <li key={item}>{item}</li>)}</ul>
      </section>
      <div className="db-blog-layout">
        {headings.length > 0 && <aside className="db-blog-toc" aria-label="Table of contents"><strong>In this guide</strong><ol>{headings.map(heading => <li key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ol></aside>}
        <div className="db-blog-reading">
          <LiveDeals deals={liveDeals} />
          <div className="db-blog-body">{article.blocks.map((block, index) => <Block key={index} block={block} />)}</div>
          <section className="db-blog-faq" aria-labelledby="db-blog-faq-title"><p className="db-eyebrow">QUICK ANSWERS</p><h2 id="db-blog-faq-title">Frequently asked questions</h2>{article.faqs.map(faq => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>
          <footer className="db-blog-footer-links"><Link to="/blog">All shopping playbooks →</Link><Link to="/best">Browse product buying guides →</Link><Link to="/black-friday">Live Black Friday deals →</Link></footer>
          <p className="db-blog-method">Reporting method: Savlume editors synthesize retailer terms, product positioning, and recorded offer evidence. We do not claim hands-on lab testing unless a guide explicitly says so.</p>
        </div>
      </div>
    </article>
  </BlogShell>;
}
