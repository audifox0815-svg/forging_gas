import "server-only";

import { createSupabaseServerClient, getCurrentAuthContext, hasSupabaseAuthConfig, type AuthContext } from "@/lib/supabase-auth";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase";
import { canManageRoles, isAppRole, type AppRole } from "@/lib/access";

export interface ManagedProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  role: AppRole;
  lineCode: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapProfileRow(row: Record<string, unknown>): ManagedProfile | null {
  if (!isAppRole(row.role)) {
    return null;
  }

  return {
    id: String(row.id ?? ""),
    email: row.email ? String(row.email) : null,
    fullName: row.full_name ? String(row.full_name) : null,
    role: row.role,
    lineCode: row.line_code ? String(row.line_code) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function getManagedProfiles(context?: AuthContext | null): Promise<ManagedProfile[]> {
  if (!hasSupabaseAuthConfig()) {
    return [];
  }

  const currentUser = context ?? (await getCurrentAuthContext());

  if (!currentUser || !canManageRoles(currentUser.role)) {
    return [];
  }

  const client = await createSupabaseServerClient();

  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from("profiles")
    .select("id,email,full_name,role,line_code,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .order("email", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => mapProfileRow(row as Record<string, unknown>))
    .filter((row): row is ManagedProfile => Boolean(row));
}

export async function hasAnyAdminProfiles(): Promise<boolean | null> {
  if (!hasSupabaseAdminConfig()) {
    return null;
  }

  const client = getSupabaseAdminClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1);

  if (error) {
    return null;
  }

  return (data?.length ?? 0) > 0;
}
