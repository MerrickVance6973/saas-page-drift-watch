import { z } from "zod";

export const TenantState = z.enum(["trial", "active", "suspended", "closed"]);
export type TenantState = z.infer<typeof TenantState>;

export const Tenant = z.object({
  tenantId: z.string().min(3),
  company: z.string().min(1),
  state: TenantState,
  alertEmail: z.string().email(),
  watchedUrl: z.string().url(),
});
export type Tenant = z.infer<typeof Tenant>;

export const OnboardTenant = Tenant.omit({ state: true });
export const AdminAction = z.object({
  tenantId: z.string().min(3),
  action: z.enum(["activate", "suspend", "reactivate", "close"]),
  actor: z.string().min(1),
});
export type AdminAction = z.infer<typeof AdminAction>;

const ALLOWED: Record<TenantState, Partial<Record<AdminAction["action"], TenantState>>> = {
  trial: { activate: "active", close: "closed" },
  active: { suspend: "suspended", close: "closed" },
  suspended: { reactivate: "active", close: "closed" },
  closed: {},
};

export class LifecycleRejected extends Error {}

export function applyAdminAction(current: TenantState, action: AdminAction["action"]): TenantState {
  const next = ALLOWED[current][action];
  if (!next) throw new LifecycleRejected(`${action} is not available from ${current}`);
  return next;
}

/** A trial tenant is watched like any paying one; a suspended or closed one is not. */
export function isWatchable(state: TenantState): boolean {
  return state === "trial" || state === "active";
}
