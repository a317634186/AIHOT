# Reviews & Picks, sources, video and slogan delivery

Date: October 11, 2026. Live channel: https://savlume.com/reviews
Slogan: **AI Picks. Better Deals.**

## Reader-facing changes

- Added **Reviews & Picks** immediately after News in the top navigation. Bottom navigation still has exactly AI Picks / Flash Deals / News. Category selection keeps its latest rule: choosing a category returns to AI Picks for that category.
- Review articles appear in the full AI Picks feed and in Reviews & Picks. Product reviews, ownership/usage reports and buying guides are separate from live product activities; ordinary sale roundups or generic sports-streaming/settings tutorials are not reviews.
- Source-attributed summaries contain the original author's verdict, intended use, supported strengths, drawbacks and testing context when provided. Up to three useful questions/answers are derived from the available source facts. No ratings, reviews, hands-on testing, personal ownership, consensus or popularity numbers are invented.
- Labels distinguish Media review, User experience, Buying guide, AI-assisted pick and Video review. All extracted review insights have `basis=source_text`. AI summaries are not presented as independent Savlume experiments.
- Review cards have a reading action rather than a missing-purchase warning. Product/merchant links are retained when actually observed; the original article remains available.
- Recognized YouTube/Vimeo videos must appear in the original article's links/embeds. Model-selected observed IDs are allowed; a single embedded video in the main article can also be linked as the source article's video. Arbitrary new or lookalike-host URLs are rejected. Videos open on the original service; no autoplay, mirrored upload or third-party player is injected.
- Live example with the original video link: [COROS Pace 4 Pro source review summary](https://savlume.com/items/kcfi0bnppuwcwz3hxnam0gv06). The page clearly states that its summary uses source text, not unseen video frames or an independently obtained transcript.
- The exact requested slogan is used by SITE.tagline, the header/footer, About page and site sharing image. The About page now reads the central tagline. Share-image metadata includes a brand-version query and the origin returns no-store, avoiding Cloudflare's cached previous slogan for new shares.

## Source expansion

Six verified RSS sources were added, on top of the five existing deal/recall feeds. New feeds poll every four hours and use a bounded three-item initial import. Only original summaries and source links are published; source full-text redistribution remains disabled.

| Source / role | Endpoint | Validation and activation |
| --- | --- | --- |
| The Gadgeteer / independent gadget writers | https://the-gadgeteer.com/feed/ | 25 entries, representative readable article; enabled, 3 initial records |
| DC Rainmaker / independent product testing and experiences | https://www.dcrainmaker.com/feed/ | 8 entries, representative readable article and observed lazy-loaded YouTube embed; enabled, 3 initial records |
| SoundGuys / specialist audio reviews and recommendations | https://www.soundguys.com/feed/ | 10 entries, readable buying guide; enabled, 3 initial records |
| Tom’s Guide / product advice | https://www.tomsguide.com/feeds.xml | 50 entries, readable samples; enabled, 3 initial records, editorial filtering rejects off-topic material |
| TechRadar Reviews / media product reviews | https://www.techradar.com/feeds/articletype/review | 50 entries, readable Ninja appliance review; enabled, 3 initial records |
| TechRadar Buying Guides / recommendation articles | https://www.techradar.com/feeds/articletype/best | 50 entries, readable guide; enabled, 3 initial records; older evergreen guides keep their actual dates |
| Ben’s Bargains / additional deal discovery | https://bensbargains.com/ | Homepage and a specific bargain page readable; added to AI discovery allowlist, not represented as a working RSS subscription |
| Digital Trends / review discovery candidate | https://www.digitaltrends.com/ | Added as a named AI-search candidate; every cited page still must be fetched and pass processing before publication |
| Futurepedia / AI/software discovery candidate | https://www.futurepedia.io/ | Allowlisted discovery candidate only; directory entries are not proof of hands-on testing or product quality |
| RTINGS | https://www.rtings.com/latest-rss.xml | Feed returned 30 entries, but sample detail extraction returned no usable body; not enabled |
| Android Authority | https://www.androidauthority.com/ | 403 challenge in this server check; not enabled or bypassed |
| Serious Eats | https://www.seriouseats.com/ | HTTP 402 in this server check; not enabled or bypassed |

Evidence: [source-page and feed audit](audits/reviews-sources-20261011.json). TechRadar's feeds exceeded the initial 4 MB audit bound but succeeded under the repository RSS reader's existing 8 MB limit. This was a parser-size adjustment in the audit, not bypassing access restrictions.

## Existing model gateway and search

- Reused the user's configured compatible gateway credentials. Gemini handles existing editorial writing and review discovery; GPT (`gpt-6-luna`, the configured gateway model ID) performs existing screening/structured extraction including review fields. No extra model subscription or new secret was required.
- Added `shopping.review-discover` every six hours, separate from the existing three-hour deal discovery. Queries target actual product reviews, usage accounts, comparisons, original videos and recommendations from named sources.
- A search must return a completed `web_search_call` plus actual citations. Cited pages are fetched, redirects must stay within the configured source set, generic homepages are skipped, and paywalled-only evidence or unavailable pages are not treated as successful research. Source text is untrusted.
- All calls use the existing paid-request receipts and budgets. Search fallback is limited to an unsupported search response or a completed answer without search evidence; budget/unknown-outcome/timeouts are not bypassed.
- Gemini validation receipt **2179** returned a completed search and 23 cited URLs; the bounded run processed/imported 8 readable source candidates. Import counts mean upsert/queue operations, not necessarily eight unique new published articles.
- GPT search validation receipt **2180** completed but returned reasoning/message output without a completed web search. Its answer was **not** accepted as search evidence. The fallback run reused the completed Gemini search receipt and succeeded. An overlapping initial diagnostic encountered the in-flight receipt guard; it did not duplicate that paid search.
- There is no separate direct Google/Bing search API key or public internet index configured. “Search enabled” refers to the verified gateway Gemini tool plus publisher feeds, not an invented Google/Bing integration.

Optional configuration: `SHOPPING_REVIEW_SEARCH_MODEL` and `SHOPPING_REVIEW_FALLBACK_MODEL`; defaults are Gemini and the existing GPT model respectively. Manual bounded discovery: `docker compose exec -T worker node scripts/discover-shopping.ts --reviews`.

## SEO/GEO integration

Reviews have their own title, description, canonical listing and sitemap entry. They inherit actual Article/CollectionPage/Breadcrumb metadata, source citations, publication/update timestamps and related links. Source questions and video links are also included in the canonical-linked Markdown representation. `/api/v1/items?mode=reviews`, `/feed/reviews.xml` and the MCP get_reviews tool expose the same public channel. llms.txt links to it.

No fabricated Review ratings, VideoObject upload dates, FAQ rich-result claims or AI citation guarantees are added. Existing selection weights/thresholds were not changed; buying-guide evidence examples were adapted so a real review is not penalized simply for lacking a discount price.

## Live content and tests

At the review snapshot, the channel had **16 articles** from eight source identities (including AI-discovered pages) and **one source-video link**, with media reviews, user-experience content and buying guides. Every review was also present in AI Picks. Examples included Garmin/COROS watches, a Ninja appliance, an Asustor NAS, audio recommendations, password-manager comparisons and kids' tablet guides. No placeholder articles were published.

Typecheck and production builds passed; all **17 web tests** and **3 review-specific unit tests** passed. Tests cover source attribution, observed-video URL safety, citation-only search evidence, Review-channel inclusion, exclusion from Flash Deals/News, AI Picks aggregation, withdrawal/privacy, top-only navigation and three bottom tabs. Full backend regression: **207/211**; the existing analyze/translate shutdown fixtures and X/WeChat recovery failures remain.

Live verification checked the channel, bottom tabs, mobile/desktop layout, questions and attribution, the actual original video URL in both HTML and Markdown, the updated slogan PNG, public smoke and SEO smoke (333 sitemap URLs at the snapshot). No ads or third-party videos were clicked during testing. No database migration was required; source configuration, structured JSON fields and normal publication processing are backward-compatible.
