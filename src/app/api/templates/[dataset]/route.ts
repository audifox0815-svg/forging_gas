import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { DATASET_KINDS, type DatasetKind } from "@/lib/domain";
import { buildTemplateWorkbook, getTemplateFileName } from "@/lib/template-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDataset(value: string): DatasetKind | null {
  return DATASET_KINDS.includes(value as DatasetKind) ? (value as DatasetKind) : null;
}

function buildContentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset: datasetParam } = await params;
  const dataset = parseDataset(datasetParam);

  if (!dataset) {
    return NextResponse.json(
      { ok: false, message: "지원하지 않는 템플릿입니다." },
      { status: 404 }
    );
  }

  const workbook = buildTemplateWorkbook(dataset);
  const buffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": buildContentDisposition(getTemplateFileName(dataset)),
      "Cache-Control": "no-store",
    },
  });
}
