import { PermissionCode } from '@zayqora/contracts';

export const permissionsData = [
  ...['orders:read','orders:process','orders:cancel','payments:manage','reservations:manage','reports:read'].map(code=>({code,description:code,module:code.split(':')[0]})),
  {
    code: PermissionCode.RESTAURANT_READ,
    description: 'View restaurant details',
    module: 'restaurant',
  },
  {
    code: PermissionCode.RESTAURANT_UPDATE,
    description: 'Update restaurant details and configuration',
    module: 'restaurant',
  },
  {
    code: PermissionCode.RESTAURANT_DELETE,
    description: 'Delete or archive restaurant',
    module: 'restaurant',
  },
  {
    code: PermissionCode.BRANCH_MANAGE,
    description: 'Manage restaurant branches',
    module: 'branches',
  },
  {
    code: PermissionCode.STAFF_MANAGE,
    description: 'Invite, assign, and manage restaurant staff',
    module: 'staff',
  },
  {
    code: PermissionCode.WORKSPACE_ACCESS,
    description: 'Access restaurant administrative workspace',
    module: 'workspace',
  },
  {
    code: PermissionCode.SETTINGS_UPDATE,
    description: 'Update restaurant operational settings',
    module: 'settings',
  },
];

export async function seedPermissions(client: import('pg').PoolClient) {
  for (const p of permissionsData) {
    await client.query(
      `INSERT INTO permissions (code, description, module)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE
       SET description = EXCLUDED.description, module = EXCLUDED.module`,
      [p.code, p.description, p.module]
    );
  }
}
