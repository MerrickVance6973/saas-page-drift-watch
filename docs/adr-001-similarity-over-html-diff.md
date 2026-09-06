# ADR 001 — Diff the meaning, not the markup

Status: accepted

## Context

I run this alone. The first version diffed raw HTML for each tenant's watched page.
It fired on every build hash, every rotated CDN path, every reordered `<div>`. I
stopped reading the alerts within a week, which is the same as not having them.

## Decision

Store each page block as an embedding in a per-tenant vector collection and compare a
fresh crawl against that baseline by cosine similarity. A block whose nearest neighbour
scores below `DRIFT_THRESHOLD` (0.86) counts as changed; anything above is a reword.

## Consequences

Reordering a page costs nothing — order is not part of the comparison. Class-name churn
disappears. In exchange the watcher is no longer exact: a one-word swap inside a long
paragraph can sit above the line and pass unreported. For competitor pricing pages that
trade is right. For a legal document it would not be, and I would diff the text directly.

The threshold is one constant in `src/drift_watch.ts` and the unit test pins the decision
around it, so moving it is a one-line change with a test that fails honestly.
