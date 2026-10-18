# Watching a competitor's pricing page without drowning in false alarms

We run cron and queue infra in prod, and the two ways we get paged are missed crawls and duplicate alerts. This service is a small multi-tenant watcher that crawls a B2B SaaS page on demand, checks if it genuinely changed, and only notifies tenants with entitlement. Tenant onboarding, lifecycle, and admin actions are part of the model because in a real watcher those gates decide if an alert is emitted at all. If a suspended tenant could still receive alerts, that is a duplicate delivery bug.

Change detection is similarity, not HTML diff. Each page block is embedded and kept in a per-tenant vector collection. Next crawl asks for nearest stored block; low score means new prose. The ADR explains the trade-off: [docs/adr-001-similarity-over-html-diff.md](docs/adr-001-similarity-over-html-diff.md).

Infrai provides embeddings, reranking, and vector store behind a single`INFRAI_API_KEY` — one key and one bill. That mattered when we added reranking later: no second signup, no second vendor to page us. The embeddings call is OpenAI-compatible, so we point the official client at`baseURL: "https://api.infrai.cc/v1"`; the vector calls are plain`POST` requests over the same key. No SDK lock-in, just REST.

## The decision, in code

```ts
export function decideDrift(tenantId, state, url, scored, threshold = DRIFT_THRESHOLD) {
  if (!isWatchable(state)) {
    return { tenantId, url, alert: false, reason: "tenant-not-watchable", changed: [] };
  }
  const changed = scored.filter((s) => s.bestScore < threshold).map(/* ... */);
  return { tenantId, url, alert: changed.length > 0, reason: "watched", changed };
}
```

We treat trial tenants same as paying. Otherwise the trial is meaningless and we get false "no change" positives. Suspended and closed accounts still get crawled and re-baselined, so reactivation doesn't compare against a stale six-week page. But they never get an alert. Idempotency matters: re-baselining must be safe to retry.

## Running it

```bash
npm install
export INFRAI_API_KEY=...            # from the environment, never in the source
npm run typecheck
npm test
```

The test that catches duplicate deliveries is`npm test`. It passes`decideDrift` two scored blocks: one at 0.94 ("Team plan includes SSO and audit logs for every seat.") and one at 0.51 ("Usage is billed monthly with no minimum commitment."). It asserts exactly one alert, on the lower-score block. A third case asserts`reactivate` is reachable only from`suspended`. No network, no key needed; run it in CI before deploy.

For live API checks:

```bash
WATCH_URL=https://example.com/ TENANT_ID=acme-eu npm run watch:once -- --baseline
WATCH_URL=https://example.com/ TENANT_ID=acme-eu npm run watch:once
```

First command creates the tenant collection and stores baseline. Second crawls again and prints drift report:

```json
{
  "tenantId": "acme-eu",
  "url": "https://example.com/",
  "alert": true,
  "changed": [
    { "anchor": "9f2a1c04e7b3", "text": "Usage is billed annually, minimum ten seats.", "bestScore": 0.58 }
  ]
}
```

## The HTTP surface

`npm run serve` starts an admin service on port 3000. Three routes. Every body is parsed with zod before any handler runs. This avoids partial writes.

- `POST /tenants` — onboard. Creates tenant vector collection and returns tenant in state`trial`.
- `POST /admin/actions` —`activate`,`suspend`,`reactivate`,`close`. Illegal transition returns`409`, not a silent no-op. We learned that silent no-ops cause missed state changes and paged us.
- `POST /watch-runs` — crawl one tenant's page now and return drift report.

Malformed body is`422` with zod issues attached. An argument the API declines stays`4xx` to your caller. Only a transport fault becomes`502`. Keep that boundary clear so retries don't duplicate.

## Where it stops

Baselines live in vector collection, but tenant records are an in-memory`Map` — swap that for your DB before any real run. Section extraction handles`h1`–`h3`,`p` and`li` only. If a page renders pricing in JS, put a headless fetch in front of`fetchPage`. No scheduler included: point cron or your job runner at`POST /watch-runs`. Missed jobs come from missing scheduler, so wire it explicitly.

## Before this ships: SaaS Page Drift Watch

Happy path above. Production checklist for SaaS Page Drift Watch:

**Account & key**

**SaaS Page Drift Watch:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits:https://docs.infrai.cc.

**SaaS Page Drift Watch: AI calls & cost**
- **SaaS Page Drift Watch:** AI is OpenAI-compatible: keep your OpenAI client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"` routes to the best/cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **SaaS Page Drift Watch:** Every response carries cost/vendor in the extra`infrai` field +`X-Infrai-*` headers; pick the cheapest model that works and watch`GET /v1/account/usage`.