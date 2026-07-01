import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedAdminClient: SupabaseClient | null | undefined;

function getSupabaseUrl(): string | null {
  return (
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    null
  );
}

function getSupabaseAdminKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ?? null;
}

export function hasSupabaseConfig(): boolean {
  return hasSupabaseAdminConfig();
}

export function hasSupabaseAdminConfig(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAdminKey());
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (cachedAdminClient !== undefined) {
    return cachedAdminClient;
  }

  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseAdminKey();

  if (!url || !serviceRoleKey) {
    cachedAdminClient = null;
    return null;
  }

  cachedAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedAdminClient;
}
