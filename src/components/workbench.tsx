"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardView, GasView, ProductivityView } from "@/components/dashboard-view";
import { AdminPanel } from "@/components/admin-panel";
import { UploadPanel } from "@/components/upload-panel";
import { APP_NAME, type DashboardSnapshot } from "@/lib/domain";
import { formatMonthLabel, formatNumber } from "@/lib/format";
import { canImportRole, canManageRoles, type AppRole } from "@/lib/access";
import { ArrowUpRight, Factory, Gauge, TriangleAlert } from "lucide-react";
import type { ManagedProfile } from "@/lib/admin";

interface WorkbenchProps {
  initialSnapshot: DashboardSnapshot;
  authEnabled: boolean;
  role: AppRole | null;
  adminProfiles: ManagedProfile[];
  adminBootstrapStatus: boolean | null;
  currentUserId: string | null;
}

function SummaryPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/40 px-4 py-3">
      <div className="rounded-xl border border-border/70 bg-background p-2 text-primary">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
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

export function Workbench({
  initialSnapshot,
  authEnabled,
  role,
  adminProfiles,
  adminBootstrapStatus,
  currentUserId,
}: WorkbenchProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const guestMode = authEnabled && role === null;
  const canImport = !authEnabled || canImportRole(role) || guestMode;
  const canManage = canManageRoles(role);
  const tabCount = 3 + (canImport ? 1 : 0) + (canManage ? 1 : 0);
  const tabGridClass =
    tabCount >= 5 ? "grid-cols-2 md:grid-cols-5" : tabCount === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.12),transparent_26%),linear-gradient(180deg,rgba(9,9,11,1)_0%,rgba(15,15,18,1)_55%,rgba(10,10,12,1)_100%)] text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="space-y-5 rounded-[2rem] border border-border/70 bg-background/45 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.36)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">단조 생산성·가스원단위</Badge>
                <Badge variant="outline">{snapshot.source}</Badge>
                <Badge variant="outline">{snapshot.activeYear}년</Badge>
                {authEnabled ? <Badge variant="outline">{roleLabel(role)}</Badge> : null}
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{APP_NAME}</h1>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  업로드된 데이터를 바탕으로 라인별 실적, 목표, 생산성, 가스원단위를 한눈에 보여줍니다.
                  로그인 없이도 볼 수 있고, 로그인한 사용자는 권한에 따라 운영할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px] lg:grid-cols-1">
              <SummaryPill
                icon={<Factory className="size-4" />}
                label="생산"
                value={`${formatNumber(snapshot.counts.productionRows, 0)}건`}
              />
              <SummaryPill
                icon={<Gauge className="size-4" />}
                label="가스"
                value={`${formatNumber(snapshot.counts.gasRows, 0)}건`}
              />
              <SummaryPill
                icon={<ArrowUpRight className="size-4" />}
                label="최근 적재"
                value={
                  snapshot.importHealth.lastImport
                    ? formatMonthLabel(snapshot.importHealth.lastImport.importedAt.slice(0, 7))
                    : "아직 없음"
                }
              />
            </div>
          </div>

          <Separator className="bg-border/80" />

          {guestMode ? (
            <Alert className="border-sky-500/30 bg-sky-500/10 text-sky-100">
              <TriangleAlert className="size-4" />
              <AlertTitle>게스트 모드</AlertTitle>
              <AlertDescription>
                로그인 없이 바로 사용할 수 있습니다. 업로드와 조회는 공용으로 열려 있고, 역할 관리만 로그인한 관리자에게
                열려 있습니다.
              </AlertDescription>
            </Alert>
          ) : null}

          {role === "manager" ? (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-100">
              <TriangleAlert className="size-4" />
              <AlertTitle>조장 모드</AlertTitle>
              <AlertDescription>
                현재 계정은 조장 권한입니다. 자기 라인 데이터를 확인하고, 이후 단계에서 승인/확인 기능을 사용할 수 있습니다.
              </AlertDescription>
            </Alert>
          ) : null}

          {authEnabled && adminBootstrapStatus === false ? (
            <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
              <TriangleAlert className="size-4" />
              <AlertTitle>첫 관리자 계정이 없습니다</AlertTitle>
              <AlertDescription>
                Supabase SQL Editor에서 첫 관리자 계정을 한 번만 지정해 주세요.
              </AlertDescription>
            </Alert>
          ) : null}

          {!canImport ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              현재 계정은 조회 전용입니다. 업로드가 필요하면 작업자나 관리자에게 권한을 요청하세요.
            </div>
          ) : null}
        </header>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList className={["grid h-auto w-full gap-2 bg-transparent p-0", tabGridClass].join(" ")}>
            {canImport ? <TabsTrigger value="upload">업로드</TabsTrigger> : null}
            <TabsTrigger value="dashboard">생산성 대시보드</TabsTrigger>
            <TabsTrigger value="productivity">시간당 생산량</TabsTrigger>
            <TabsTrigger value="gas">가스원단위</TabsTrigger>
            {canManage ? <TabsTrigger value="admin">권한 관리</TabsTrigger> : null}
          </TabsList>

          {canImport ? (
            <TabsContent value="upload" className="space-y-4">
              <UploadPanel onCommitted={setSnapshot} />
            </TabsContent>
          ) : null}

          <TabsContent value="dashboard">
            <DashboardView snapshot={snapshot} />
          </TabsContent>

          <TabsContent value="productivity">
            <ProductivityView snapshot={snapshot} />
          </TabsContent>

          <TabsContent value="gas">
            <GasView snapshot={snapshot} />
          </TabsContent>

          {canManage ? (
            <TabsContent value="admin" className="space-y-4">
              <AdminPanel initialProfiles={adminProfiles} currentUserId={currentUserId ?? ""} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </main>
  );
}

