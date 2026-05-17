import { createHash } from "node:crypto";

export const PERMISSIONS = [
  "sell",
  "open_cash",
  "close_cash",
  "cash_withdrawal",
  "cash_income",
  "cash_expense",
  "apply_discount",
  "apply_high_discount",
  "cancel_sale",
  "remove_cancelled_sale",
  "edit_price",
  "create_product",
  "edit_product",
  "delete_product",
  "create_customer",
  "edit_customer",
  "delete_customer",
  "issue_fiscal",
  "cancel_fiscal",
  "configure_pix",
  "view_reports",
  "access_audit",
  "access_management",
  "access_settings",
  "manage_users",
  "activate_license",
  "activate_cloud",
  "export_backup",
  "restore_backup"
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const permissionLabels: Record<PermissionKey, string> = {
  sell: "Vender",
  open_cash: "Abrir caixa",
  close_cash: "Fechar caixa",
  cash_withdrawal: "Sangria",
  cash_income: "Registrar entrada",
  cash_expense: "Registrar saida",
  apply_discount: "Aplicar desconto",
  apply_high_discount: "Aplicar desconto acima de 5%",
  cancel_sale: "Cancelar venda",
  remove_cancelled_sale: "Excluir venda cancelada",
  edit_price: "Editar preco",
  create_product: "Cadastrar produto",
  edit_product: "Editar produto",
  delete_product: "Excluir produto",
  create_customer: "Cadastrar cliente",
  edit_customer: "Editar cliente",
  delete_customer: "Excluir/inativar cliente",
  issue_fiscal: "Emitir fiscal",
  cancel_fiscal: "Cancelar fiscal",
  configure_pix: "Configurar Pix",
  view_reports: "Acessar relatorios",
  access_audit: "Acessar auditoria",
  access_management: "Acessar gestao",
  access_settings: "Acessar configuracoes",
  manage_users: "Gerenciar usuarios",
  activate_license: "Ativar licenca",
  activate_cloud: "Ativar cloud",
  export_backup: "Exportar backup",
  restore_backup: "Restaurar backup"
};

export const managerRoleCodes = new Set(["owner", "admin", "manager"]);
export const adminRoleCodes = new Set(["owner", "admin"]);

export const normalizeLogin = (value: string): string => value.trim().toLowerCase();

export const hashSecret = (scope: "password" | "pin", value: string): string =>
  createHash("sha256").update(`nexpdv:${scope}:${value}`).digest("hex");

export const hashPassword = (password: string): string => hashSecret("password", password);
export const hashPin = (pin: string): string => hashSecret("pin", pin);
export const legacyHashPassword = (password: string): string => createHash("sha256").update(`nexpdv:${password}`).digest("hex");
