"use client";

import { signOutAction } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AuthChipProps {
  authEnabled: boolean;
  email: string | null;
}

export function AuthChip({ authEnabled, email }: AuthChipProps) {
  if (!authEnabled) {
    return <Badge variant="outline">데모 모드</Badge>;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary">{email ?? "로그인됨"}</Badge>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm">
          로그아웃
        </Button>
      </form>
    </div>
  );
}

