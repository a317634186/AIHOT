import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { SITE } from '@aihot/industry/site';
import { PriceTagMark } from './Logo';
import { AiShoppingAssistant } from './ai-shopping-assistant';
import '../shopping.css';

/**
 * Editorial pages share the public site chrome: same sticky header, same primary/secondary
 * navigation and the same footer as the deal feeds, so /blog never looks like a separate site.
 */
function SiteNav({ path }: { path: string }) {
  const links: [string, string][] = [['/', 'Top Picks'], ['/categories', 'Categories'], ['/stores', 'Stores'], ['/community', 'Community'], ['/reviews', 'Buying Guides']];
  const guideSection = path.startsWith('/blog') || path === '/reviews' || path === '/news' || path.startsWith('/best');
  const isActive = (url: string) => url === '/' ? path === '/' : url === '/categories' ? path.startsWith('/deals/') || path === '/categories' : url === '/stores' ? path.startsWith('/stores') : url === '/community' ? path.startsWith('/community') : url === '/reviews' ? path === '/reviews' || path === '/news' : false;
  return <>
    <nav className="db-primary-nav" aria-label="Main navigation">
      {links.map(([url, label]) => <Link key={url} to={url} prefetch="intent" aria-current={isActive(url) ? 'page' : undefined}><span>{label}</span></Link>)}
    </nav>
    {guideSection && <nav className="db-secondary-nav db-secondary-mobile" aria-label="Guide topics">
      {[['/best', 'Best Deals'], ['/reviews', 'Reviews & Buying Guides'], ['/news', 'Shopping News']].map(([url, label]) => <Link key={url} to={url!} prefetch="intent" aria-current={isActive(url!) ? 'page' : undefined}>{label}</Link>)}
    </nav>}
  </>;
}

export function BlogShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <div className="db-site">
    <header className="db-header">
      <Link to="/" prefetch="intent" className="db-logo"><PriceTagMark className="db-logo-mark"/> {SITE.name}</Link>
      <span className="db-tagline">{SITE.tagline}</span>
      <form className="db-desktop-search" action="/" method="get" role="search">
        <input type="search" name="q" aria-label="Search deals, products and stores" placeholder="Search deals, products, stores…"/>
        <button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></button>
      </form>
      <form className="db-mobile-search" action="/" method="get" role="search">
        <input name="q" aria-label="Search deals, products, and stores" placeholder="Search deals..."/>
        <button aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></button>
      </form>
      <Link to="/saved" prefetch="intent" className="db-header-saved" aria-label="Saved deals"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z"/></svg><span>Saved</span></Link>
      <AiShoppingAssistant/>
      <Link to="/about" prefetch="intent">How we work</Link>
    </header>
    <SiteNav path={pathname}/>
    <main className="db-main blog-main">{children}</main>
    <footer className="db-footer">
      <div><strong>{SITE.name}</strong><p>{SITE.tagline}</p></div>
      <div>
        {[['/', 'Top Picks'], ['/best', 'Buying Guides'], ['/blog', 'Shopping Playbooks'], ['/categories', 'Categories'], ['/stores', 'Stores'], ['/coupons', 'Coupons'], ['/black-friday', 'Black Friday'], ['/compare', 'Model Comparisons'], ['/community', 'Community'], ['/about', 'About'], ['/agent', 'RSS & API']].map(([to, label]) => <Link key={to} to={to!}>{label}</Link>)}
      </div>
      <p>Prices in USD before tax and shipping. You buy from the retailer, not from Savlume.<br/>Savlume is reader-supported. When you buy through links on our site, we may earn an affiliate commission.</p>
    </footer>
  </div>;
}
