/** Permission keys stored on role_permissions.permission. */
export const PERMISSIONS = [
  'manage_users',
  'manage_roles',
  'manage_settings',
  'view_audit_log',
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
 * Stock keeper has no keys until inventory gets its own permission.
 */
export const ROLE_MATRIX: readonly RoleDefinition[] = [
  {
    name: 'Admin',
    description: 'Every permission, including back office and point of sale.',
    permissions: PERMISSIONS,
  },
  {
    name: 'Manager',
    description: 'Back office and point of sale. Cannot manage users, roles, settings, or the audit log.',
    permissions: ['legacy_full_access', 'legacy_pos_access'],
  },
  {
    name: 'Cashier',
    description: 'Point of sale, M-Pesa sales, own attendance clock, and own profile.',
    permissions: ['legacy_pos_access'],
  },
  {
    name: 'Stock keeper',
    description: 'No permissions yet.',
    permissions: [],
  },
  {
    name: 'Accountant',
    description: 'Read-only access to the audit log.',
    permissions: ['view_audit_log'],
  },
];
