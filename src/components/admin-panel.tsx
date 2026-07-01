"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APP_ROLES, type AppRole } from "@/lib/access";
import type { ManagedProfile } from "@/lib/admin";

const roleLabels: Record<AppRole, string> = {
  admin: "관리자",
  operator: "운영자",
  viewer: "조회 전용",
};

function formatTimestamp(value: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createDraftRoles(profiles: ManagedProfile[]): Record<string, AppRole> {
  return Object.fromEntries(profiles.map((profile) => [profile.id, profile.role])) as Record<
    string,
    AppRole
  >;
}

export function AdminPanel({
  initialProfiles,
  currentUserId,
}: {
  initialProfiles: ManagedProfile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [profiles, setProfiles] = React.useState(initialProfiles);
  const [draftRoles, setDraftRoles] = React.useState<Record<string, AppRole>>(
    createDraftRoles(initialProfiles)
  );
  const [savingProfileId, setSavingProfileId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const counts = profiles.reduce(
    (accumulator, profile) => {
      accumulator.total += 1;
      accumulator[profile.role] += 1;
      return accumulator;
    },
    {
      total: 0,
      admin: 0,
      operator: 0,
      viewer: 0,
    }
  );

  const handleSave = async (profile: ManagedProfile) => {
    const nextRole = draftRoles[profile.id] ?? profile.role;

    if (nextRole === profile.role) {
      setMessage("변경할 역할이 없습니다.");
      return;
    }

    setSavingProfileId(profile.id);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/profile-role", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          profileId: profile.id,
          role: nextRole,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            updatedAt?: string;
            role?: AppRole;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message ?? "역할을 저장하지 못했습니다.");
        return;
      }

      const updatedAt = payload.updatedAt ?? new Date().toISOString();
      setProfiles((current) =>
        current.map((item) =>
          item.id === profile.id
            ? {
                ...item,
                role: nextRole,
                updatedAt,
              }
            : item
        )
      );
      setDraftRoles((current) => ({
        ...current,
        [profile.id]: nextRole,
      }));
      setMessage(`${profile.email ?? profile.fullName ?? "사용자"} 역할을 ${roleLabels[nextRole]}로 저장했습니다.`);
      router.refresh();
    } catch {
      setMessage("역할 변경 요청 중 오류가 발생했습니다.");
    } finally {
      setSavingProfileId(null);
    }
  };

  return (
    <div className="space-y-4">
      {message ? (
        <Alert>
          <AlertTitle>변경 결과</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">전체 사용자</div>
            <div className="text-2xl font-semibold">{counts.total}</div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">관리자</div>
            <div className="text-2xl font-semibold">{counts.admin}</div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">운영자</div>
            <div className="text-2xl font-semibold">{counts.operator}</div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">조회 전용</div>
            <div className="text-2xl font-semibold">{counts.viewer}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.24)]">
        <CardHeader>
          <CardTitle>역할 관리</CardTitle>
          <CardDescription>
            Supabase `profiles.role`을 수정합니다. 자기 계정은 잠금 방지 차원에서 변경할 수 없고, 마지막
            관리자 계정은 보호됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>운영 팁</AlertTitle>
            <AlertDescription>
              첫 admin은 SQL Editor에서 한 번만 지정하면 됩니다. 이후에는 이 화면에서 운영자와 조회 전용
              역할을 관리하세요.
            </AlertDescription>
          </Alert>

          <Separator />

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사용자</TableHead>
                  <TableHead>현재 역할</TableHead>
                  <TableHead>변경 역할</TableHead>
                  <TableHead>수정 시각</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length > 0 ? (
                  profiles.map((profile) => {
                    const draftRole = draftRoles[profile.id] ?? profile.role;
                    const isCurrentUser = profile.id === currentUserId;
                    const isDirty = draftRole !== profile.role;
                    const isSaving = savingProfileId === profile.id;

                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">
                              {profile.fullName ?? profile.email ?? profile.id}
                              {isCurrentUser ? (
                                <Badge variant="secondary" className="ml-2 align-middle">
                                  내 계정
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">{profile.email ?? "-"}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={profile.role === "admin" ? "default" : "outline"}>
                            {roleLabels[profile.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <Select
                            value={draftRole}
                            onValueChange={(next) =>
                              setDraftRoles((current) => ({
                                ...current,
                                [profile.id]: next as AppRole,
                              }))
                            }
                            disabled={isSaving || isCurrentUser}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="역할 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {APP_ROLES.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {roleLabels[role]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatTimestamp(profile.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant={isDirty ? "default" : "outline"}
                            disabled={isSaving || !isDirty || isCurrentUser}
                            onClick={() => void handleSave(profile)}
                          >
                            {isSaving ? (
                              <>
                                <RefreshCw className="mr-2 size-4 animate-spin" />
                                저장 중
                              </>
                            ) : (
                              "저장"
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      아직 관리할 사용자가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-xl border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
            <div className="mb-2 flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <span className="font-medium text-foreground">권한 기준</span>
            </div>
            <div>admin은 업로드와 역할 관리가 가능하고, operator는 업로드만 가능하며, viewer는 조회만 가능합니다.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
