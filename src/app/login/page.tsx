import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { hasAnyAdminProfiles } from "@/lib/admin";
import { getCurrentUser, hasSupabaseAuthConfig } from "@/lib/supabase-auth";
import { TriangleAlert } from "lucide-react";

export const metadata: Metadata = {
  title: "로그인 · 단조 생산성 · 가스원단위 관리",
  description: "Supabase Auth로 로그인하고 업로드와 대시보드를 사용합니다.",
};

export default async function LoginPage() {
  const authEnabled = hasSupabaseAuthConfig();
  const user = await getCurrentUser();
  const adminBootstrapStatus = await hasAnyAdminProfiles();

  if (authEnabled && user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(20,184,166,0.12),transparent_26%),linear-gradient(180deg,rgba(9,9,11,1)_0%,rgba(15,15,18,1)_55%,rgba(10,10,12,1)_100%)] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-5 rounded-[2rem] border border-border/70 bg-background/35 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">인증 단계</Badge>
              <Badge variant="outline">{authEnabled ? "Supabase 연결됨" : "데모 모드"}</Badge>
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                단조 생산성 · 가스원단위 관리
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                현장 운영자가 로그인하면 엑셀 업로드, 시트/컬럼 매핑, 검증 후 적재,
                그리고 라인별 목표·실적과 가스원단위를 한 화면에서 확인할 수 있습니다.
              </p>
            </div>

            <Separator className="bg-border/80" />

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="border-border/70 bg-card/50">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    로그인 방식
                  </div>
                  <div className="mt-2 text-sm font-medium">이메일 + 비밀번호</div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card/50">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    보호 범위
                  </div>
                  <div className="mt-2 text-sm font-medium">업로드 / 대시보드 / 적재 API</div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card/50">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    권한 기준
                  </div>
                  <div className="mt-2 text-sm font-medium">인증 사용자만 접근</div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 bg-card/50">
              <CardHeader>
                <CardTitle>운영 메모</CardTitle>
                <CardDescription>
                  Supabase Auth가 아직 준비되지 않았다면 데모 모드로 로컬 화면을 계속 볼 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>1. Supabase 프로젝트에서 Auth 사용자를 하나 만듭니다.</p>
                <p>2. `.env.local`에 공개 키와 서비스 롤 키를 설정합니다.</p>
                <p>3. 로그인하면 업로드와 조회가 같은 계정 세션으로 보호됩니다.</p>
              </CardContent>
            </Card>
            {authEnabled && adminBootstrapStatus === false ? (
              <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-100">
                <TriangleAlert className="size-4" />
                <AlertTitle>첫 admin 계정이 아직 없습니다</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>Supabase SQL Editor에서 아래 쿼리를 한 번 실행해 첫 관리자를 지정하세요.</p>
                  <pre className="overflow-x-auto rounded-lg border border-border/70 bg-background/60 p-3 text-xs text-foreground">
{`update public.profiles
set role = 'admin'
where email = 'admin@company.com';`}
                  </pre>
                </AlertDescription>
              </Alert>
            ) : null}
          </section>

          <section className="flex items-center">
            {authEnabled ? (
              <LoginForm />
            ) : (
              <Card className="w-full border-border/70 bg-card/85 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur">
                <CardHeader>
                  <CardTitle>데모 모드</CardTitle>
                  <CardDescription>
                    Supabase Auth 환경변수가 아직 없어 로그인 화면은 비활성화되어 있습니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>
                    지금은 인증 없이도 업로드, 적재, 대시보드 확인이 가능합니다. 실DB 연결을
                    켜면 이 화면에서 로그인으로 전환됩니다.
                  </p>
                  <Link
                    href="/"
                    className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/80"
                  >
                    대시보드로 이동
                  </Link>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
