/** Permission keys stored on role_permissions.permission. */
export const PERMISSIONS = [
  'manage_users',
  'manage_roles',
  'manage_settings',
  'view_audit_log',
  'legacy_full_access',
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
 * System roles. Admin has every key. Accountant has view_audit_log only.
 * Manager, Cashier, and Stock keeper are not split further yet:
 * Cashier and Stock keeper share legacy_full_access so the existing
 * screens keep working until those areas get their own keys.
 * Manager also manages users, settings, and the audit log, but not roles.
 */
export const ROLE_MATRIX: readonly RoleDefinition[] = [
  {
    name: 'Admin',
    description: 'Full access to users, roles, settings, the audit log, and day-to-day operations.',
    permissions: PERMISSIONS,
  },
  {
    name: 'Manager',
    description: 'Day-to-day operations, plus users, settings, and the audit log.',
    permissions: ['manage_users', 'manage_settings', 'view_audit_log', 'legacy_full_access'],
  },
  {
    name: 'Cashier',
    description: 'Point of sale and the other existing operational screens.',
    permissions: ['legacy_full_access'],
  },
  {
    name: 'Stock keeper',
    description: 'Inventory and the other existing operational screens.',
    permissions: ['legacy_full_access'],
  },
  {
    name: 'Accountant',
    description: 'Read-only access to the audit log.',
    permissions: ['view_audit_log'],
  },
];
