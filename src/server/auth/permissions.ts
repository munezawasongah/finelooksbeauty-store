/**
 * Role → permission matrix (section 12.1, "Privilege misuse").
 * Refunds, price changes, stock adjustments, exports and integration
 * settings are separate permissions, checked server-side on every action.
 */
export type Role = "owner" | "manager" | "staff" | "support";

export const PERMISSIONS = [
  "dashboard.view",
  "orders.view",
  "orders.fulfill",
  "orders.cancel",
  "refunds.create",
  "products.view",
  "products.edit",
  "prices.edit",
  "inventory.view",
  "inventory.adjust",
  "inventory.import",
  "customers.view",
  "discounts.manage",
  "reports.view",
  "exports.run",
  "integrations.manage",
  "settings.manage",
  "staff.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const MATRIX: Record<Role, Set<Permission>> = {
  owner: ALL,
  manager: new Set<Permission>([
    "dashboard.view",
    "orders.view",
    "orders.fulfill",
    "orders.cancel",
    "refunds.create",
    "products.view",
    "products.edit",
    "prices.edit",
    "inventory.view",
    "inventory.adjust",
    "inventory.import",
    "customers.view",
    "discounts.manage",
    "reports.view",
    "exports.run",
    "audit.view",
  ]),
  staff: new Set<Permission>([
    "dashboard.view",
    "orders.view",
    "orders.fulfill",
    "products.view",
    "inventory.view",
  ]),
  support: new Set<Permission>(["dashboard.view", "orders.view", "customers.view", "products.view", "inventory.view"]),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Store staff",
  support: "Support",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Everything, including staff accounts, settings and integrations.",
  manager: "Catalog, prices, stock, orders, refunds, discounts and reports.",
  staff: "View and prepare orders, update fulfillment, review stock.",
  support: "Look up orders and customers. Read-only.",
};
