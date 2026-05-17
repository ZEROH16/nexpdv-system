import { PERMISSIONS, type PermissionKey } from "./permissionService";

export interface RoleSeed {
  id: string;
  name: string;
  code: "owner" | "admin" | "manager" | "cashier" | "stockist";
  level: number;
  permissions: PermissionKey[];
}

const without = (permissions: readonly PermissionKey[], blocked: PermissionKey[]): PermissionKey[] =>
  permissions.filter((permission) => !blocked.includes(permission));

export const roleSeeds: RoleSeed[] = [
  { id: "role_owner", name: "Dono", code: "owner", level: 100, permissions: [...PERMISSIONS] },
  { id: "role_admin", name: "Administrador", code: "admin", level: 90, permissions: [...PERMISSIONS] },
  {
    id: "role_manager",
    name: "Gerente",
    code: "manager",
    level: 70,
    permissions: without(PERMISSIONS, ["remove_cancelled_sale", "restore_backup", "activate_license"])
  },
  {
    id: "role_cashier",
    name: "Operador de Caixa",
    code: "cashier",
    level: 10,
    permissions: ["sell", "open_cash", "cash_income", "cash_expense", "apply_discount", "create_customer", "edit_customer"]
  },
  {
    id: "role_stockist",
    name: "Estoquista",
    code: "stockist",
    level: 20,
    permissions: ["create_product", "edit_product", "delete_product", "view_reports"]
  }
];

export const defaultRoleIdByCode = new Map(roleSeeds.map((role) => [role.code, role.id]));
