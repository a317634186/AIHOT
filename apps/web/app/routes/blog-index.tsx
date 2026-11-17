import { Link, data as routeData, useLoaderData } from 'react-router';
import { BLOG_POSTS_BY_DATE } from '@aihot/industry/blog';
import { blogArticle, blogReadMinutes } from '../lib/blog-content';
import { BlogShell } from '../components/blog-shell';
import { apiGet } from '../lib/api.server';
import { breadcrumbLd, pageMeta, siteUrl } from '../lib/seo';
import type { Route } from './+types/blog-index';

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(value));

interface TopicCover { slug: string; coverImages?: string[] }

export async function loader({ request }: Route.LoaderArgs) {
  const topics = await apiGet<{ items: TopicCover[] }>('/api/best-topics', { signal: request.signal })
    .then(result => result.items ?? [])
    .catch(() => []);
  const coverBySlug = new Map(topics.map(topic => [topic.slug, topic.coverImages ?? []]));
  const covers: Record<string, string[]> = {};
  for (const post of BLOG_POSTS_BY_DATE) {
    covers[post.slug] = [...new Set(post.relatedBest.flatMap(slug => coverBySlug.get(slug) ?? []))].slice(0, 3);
  }
  return routeData({ covers }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' } });
}

export function meta(_: Route.MetaArgs) {
  const base = siteUrl();
  return pageMeta({
    title: 'Savlume Shopping Playbooks & Consumer Guides',
    description: 'Practical, data-grounded guides to Black Friday pricing, retailer memberships, power tools, air fryers, coupon stacking and holiday shopping.',
    path: '/blog',
    type: 'website',
    jsonLd: [
      breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Buying Guides', path: '/best' }, { name: 'Shopping Playbooks', path: '/blog' }]),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `${base}/blog#webpage`,
        url: `${base}/blog`,
        name: 'Savlume Shopping Playbooks & Consumer Guides',
        description: 'Long-form consumer guides for smarter US shopping decisions.',
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: BLOG_POSTS_BY_DATE.map((post, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: post.title,
            url: `${base}/blog/${post.slug}`,
          })),
        },
      },
    ],
  });
}

export default function BlogIndex() {
  const { covers } = useLoaderData<typeof loader>();
  return <BlogShell>
    <nav className="db-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span> / </span><Link to="/best">Buying Guides</Link><span> / </span><span>Shopping Playbooks</span></nav>
    <header className="db-blog-index-head">
      <p className="db-eyebrow">SAVLUME EDITORIAL</p>
      <h1>In-Depth Shopping Playbooks &amp; Guides</h1>
      <p>Long-form, practical consumer guides for checking prices, timing seasonal purchases, comparing retailer memberships, and avoiding checkout traps.</p>
      <div className="db-best-hub-tabs" aria-label="Buying guide views">
        <Link to="/best#product-picks">Product Picks</Link>
        <Link to="/blog" className="active" aria-current="page">Shopping Playbooks</Link>
      </div>
    </header>
    <section className="db-blog-grid" aria-label="Shopping playbooks">
      {BLOG_POSTS_BY_DATE.map(post => {
        // Product shots from the guides this playbook links to, so the index is not a wall of text.
        const cover = covers[post.slug] ?? [];
        return <article key={post.slug} className="db-blog-card">
          {cover.length > 0
            ? <Link className="db-blog-cover" to={`/blog/${post.slug}`} aria-hidden="true" tabIndex={-1}>{cover.map((src, index) => <img key={src} src={src} alt="" width={120} height={120} loading="lazy" decoding="async" referrerPolicy="no-referrer" data-count={cover.length} className={index === 0 ? 'db-blog-cover-main' : undefined} onError={e => { e.currentTarget.style.display = 'none'; }} />)}</Link>
            : <Link className="db-blog-cover db-blog-cover-text" to={`/blog/${post.slug}`} aria-hidden="true" tabIndex={-1}><span>{post.category}</span></Link>}
          <div className="db-blog-card-top">
            <span className="db-blog-badge">{post.category}</span>
            <span>{blogReadMinutes(blogArticle(post.slug)!)} min read</span>
          </div>
          <h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>
          <p>{post.excerpt}</p>
          <div className="db-blog-card-meta">
            <time dateTime={post.published}>{dateLabel(post.published)}</time>
            <Link to={`/blog/${post.slug}`} aria-label={`Read ${post.shortTitle}`}>Read guide →</Link>
          </div>
        </article>;
      })}
    </section>
  </BlogShell>;
}
