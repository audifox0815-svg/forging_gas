"use client";

import { useActionState } from "react";

import { signInAction, type AuthFormState } from "@/app/actions/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TriangleAlert } from "lucide-react";

const initialState: AuthFormState = {
  message: null,
  fieldErrors: {},
};

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return <p className="text-xs text-destructive">{errors.join(" · ")}</p>;
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <Card className="border-border/70 bg-card/85 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur">
      <CardHeader>
        <CardTitle>운영자 로그인</CardTitle>
        <CardDescription>
          Supabase Auth로 연결된 계정으로 로그인하면 업로드와 대시보드를 사용할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.message ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>로그인 안내</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" name="email" type="email" placeholder="operator@company.com" />
            <FieldErrors errors={state.fieldErrors.email} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" name="password" type="password" placeholder="비밀번호" />
            <FieldErrors errors={state.fieldErrors.password} />
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "로그인 중..." : "로그인"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

