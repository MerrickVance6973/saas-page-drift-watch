import test from "node:test";
import assert from "node:assert/strict";
import { decideDrift, DRIFT_THRESHOLD } from "../src/drift_watch.ts";
import { applyAdminAction, LifecycleRejected } from "../src/tenant_lifecycle.ts";

const sections = [
  { anchor: "aaa", text: "Team plan includes SSO and audit logs for every seat." },
  { anchor: "bbb", text: "Usage is billed monthly with no minimum commitment." },
];

test("a rewritten pricing block below the threshold raises one alert", () => {
  const report = decideDrift("acme-eu", "active", "https://rival.example/pricing", [
    { section: sections[0], bestScore: 0.94, nearestText: "Team plan includes SSO." },
    { section: sections[1], bestScore: 0.51, nearestText: "Usage is billed annually." },
  ]);
  assert.equal(report.alert, true);
  assert.deepEqual(report.changed.map((c) => c.anchor), ["bbb"]);
  assert.ok(report.changed[0].bestScore < DRIFT_THRESHOLD);
});

test("a suspended tenant is diffed but never alerted", () => {
  const report = decideDrift("acme-eu", "suspended", "https://rival.example/pricing", [
    { section: sections[1], bestScore: 0.1 },
  ]);
  assert.equal(report.alert, false);
  assert.equal(report.reason, "tenant-not-watchable");
  assert.equal(report.changed.length, 0);
});

test("reactivate is only reachable from suspended", () => {
  assert.equal(applyAdminAction("suspended", "reactivate"), "active");
  assert.throws(() => applyAdminAction("trial", "reactivate"), LifecycleRejected);
});
