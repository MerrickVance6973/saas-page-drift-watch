import { createServer } from "node:http";
import { z } from "zod";
import { AdminAction, LifecycleRejected, OnboardTenant, Tenant, applyAdminAction } from "./tenant_lifecycle.ts";
import { createTenantCollection } from "./section_index.ts";
import { runWatch } from "./watch_run.ts";
import { InfraiError } from "./infrai_client.ts";

const tenants = new Map<string, Tenant>();

async function readJson(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

async function route(method: string, path: string, body: unknown) {
  if (method === "POST" && path === "/tenants") {
    const input = OnboardTenant.parse(body);
    const tenant: Tenant = { ...input, state: "trial" };
    await createTenantCollection(tenant.tenantId);
    tenants.set(tenant.tenantId, tenant);
    return { status: 201, payload: tenant };
  }

  if (method === "POST" && path === "/admin/actions") {
    const action = AdminAction.parse(body);
    const tenant = tenants.get(action.tenantId);
    if (!tenant) return { status: 404, payload: { error: "unknown tenant" } };
    const next = applyAdminAction(tenant.state, action.action);
    tenants.set(tenant.tenantId, { ...tenant, state: next });
    return { status: 200, payload: { tenantId: tenant.tenantId, state: next, actor: action.actor } };
  }

  if (method === "POST" && path === "/watch-runs") {
    const { tenantId } = z.object({ tenantId: z.string() }).parse(body);
    const tenant = tenants.get(tenantId);
    if (!tenant) return { status: 404, payload: { error: "unknown tenant" } };
    return { status: 200, payload: await runWatch(tenant) };
  }

  return { status: 404, payload: { error: "no such route" } };
}

export const server = createServer(async (req, res) => {
  const send = (status: number, payload: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const { status, payload } = await route(req.method ?? "GET", url.pathname, await readJson(req));
    send(status, payload);
  } catch (err) {
    if (err instanceof z.ZodError) return send(422, { error: "invalid body", issues: err.issues });
    if (err instanceof LifecycleRejected) return send(409, { error: err.message });
    // A rejected argument is the caller's problem, so it stays a 4xx here too.
    if (err instanceof InfraiError) return send(err.status < 500 ? err.status : 502, { error: err.code });
    send(500, { error: "unexpected" });
  }
});

if (process.argv[1]?.endsWith("admin_service.ts")) {
  server.listen(3000, () => console.log("admin service on http://localhost:3000"));
}
