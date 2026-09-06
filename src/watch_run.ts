import { Tenant } from "./tenant_lifecycle.ts";
import { extractSections, fetchPage } from "./page_sections.ts";
import { createTenantCollection, embed, nearestBaseline, rankReplacedBlocks, storeBaseline } from "./section_index.ts";
import { decideDrift, type Scored } from "./drift_watch.ts";
import { InfraiError } from "./infrai_client.ts";

/** One sweep: onboard the collection if needed, diff the page, print the report. */
export async function runWatch(tenantRaw: unknown, opts: { baseline?: boolean } = {}) {
  const tenant = Tenant.parse(tenantRaw);
  const html = await fetchPage(tenant.watchedUrl);
  const sections = extractSections(html);
  const vectors = await embed(sections.map((s) => s.text));

  if (opts.baseline) {
    await createTenantCollection(tenant.tenantId);
    await storeBaseline(tenant.tenantId, tenant.watchedUrl, sections, vectors);
    return { baselined: sections.length };
  }

  const scored: Scored[] = [];
  for (let i = 0; i < sections.length; i++) {
    const matches = await nearestBaseline(tenant.tenantId, tenant.watchedUrl, vectors[i]);
    scored.push({
      section: sections[i],
      bestScore: matches[0]?.score ?? 0,
      nearestText: matches[0]?.metadata?.text,
    });
  }

  const report = decideDrift(tenant.tenantId, tenant.state, tenant.watchedUrl, scored);
  for (const change of report.changed) {
    const pool = scored.map((s) => s.nearestText).filter((t): t is string => Boolean(t));
    change.nearestText = (await rankReplacedBlocks(change.text, pool))[0] ?? change.nearestText;
  }
  await storeBaseline(tenant.tenantId, tenant.watchedUrl, sections, vectors);
  return report;
}

if (process.argv[1]?.endsWith("watch_run.ts")) {
  const tenant = {
    tenantId: process.env.TENANT_ID ?? "acme-eu",
    company: "Acme EU",
    state: "active" as const,
    alertEmail: "ops@acme.example",
    watchedUrl: process.env.WATCH_URL ?? "https://example.com/",
  };
  runWatch(tenant, { baseline: process.argv.includes("--baseline") })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      if (e instanceof InfraiError) console.error(`infrai ${e.code}`, e.detail);
      else console.error(e);
      process.exitCode = 1;
    });
}
