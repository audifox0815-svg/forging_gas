export const APP_ROLES = ["admin", "manager", "operator", "viewer"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function canImportRole(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "operator";
}

export function canEditTargets(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

export function canManageRoles(role: AppRole | null | undefined): boolean {
  return role === "admin";
}

export function canEditLineScopedData(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "operator";
}
