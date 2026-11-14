# Savlume Best Guides

Best topic definitions live in `industry/best-topics.ts`. Each definition controls the category, search phrases, exclusions, and optional USD budget used to select current offers.

`npm run best:generate -- <slug>` generates one configured guide; `npm run best:generate` generates the next topic in the rotation. The worker also checks one topic per day. Every model request uses the shared model capability, budget limits, and receipt lifecycle.

Generation requires at least one current offer and excerpts from at least two distinct allowed review or shopping publishers. Product verdicts must use the matched database product IDs. The model receives article excerpts rather than full article bodies; source URLs and publisher names are attached by the backend. Unpriced fallback products are only accepted when the stored retailer is Amazon, the seller is explicitly Amazon, and the database contains a direct Amazon product URL. They are labeled as having no reported price.

Published guides are stored in `generated_best_topics`. `/best/` lists published guides and configured topics still waiting for enough evidence. Waiting pages are `noindex`; only guides with current eligible products enter the sitemap at `/sitemaps/pages.xml`.
