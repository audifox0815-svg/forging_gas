import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAuthKey, getSupabaseAuthUrl, hasSupabaseAuthConfig } from "@/lib/supabase-auth";

type SessionCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

function applySessionChanges(
  response: NextResponse,
  cookiesToSet: SessionCookie[],
  headers: Headers
): NextResponse {
  for (const cookie of cookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }

  headers.forEach((value, key) => {
    response.headers.set(key, value);
  });

  return response;
}

function createProxySupabaseClient(
  request: NextRequest,
  cookiesToSet: SessionCookie[],
  headers: Headers
) {
  const url = getSupabaseAuthUrl();
  const key = getSupabaseAuthKey();

  if (!url || !key) {
    return null;
  }

  return createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (nextCookies, nextHeaders) => {
        cookiesToSet.splice(0, cookiesToSet.length, ...nextCookies);
        Object.entries(nextHeaders).forEach(([headerName, headerValue]) => {
          headers.set(headerName, headerValue);
        });
      },
    },
  });
}

export async function proxy(request: NextRequest) {
  if (!hasSupabaseAuthConfig()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const cookiesToSet: SessionCookie[] = [];
  const headers = new Headers();
  const supabase = createProxySupabaseClient(request, cookiesToSet, headers);

  if (!supabase) {
    return NextResponse.next();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPath = pathname.startsWith("/login");

  let response: NextResponse = NextResponse.next();

  if (user && isLoginPath) {
    response = NextResponse.redirect(new URL("/", request.url));
  }

  return applySessionChanges(response, cookiesToSet, headers);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
