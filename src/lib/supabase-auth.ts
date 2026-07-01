import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { isAppRole, type AppRole } from "@/lib/access";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthContext extends AuthUser {
  role: AppRole;
}

function readEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];

    if (value) {
      return value;
    }
  }

  return null;
}

export function getSupabaseAuthUrl(): string | null {
  return readEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL");
}

export function getSupabaseAuthKey(): string | null {
  return readEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY"
  );
}

export function hasSupabaseAuthConfig(): boolean {
  return Boolean(getSupabaseAuthUrl() && getSupabaseAuthKey());
}

function buildAuthClient(
  getAll: () => Array<{ name: string; value: string }>,
  setAll: (
    cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>
  ) => void
): SupabaseClient | null {
  const url = getSupabaseAuthUrl();
  const key = getSupabaseAuthKey();

  if (!url || !key) {
    return null;
  }

  return createServerClient(url, key, {
    cookies: {
      getAll,
      setAll: (cookiesToSet, headers) => {
        setAll(cookiesToSet);
        void headers;
      },
    },
  });
}

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!hasSupabaseAuthConfig()) {
    return null;
  }

  const cookieStore = await cookies();

  return buildAuthClient(
    () => cookieStore.getAll(),
    (cookiesToSet) => {
      try {
        for (const cookie of cookiesToSet) {
          cookieStore.set(cookie.name, cookie.value, cookie.options);
        }
      } catch {
        // Some server rendering contexts expose read-only cookies.
      }
    }
  );
}

export async function getCurrentAuthContext(): Promise<AuthContext | null> {
  const client = await createSupabaseServerClient();

  if (!client) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return null;
  }

  let role: AppRole = "viewer";

  try {
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (isAppRole(profile?.role)) {
      role = profile.role;
    }
  } catch {
    // Fall back to the least-privileged role when the profile lookup fails.
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const context = await getCurrentAuthContext();

  if (!context) {
    return null;
  }

  return {
    id: context.id,
    email: context.email,
  };
}
