# Savlume branding and cache

`industry/site.ts` is the single source for the public site name and tagline. The shopping shell uses it in the shared header, footer and About page, and the share image uses it as well.

Public HTML is revalidated by browsers and normally cached for 60 seconds by the host proxy. The service worker only handles push notifications and does not cache pages. Hashed JavaScript and CSS are immutable; a new build gives changed assets new names. The share-image URL includes the site name and tagline so a new slogan gets a new URL.

The host Nginx proxy cache has an explicit namespace in `deploy/savlume.nginx.conf`. When changing the site name, slogan or shared shell, bump the `brand-...` prefix in `proxy_cache_key`, deploy the matching application build, install the updated host configuration, validate with `nginx -t`, and reload Nginx. This makes older proxy entries unreachable without deleting the cache. The namespace applies to all URLs, so the cache warms again after a change. The proxy may still serve stale entries from the same namespace during an upstream failure; that policy supports availability and is separate from the branding version.

Cloudflare currently reports HTML as `DYNAMIC`; if an edge Cache Rule later overrides that behavior, the edge cache must also be purged or versioned when branding changes. Third-party social platforms can retain their own previews independently of these caches.
