import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export interface AuthUser {
  id: string;
  email: string | null;
}

export function getSupabaseAuthUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null;
}

export function getSupabaseAuthKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    null
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

export async function getCurrentUser(): Promise<AuthUser | null> {
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

  return {
    id: user.id,
    email: user.email ?? null,
  };
}
