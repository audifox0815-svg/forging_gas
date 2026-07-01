"use client";

import { signOutAction } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canImportRole, type AppRole } from "@/lib/access";

interface AuthChipProps {
  authEnabled: boolean;
  email: string | null;
  role: AppRole | null;
}

function roleLabel(role: AppRole | null): string {
  switch (role) {
    case "admin":
      return "관리자";
    case "operator":
      return "운영자";
    case "viewer":
      return "조회 전용";
    default:
      return "권한 확인 중";
  }
}

export function AuthChip({ authEnabled, email, role }: AuthChipProps) {
  if (!authEnabled) {
    return <Badge variant="outline">데모 모드</Badge>;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary">{roleLabel(role)}</Badge>
      <Badge variant={canImportRole(role) ? "outline" : "secondary"}>{email ?? "로그인됨"}</Badge>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm">
          로그아웃
        </Button>
      </form>
    </div>
  );
}
