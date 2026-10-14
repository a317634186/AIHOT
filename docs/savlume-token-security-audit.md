# Savlume credential security audit — 2026-10-13

The checked public site, client assets and source history did not contain the configured model key. The audit found opportunities to reduce credential exposure inside the server and strengthen the handling of third-party diagnostics. Changes are deployed to the web, API and worker, and to the host Nginx configuration.

## Scope and evidence

- Exact configured credential values were compared in memory; no credential value was printed or stored in the report.
- Initial repository and client-build scan: matches only in the private `.env`; file mode was 600. No private environment file was tracked by Git. All 27 available Git commits were checked with no matches.
- Before deployment, the web container inherited the model API key, administrator password, session/ image-proxy secrets and database credentials via the shared Compose configuration. Those values were not found in its public browser bundle.
- Recent 72-hour web/API/worker Docker logs, host Nginx logs and shell history contained no matches.
- Database checks covered 13,963 receipts, 13,982 receipt attempts, 6,016 job runs, 1,829 publications and 1,495 shopping-offer records at the snapshot. None contained the configured credentials in the checked response/error/content fields.
- After the final deployment, the web container has only public routing/runtime variables, no secret environment variables, no `.env` in the image and no shared application-data mount.
- Live scan: 576 source files and 34 client assets passed. Public home/section pages, all-item APIs, RSS, llms.txt and health returned expected responses with no credential matches. Private environment, Git, source, credential, backup and source-map paths returned 404; unauthenticated model administration returned 401. See [redacted scan output](audits/token-public-scan-20261013.json).

## Changes

1. **Frontend credential isolation.** The web service now uses an explicit environment allowlist, clears inherited `env_file` and shared volumes, and accesses the backend through HTTP.
2. **Shared redaction.** Known configured credentials, URL-encoded/JSON-escaped forms, Bearer strings, common secret fields, URL passwords and sensitive query parameters are removed from error text and nested diagnostic objects. Usage counts and ordinary product facts remain usable.
3. **Receipts and errors.** Provider error objects, request summaries, response records, usage metadata and request IDs are sanitized before storage or reuse. API logging and worker console output apply the same redaction. Unexpected administrator errors return a generic message with a request ID. Problem-response details are sanitized centrally.
4. **Outbound requests.** Model chat, embeddings and discovery requests reject redirects. The guarded collector fetch refuses cross-origin redirects when authentication headers or posted bodies are present, preventing forwarding credentials to another origin.
5. **Static paths and reverse proxy.** The web static-file boundary now checks the directory separator, preventing encoded paths from accessing a similarly named sibling directory. Nginx blocks private/source/backup paths and source maps; access logs omit queries, cookies, authorization and referrers. Security headers include nosniff, a referrer policy and same-origin framing.
6. **Future checks.** Credential-group `.env` files, TLS private keys and backup material are excluded from Git and Docker builds. `npm run audit:secrets -- --base https://savlume.com` performs a repeatable read-only check and reports only credential names, matching paths and HTTP status codes.

## Validation

Typecheck, production web and Docker builds passed. **18/18 web tests** passed, including the encoded-path boundary regression. **15/15 focused backend tests** passed (eight security checks plus existing receipt-budget/recovery checks). They exercise echoed keys, nested/encoded values, request/response persistence, error responses, console/crash diagnostics and both model/collector redirects using synthetic credentials and local HTTP servers only. An additional model-input test confirms a configured credential accidentally present in article/prompt text is removed before sending.

Full isolated backend suite before the final prompt-input guard: **218/221 passed**. The final eight-security-test/receipt suite passed **15/15**, and eight default-model, recommendation and review checks passed after that guard. The existing analyze-shutdown fixture, X recovery and WeChat recovery failures remain; the full suite is not claimed green. Test databases were migrated before use and dropped afterward. Live worker receipts showed 37 completed model operations in the checked five-minute window after deployment. Standard public, shopping and SEO smoke checks passed against the deployed site. The SEO script now computes an out-of-range offset from the actual feed total, since the growing feed exceeded its old fixed invalid-offset fixture.

## Limits and handling of chat credentials

This is a scoped source/deployment audit, not proof that every historical copy or external system is clear. Server/Docker administrators can access backend credentials, and the configured model gateway receives its key for authentication. The audit does not establish that gateway's storage or training policy. Existing chat messages, external account data and provider logs cannot be erased by changing website code.

The model key is used in the authorization header. Article-generation system/user messages are sanitized before sending, including when a key accidentally appears in input text. Since the current key was previously pasted into a chat, rotating/revoking it through the provider is recommended; configure the replacement privately on the server. Rotation requires the provider account and was not performed as part of this audit.

[OpenAI official data controls](https://developers.openai.com/api/docs/guides/your-data) state that OpenAI API data is not used for model training by default, unless sharing is explicitly opted into, while retention controls are separate. This does not establish the settings of the current chat platform or the policy of a third-party compatible gateway.

Implementation references: [Docker Compose service environment controls](https://docs.docker.com/reference/compose-file/services/), [Fastify logging and redaction](https://fastify.dev/docs/latest/Reference/Logging/), [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

The host-origin access-log probe used a synthetic query credential and confirmed a successful response with no query credential in the new access-log entry. Private Nginx configuration was backed up with mode 600; `nginx -t` passed before reload. A final public scan and smoke check passed after the last API/worker/web deployment.
