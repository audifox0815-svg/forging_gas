"use client";

import Link from "next/link";

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
    case "manager":
      return "관리자+조장";
    case "operator":
      return "작업자";
    case "viewer":
      return "조회";
    default:
      return "게스트";
  }
}

export function AuthChip({ authEnabled, email, role }: AuthChipProps) {
  if (!authEnabled) {
    return <Badge variant="outline">비로그인 모드</Badge>;
  }

  if (!email) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">게스트 모드</Badge>
        <Badge variant="outline">공용 사용</Badge>
        <Link
          href="/login"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          로그인
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary">{roleLabel(role)}</Badge>
      <Badge variant={canImportRole(role) ? "outline" : "secondary"}>{email}</Badge>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm">
          로그아웃
        </Button>
      </form>
    </div>
  );
}

