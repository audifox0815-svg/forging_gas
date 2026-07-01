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
  description: "관리자 역할 관리가 필요할 때만 사용하는 Supabase Auth 로그인 화면입니다.",
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
              <Badge variant="secondary">공용 사용 가능</Badge>
              <Badge variant="outline">{authEnabled ? "관리자 로그인 사용" : "로그인 없음"}</Badge>
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                단조 생산성 · 가스원단위 관리
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                기본 화면은 로그인 없이도 열 수 있습니다. 이 화면은 관리자 역할 관리가 필요할 때만
                들어오면 되는 보조 경로입니다.
              </p>
            </div>

            <Separator className="bg-border/80" />

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="border-border/70 bg-card/50">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">접근</div>
                  <div className="mt-2 text-sm font-medium">게스트 우선</div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card/50">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">권한</div>
                  <div className="mt-2 text-sm font-medium">관리자만 역할 관리</div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card/50">
                <CardContent className="p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">업로드</div>
                  <div className="mt-2 text-sm font-medium">공용 사용 가능</div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 bg-card/50">
              <CardHeader>
                <CardTitle>안내</CardTitle>
                <CardDescription>로그인은 관리자 기능을 쓸 때만 사용하세요.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>1. 기본 대시보드는 로그인 없이 바로 볼 수 있습니다.</p>
                <p>2. 역할 관리가 필요할 때만 Supabase Auth로 로그인하세요.</p>
                <p>3. 첫 admin이 없다면 SQL Editor에서 한 번만 지정하면 됩니다.</p>
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
                  <CardTitle>비로그인 모드</CardTitle>
                  <CardDescription>
                    Supabase Auth가 설정되지 않아 로그인 없이 공용 모드로 사용 중입니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-muted-foreground">
                  <p>지금은 업로드, 조회, 대시보드 모두 바로 사용할 수 있습니다.</p>
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

