import { RoleCode, PermissionCode, operationalRolePermissions } from '@zayqora/contracts';

export const systemRoles = [
  {
    name: RoleCode.OWNER,
    description: 'Full restaurant ownership with all privileges',
    permissions: Object.values(PermissionCode),
  },
  {
    name: RoleCode.MANAGER,
    description: 'Restaurant management with branch, staff, and settings access',
    permissions: [
      PermissionCode.RESTAURANT_READ,
      PermissionCode.RESTAURANT_UPDATE,
      PermissionCode.BRANCH_MANAGE,
      PermissionCode.STAFF_MANAGE,
      PermissionCode.WORKSPACE_ACCESS,
      PermissionCode.SETTINGS_UPDATE,
      PermissionCode.ORDERS_READ, PermissionCode.ORDERS_PROCESS, PermissionCode.ORDERS_CANCEL, PermissionCode.PAYMENTS_MANAGE, PermissionCode.RESERVATIONS_MANAGE, PermissionCode.REPORTS_READ,
    ],
  },
  {
    name: RoleCode.STAFF,
    description: 'General front-of-house staff member',
    permissions: [PermissionCode.RESTAURANT_READ, PermissionCode.WORKSPACE_ACCESS,PermissionCode.ORDERS_READ,PermissionCode.ORDERS_PROCESS,PermissionCode.RESERVATIONS_MANAGE],
  },
  {
    name: RoleCode.KITCHEN,
    description: 'Kitchen display operations',
    permissions: [PermissionCode.WORKSPACE_ACCESS],
  },
  {
    name: RoleCode.CASHIER,
    description: 'POS cashier operations',
    permissions: [PermissionCode.WORKSPACE_ACCESS],
  },
];

export async function seedRoles(client: import('pg').PoolClient) {
  const combined=systemRoles.map(r=>({...r,permissions:[...r.permissions,...(operationalRolePermissions[r.name]??[])]}));
  for(const [name,permissions] of Object.entries(operationalRolePermissions))if(!combined.some(r=>r.name===name))combined.push({name:name as any,description:name,permissions});
  for (const role of combined) {
    // Upsert role
    const res = await client.query(
      `SELECT id FROM roles WHERE name = $1 AND restaurant_id IS NULL`,
      [role.name]
    );

    let roleId;
    if (res.rows.length === 0) {
      const insertRes = await client.query(
        `INSERT INTO roles (name, description, is_system) VALUES ($1, $2, TRUE) RETURNING id`,
        [role.name, role.description]
      );
      roleId = insertRes.rows[0].id;
    } else {
      roleId = res.rows[0].id;
    }

    // Assign permissions
    for (const permCode of role.permissions) {
      const permRes = await client.query(`SELECT id FROM permissions WHERE code = $1`, [permCode]);
      if (permRes.rows.length > 0) {
        const permId = permRes.rows[0].id;
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [roleId, permId]
        );
      }
    }
  }
}
