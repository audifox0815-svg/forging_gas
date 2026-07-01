"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { hasSupabaseAuthConfig, createSupabaseServerClient } from "@/lib/supabase-auth";

export interface AuthFormState {
  message: string | null;
  fieldErrors: {
    email?: string[];
    password?: string[];
  };
}

const authSchema = z.object({
  email: z.email({ error: "올바른 이메일 주소를 입력해 주세요." }).trim(),
  password: z.string().min(1, { error: "비밀번호를 입력해 주세요." }),
});

function createDefaultState(message: string | null = null): AuthFormState {
  return {
    message,
    fieldErrors: {},
  };
}

export async function signInAction(
  _previousState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  if (!hasSupabaseAuthConfig()) {
    return createDefaultState("Supabase Auth 환경변수가 아직 설정되지 않았습니다.");
  }

  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      message: "입력값을 확인해 주세요.",
      fieldErrors: {
        email: errors.email ?? [],
        password: errors.password ?? [],
      },
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return createDefaultState("Supabase 서버 클라이언트를 만들지 못했습니다.");
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return createDefaultState(
      "로그인에 실패했습니다. 이메일 또는 비밀번호를 다시 확인해 주세요."
    );
  }

  revalidatePath("/");
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  revalidatePath("/");
  redirect("/login");
}

