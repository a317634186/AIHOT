# Savlume deployment

Current site: https://savlume.com
Admin: https://savlume.com/admin

See [v1 delivery and validation](docs/dealbrief-delivery.md), [source verification](docs/dealbrief-sources.md), and [real English examples](docs/dealbrief-examples.md).

Source: https://github.com/a317634186/AIHOT — initial commit a2fb7cb.
Working directory: /root/apps/aihot.

The private .env contains API credentials and ADMIN_PASSWORD, mode 600, ignored by Git and Docker.
The supplied key was added to CLIProxyAPI's api-keys with explicit user authorization; the two original keys were retained. Backup: /home/docker/CLIProxyAPI/backups/config.before-aihot-20261011T043655Z.yaml.

Two live models: gemini-3.8-flash-high and gpt-6-luna through https://cli.t360.nyc.mn/v1.
Gemini web search is enabled through the gateway Responses endpoint. No separate search key required.

Run:

```bash
cd /root/apps/aihot
docker compose ps
docker compose logs --tail 100 api worker web
docker compose build api
docker compose up -d
node scripts/smoke-shopping.ts http://161.33.0.74:3000
```

The old AI examples were backed up and withdrawn, not deleted. A pre-conversion database backup is in .data/backups/pre-dealbrief-20261011.sql.gz. Do not use docker compose down -v.

## Production domain and HTTPS

- `savlume.com` and `www.savlume.com` resolve to `161.33.0.74`. Main address: `https://savlume.com`; HTTP and www redirect with 308, preserving paths and queries.
- Host Nginx (existing port 80/443 owner) uses `/www/server/panel/vhost/nginx/savlume.com.conf`; the maintained copy is `deploy/savlume.nginx.conf`. Other virtual hosts are unchanged. Do not start the optional Compose Caddy HTTPS profile on this server.
- `.env`: `SITE_URL=https://savlume.com`, `SITE_DOMAIN=savlume.com`, `TRUST_PROXY=true`. The deployment override binds web to `127.0.0.1:3000`; users should use the domain instead of the old public IP:3000 address. Nginx overwrites forwarded client headers.
- Certificate: Let's Encrypt, both names covered; initial validity ends January 9, 2027. acme.sh uses HTTP-01 webroot `/www/wwwroot/savlume.com`; the daily existing root cron renews it and installs the key/full chain under `/www/server/panel/vhost/cert/savlume.com/`, then validates and reloads Nginx. Renewal configuration remains in `/root/.acme.sh/savlume.com_ecc/`; private material is not in Git.
- DNS authority and public resolvers were checked. TLS verification, all HTTP/www redirects, mobile navigation/infinite scroll, site/RSS/API/MCP smoke checks and an HTTPS admin login with Secure/HttpOnly session cookie passed. The verification session was logged out.
- Private pre-change backups are under `.data/backups/savlume-domain-*/` (including the old environment and deployment override). No application database migration was required.

After editing the vhost copy:

```bash
cp deploy/savlume.nginx.conf /www/server/panel/vhost/nginx/savlume.com.conf
/www/server/nginx/sbin/nginx -t && /www/server/nginx/sbin/nginx -s reload
node scripts/smoke.ts --base https://savlume.com
```

SEO configuration, keyword map and Search Console submission steps: [docs/savlume-seo.md](docs/savlume-seo.md). Sitemap: https://savlume.com/sitemap.xml. Validate with `node scripts/smoke-shopping-seo.ts https://savlume.com`.

Latest comprehensive audit: [SEO/GEO findings](docs/savlume-seo-geo-audit.md). Validate text/AI-reading channels with `node scripts/smoke-shopping-geo.ts https://savlume.com`. The host Nginx vhost now includes `/www/server/panel/vhost/nginx/savlume-cloudflare-realip.inc`, maintained from `deploy/cloudflare-realip.conf`. Install that include before reloading the vhost on a replacement server.
