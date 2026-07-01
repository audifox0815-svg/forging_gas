"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldCheck, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APP_ROLES, type AppRole } from "@/lib/access";
import { LINE_CODES } from "@/lib/domain";
import type { ManagedProfile } from "@/lib/admin";

const roleLabels: Record<AppRole, string> = {
  admin: "관리자",
  manager: "관리자+조장",
  operator: "작업자",
  viewer: "조회",
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

function formatLineLabel(value: string | null): string {
  if (!value) {
    return "-";
  }

  return value === "RM" ? "R/M" : value;
}

function createDraftRoles(profiles: ManagedProfile[]): Record<string, AppRole> {
  return Object.fromEntries(profiles.map((profile) => [profile.id, profile.role])) as Record<
    string,
    AppRole
  >;
}

function createDraftLines(profiles: ManagedProfile[]): Record<string, string | null> {
  return Object.fromEntries(profiles.map((profile) => [profile.id, profile.lineCode])) as Record<
    string,
    string | null
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
  const [draftRoles, setDraftRoles] = React.useState<Record<string, AppRole>>(createDraftRoles(initialProfiles));
  const [draftLines, setDraftLines] = React.useState<Record<string, string | null>>(createDraftLines(initialProfiles));
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
      manager: 0,
      operator: 0,
      viewer: 0,
    }
  );

  const handleSave = async (profile: ManagedProfile) => {
    const nextRole = draftRoles[profile.id] ?? profile.role;
    const nextLineCode = draftLines[profile.id] ?? profile.lineCode;

    if (nextRole === profile.role && nextLineCode === profile.lineCode) {
      setMessage("변경할 항목이 없습니다.");
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
          lineCode: nextLineCode,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
            updatedAt?: string;
            role?: AppRole;
            lineCode?: string | null;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        setMessage(payload?.message ?? "설정을 저장하지 못했습니다.");
        return;
      }

      const updatedAt = payload.updatedAt ?? new Date().toISOString();
      setProfiles((current) =>
        current.map((item) =>
          item.id === profile.id
            ? {
                ...item,
                role: nextRole,
                lineCode: nextLineCode,
                updatedAt,
              }
            : item
        )
      );
      setDraftRoles((current) => ({
        ...current,
        [profile.id]: nextRole,
      }));
      setDraftLines((current) => ({
        ...current,
        [profile.id]: nextLineCode,
      }));
      setMessage(`${profile.email ?? profile.fullName ?? "사용자"} 설정을 저장했습니다.`);
      router.refresh();
    } catch {
      setMessage("설정 저장 중 오류가 발생했습니다.");
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">관리자+조장</div>
            <div className="text-2xl font-semibold">{counts.manager}</div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">작업자</div>
            <div className="text-2xl font-semibold">{counts.operator}</div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="space-y-1 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">조회</div>
            <div className="text-2xl font-semibold">{counts.viewer}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.24)]">
        <CardHeader>
          <CardTitle>사용자 역할 관리</CardTitle>
          <CardDescription>
            관리자만 역할을 바꿀 수 있습니다. 라인 배정은 작업자와 조장 권한 범위를 나누는 기준으로 사용합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>운영 규칙</AlertTitle>
            <AlertDescription>
              첫 admin은 SQL Editor에서 한 번만 지정합니다. 이후에는 관리자 화면에서 조장, 작업자, 조회 권한을 관리합니다.
            </AlertDescription>
          </Alert>

          <Separator />

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사용자</TableHead>
                  <TableHead>현재 역할</TableHead>
                  <TableHead>현재 라인</TableHead>
                  <TableHead>변경 역할</TableHead>
                  <TableHead>변경 라인</TableHead>
                  <TableHead>수정 시각</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length > 0 ? (
                  profiles.map((profile) => {
                    const draftRole = draftRoles[profile.id] ?? profile.role;
                    const draftLine = draftLines[profile.id] ?? profile.lineCode;
                    const isCurrentUser = profile.id === currentUserId;
                    const isDirty = draftRole !== profile.role || draftLine !== profile.lineCode;
                    const isSaving = savingProfileId === profile.id;

                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">
                              {profile.fullName ?? profile.email ?? profile.id}
                              {isCurrentUser ? (
                                <Badge variant="secondary" className="ml-2 align-middle">
                                  현재 계정
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
                        <TableCell>{formatLineLabel(profile.lineCode)}</TableCell>
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
                        <TableCell className="min-w-[180px]">
                          <Select
                            value={draftLine ?? "__none__"}
                            onValueChange={(next) =>
                              setDraftLines((current) => ({
                                ...current,
                                [profile.id]: next === "__none__" ? null : next,
                              }))
                            }
                            disabled={isSaving || isCurrentUser}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="라인 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">미지정</SelectItem>
                              {LINE_CODES.map((lineCode) => (
                                <SelectItem key={lineCode} value={lineCode}>
                                  {formatLineLabel(lineCode)}
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
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
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
              <span className="font-medium text-foreground">권한 요약</span>
            </div>
            <div>
              admin은 전체 관리, manager는 조장/운영 관리, operator는 자기 라인 입력, viewer는 조회 전용입니다.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

