/** Permission keys stored on role_permissions.permission. */
export const PERMISSIONS = [
  'manage_users',
  'manage_roles',
  'manage_settings',
  'view_audit_log',
  'view_catalog',
  'manage_catalog',
  'view_cost',
  'manage_prices',
  'view_suppliers',
  'manage_suppliers',
  'view_customers',
  'manage_customers',
  'view_stock',
  'view_receipts',
  'manage_receiving',
  'legacy_full_access',
  'legacy_pos_access',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export type RoleDefinition = {
  name: string;
  description: string;
  permissions: readonly Permission[];
};

/**
 * legacy_full_access covers routes that used to require owner.
 * legacy_pos_access covers routes that used to allow owner or cashier.
 * view_catalog reads the catalog. manage_catalog creates and edits categories, items, and units.
 * view_cost reads cost and markup. manage_prices sets cost, markup, and selling price.
 * view_suppliers reads suppliers. manage_suppliers creates, edits, and changes supplier status.
 * view_customers reads customers. manage_customers creates, edits, and changes customer status.
 * view_stock reads stock batches. view_receipts reads goods receipts. manage_receiving creates and confirms them.
 */
export const ROLE_MATRIX: readonly RoleDefinition[] = [
  {
    name: 'Admin',
    description: 'Every permission, including back office and point of sale.',
    permissions: PERMISSIONS,
  },
  {
    name: 'Manager',
    description: 'Back office, point of sale, and the product catalog. Can view costs, set prices, manage suppliers, manage customers, and receive stock. Cannot manage users, roles, settings, or the audit log.',
    permissions: ['legacy_full_access', 'legacy_pos_access', 'view_catalog', 'manage_catalog', 'view_cost', 'manage_prices', 'view_suppliers', 'manage_suppliers', 'view_customers', 'manage_customers', 'view_stock', 'view_receipts', 'manage_receiving'],
  },
  {
    name: 'Cashier',
    description: 'Point of sale, M-Pesa sales, own attendance clock, own profile, a read-only catalog, stock on hand, and customers.',
    permissions: ['legacy_pos_access', 'view_catalog', 'view_stock', 'view_customers', 'manage_customers'],
  },
  {
    name: 'Stock keeper',
    description: 'Read and manage the product catalog, suppliers, and stock receipts. Can view costs and stock.',
    permissions: ['view_catalog', 'manage_catalog', 'view_cost', 'view_suppliers', 'manage_suppliers', 'view_stock', 'view_receipts', 'manage_receiving'],
  },
  {
    name: 'Accountant',
    description: 'Read-only access to the audit log, the product catalog, suppliers, customers, receipts, and stock. Can view costs.',
    permissions: ['view_audit_log', 'view_catalog', 'view_cost', 'view_suppliers', 'view_customers', 'view_stock', 'view_receipts'],
  },
];
