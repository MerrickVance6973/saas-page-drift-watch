import type { Section } from "./page_sections.ts";
import { isWatchable, type TenantState } from "./tenant_lifecycle.ts";

/**
 * Cosine similarity against the stored baseline. A block whose best neighbour sits
 * below this line is new prose, not a reworded sentence.
 */
export const DRIFT_THRESHOLD = 0.86;

export type Scored = { section: Section; bestScore: number; nearestText?: string };

export type DriftReport = {
  tenantId: string;
  url: string;
  alert: boolean;
  reason: "watched" | "tenant-not-watchable";
  changed: { anchor: string; text: string; bestScore: number; nearestText?: string }[];
};

/** The whole business decision, kept free of I/O so it can be tested directly. */
export function decideDrift(
  tenantId: string,
  state: TenantState,
  url: string,
  scored: Scored[],
  threshold = DRIFT_THRESHOLD,
): DriftReport {
  if (!isWatchable(state)) {
    return { tenantId, url, alert: false, reason: "tenant-not-watchable", changed: [] };
  }
  const changed = scored
    .filter((s) => s.bestScore < threshold)
    .map((s) => ({
      anchor: s.section.anchor,
      text: s.section.text,
      bestScore: s.bestScore,
      nearestText: s.nearestText,
    }));
  return { tenantId, url, alert: changed.length > 0, reason: "watched", changed };
}
