import { Link } from 'react-router';
import { BLOG_POSTS_META } from '@aihot/industry/blog';
import { BlogShell } from '../components/blog-shell';
import { breadcrumbLd, pageMeta, siteUrl } from '../lib/seo';
import type { Route } from './+types/blog-index';

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date(value));

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
          itemListElement: BLOG_POSTS_META.map((post, index) => ({
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
      {BLOG_POSTS_META.map(post => <article key={post.slug} className="db-blog-card">
        <div className="db-blog-card-top">
          <span className="db-blog-badge">{post.category}</span>
          <span>{post.readTimeMinutes} min read</span>
        </div>
        <h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2>
        <p>{post.excerpt}</p>
        <div className="db-blog-card-meta">
          <time dateTime={post.published}>{dateLabel(post.published)}</time>
          <Link to={`/blog/${post.slug}`} aria-label={`Read ${post.shortTitle}`}>Read guide →</Link>
        </div>
      </article>)}
    </section>
  </BlogShell>;
}
