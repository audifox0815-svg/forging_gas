import { NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/dashboard";
import { type DatasetKind, DATASET_KINDS } from "@/lib/domain";
import { getCurrentUser, hasSupabaseAuthConfig } from "@/lib/supabase-auth";
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
  if (hasSupabaseAuthConfig()) {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 }
      );
    }
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const dataset = parseDataset(formData.get("dataset")?.toString() ?? null);
  const mode = parseMode(formData.get("mode")?.toString() ?? null);
  const sheetName = formData.get("sheetName")?.toString() || undefined;

  if (!dataset) {
    return NextResponse.json(
      { ok: false, message: "업로드 종류를 확인할 수 없습니다." },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: "엑셀 파일을 찾지 못했습니다." },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return NextResponse.json(
      { ok: false, message: "파일이 너무 큽니다. 16MB 이하 파일로 업로드해주세요." },
      { status: 413 }
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
      { ok: false, message: "컬럼 매핑을 읽지 못했습니다." },
      { status: 400 }
    );
  }

  const result = parseWorkbookRows(buffer, dataset, mapping, sheetName);
  const errors = result.warnings.filter((issue) => issue.severity === "error");

  if (errors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        mode,
        preview: result.preview,
        issues: result.warnings,
        message: "검증에 실패했습니다. 셀 위치를 확인해주세요.",
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
  });
}
