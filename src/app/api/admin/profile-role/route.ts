import { NextResponse } from "next/server";

import { canManageRoles, isAppRole, type AppRole } from "@/lib/access";
import { getCurrentAuthContext, hasSupabaseAuthConfig, createSupabaseServerClient } from "@/lib/supabase-auth";

export const dynamic = "force-dynamic";

async function countAdminProfiles() {
  const client = await createSupabaseServerClient();

  if (!client) {
    return 0;
  }

  const { data, error } = await client
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (error) {
    throw error;
  }

  return data?.length ?? 0;
}

export async function PATCH(request: Request) {
  if (!hasSupabaseAuthConfig()) {
    return NextResponse.json(
      { ok: false, message: "Supabase Auth 환경이 설정되지 않았습니다." },
      { status: 400 }
    );
  }

  const currentUser = await getCurrentAuthContext();

  if (!currentUser) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  if (!canManageRoles(currentUser.role)) {
    return NextResponse.json(
      { ok: false, message: "관리자만 역할을 변경할 수 있습니다." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        profileId?: string;
        role?: string;
      }
    | null;

  const profileId = body?.profileId?.trim();
  const nextRole = isAppRole(body?.role) ? (body?.role as AppRole) : null;

  if (!profileId || !nextRole) {
    return NextResponse.json(
      { ok: false, message: "대상 사용자와 역할을 확인할 수 없습니다." },
      { status: 400 }
    );
  }

  if (profileId === currentUser.id && nextRole !== currentUser.role) {
    return NextResponse.json(
      { ok: false, message: "내 계정의 역할은 여기서 변경할 수 없습니다." },
      { status: 400 }
    );
  }

  const client = await createSupabaseServerClient();

  if (!client) {
    return NextResponse.json(
      { ok: false, message: "Supabase 클라이언트를 만들 수 없습니다." },
      { status: 500 }
    );
  }

  const { data: targetProfile, error: loadError } = await client
    .from("profiles")
    .select("id, role")
    .eq("id", profileId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json(
      { ok: false, message: loadError.message },
      { status: 500 }
    );
  }

  if (!targetProfile) {
    return NextResponse.json(
      { ok: false, message: "대상 사용자를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (targetProfile.role === "admin" && nextRole !== "admin") {
    const adminCount = await countAdminProfiles();

    if (adminCount <= 1) {
      return NextResponse.json(
        { ok: false, message: "마지막 관리자 계정은 변경할 수 없습니다." },
        { status: 400 }
      );
    }
  }

  const { error: updateError } = await client
    .from("profiles")
    .update({
      role: nextRole,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (updateError) {
    return NextResponse.json(
      { ok: false, message: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    profileId,
    role: nextRole,
    updatedAt: new Date().toISOString(),
  });
}

