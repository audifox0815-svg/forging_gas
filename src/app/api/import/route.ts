import { NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/dashboard";
import { DATASET_KINDS, type DatasetKind } from "@/lib/domain";
import type { AppRole } from "@/lib/access";
import { canImportRole } from "@/lib/access";
import { getCurrentAuthContext, hasSupabaseAuthConfig } from "@/lib/supabase-auth";
import { buildWorkbookPreview, parseWorkbookRows } from "@/lib/workbook";
import { saveImportedRows } from "@/lib/store";

const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

function parseDataset(value: string | null): DatasetKind | null {
  if (!value) {
    return null;
  }

  return DATASET_KINDS.includes(value as DatasetKind) ? (value as DatasetKind) : null;
}

function parseMode(value: string | null): "preview" | "commit" {
  return value === "commit" ? "commit" : "preview";
}

export async function POST(request: Request) {
  let currentUserRole: AppRole | null = null;
  let hasAuthSession = false;

  if (hasSupabaseAuthConfig()) {
    const currentUser = await getCurrentAuthContext();

    if (currentUser) {
      hasAuthSession = true;
      currentUserRole = currentUser.role;
    }
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const dataset = parseDataset(formData.get("dataset")?.toString() ?? null);
  const mode = parseMode(formData.get("mode")?.toString() ?? null);
  const sheetName = formData.get("sheetName")?.toString() || undefined;

  if (!dataset) {
    return NextResponse.json(
      { ok: false, message: "지원하지 않는 업로드 형식입니다." },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: "업로드할 파일을 찾지 못했습니다." },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json(
      { ok: false, message: "파일이 너무 큽니다. 16MB 이하 파일로 업로드해 주세요." },
      { status: 413 }
    );
  }

  if (mode === "commit" && hasAuthSession && !canImportRole(currentUserRole)) {
    return NextResponse.json(
      {
        ok: false,
        message: "업로드 권한이 없습니다. 관리자 또는 담당자 계정으로 다시 시도해 주세요.",
      },
      { status: 403 }
    );
  }

  const buffer = await file.arrayBuffer();

  if (mode === "preview") {
    const preview = buildWorkbookPreview(buffer, dataset, sheetName);
    return NextResponse.json({
      ok: true,
      mode,
      preview,
    });
  }

  const mappingRaw = formData.get("mapping")?.toString() ?? "{}";

  let mapping: Record<string, string>;
  try {
    mapping = JSON.parse(mappingRaw) as Record<string, string>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "컬럼 매핑 JSON을 읽지 못했습니다." },
      { status: 400 }
    );
  }

  const result = parseWorkbookRows(buffer, dataset, mapping, sheetName);
  const errors = result.warnings.filter((issue) => issue.severity === "error");

  if (result.rows.length === 0 && errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        preview: result.preview,
        issues: result.warnings,
        message: "검증에 실패했습니다. 오류 위치를 확인해 주세요.",
      },
      { status: 422 }
    );
  }

  const summary = await saveImportedRows(dataset, result.rows, file.name, result.warnings);
  const snapshot = await getDashboardSnapshot();

  return NextResponse.json({
    ok: true,
    mode,
    summary,
    snapshot,
    preview: result.preview,
    issues: result.warnings,
    message:
      errors.length > 0 && result.rows.length > 0
        ? `일부 행은 건너뛰고 ${summary.inserted}건을 적재했습니다.`
        : undefined,
  });
}
