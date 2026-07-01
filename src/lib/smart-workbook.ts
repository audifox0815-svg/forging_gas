import * as XLSX from "xlsx";

import {
  DATASET_CONFIGS,
  type DatasetKind,
  type ImportIssue,
} from "@/lib/domain";
import { findBestTableLayout, normalizeHeaderToken } from "@/lib/spreadsheet-layout";

export interface SmartWorkbookColumnOption {
  header: string;
  letter: string;
  index: number;
  sample: string;
  unitWarning?: string;
}

export interface SmartWorkbookFieldMapping {
  key: string;
  label: string;
  sourceHeader: string | null;
  sample: string;
  required: boolean;
  unit?: string;
  unitWarning?: string;
}

export interface SmartWorkbookAnalysis {
  sheetNames: string[];
  selectedSheet: string;
  headerRowIndex: number;
  headerDepth: number;
  dataStartRowIndex: number;
  headers: string[];
  availableColumns: SmartWorkbookColumnOption[];
  detectedDataset: DatasetKind;
  dataset: DatasetKind;
  confidence: number;
  matchedFields: number;
  totalFields: number;
  suggestedMapping: Record<string, string>;
  fieldMappings: SmartWorkbookFieldMapping[];
  standardizedRows: Array<Record<string, string>>;
  sampleRows: Array<Record<string, string>>;
  warnings: ImportIssue[];
}

function getHeaderWarning(header: string, fieldKey: string): string | undefined {
  const normalized = normalizeHeaderToken(header);

  if (fieldKey === "weight_ton" && (normalized.includes("kg") || normalized.includes("킬로"))) {
    return "이 열은 kg로 보입니다. 템플릿은 톤 기준입니다.";
  }

  if (fieldKey === "work_hours" && (normalized.includes("min") || normalized.includes("분"))) {
    return "이 열은 분으로 보입니다. 템플릿은 시간 기준입니다.";
  }

  if (fieldKey === "usage_m3" && (normalized.includes("l") || normalized.includes("리터"))) {
    return "이 열은 L로 보입니다. 템플릿은 m³ 기준입니다.";
  }

  return undefined;
}

function buildFieldMappings(
  dataset: DatasetKind,
  sampleRow: Record<string, string>,
  mapping: Record<string, string>
): SmartWorkbookFieldMapping[] {
  const config = DATASET_CONFIGS[dataset];

  return config.fields.map((field) => {
    const sourceHeader = mapping[field.key] ?? null;

    return {
      key: field.key,
      label: field.label,
      sourceHeader,
      sample: sourceHeader ? sampleRow[sourceHeader] ?? "" : "",
      required: field.required,
      unit: field.unit,
      unitWarning: sourceHeader ? getHeaderWarning(sourceHeader, field.key) : undefined,
    };
  });
}

function buildStandardizedRows(
  fieldMappings: SmartWorkbookFieldMapping[],
  sampleRows: Array<Record<string, string>>
): Array<Record<string, string>> {
  return sampleRows.slice(0, 3).map((row) => {
    const normalized: Record<string, string> = {};

    fieldMappings.forEach((field) => {
      normalized[field.label] = field.sourceHeader ? row[field.sourceHeader] ?? "" : "";
    });

    return normalized;
  });
}

export async function analyzeSmartWorkbook(
  file: File,
  preferredDataset: DatasetKind | null = null,
  requestedSheet?: string
): Promise<SmartWorkbookAnalysis> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    cellDates: true,
    type: "array",
  });

  const detectedProductionLayout = findBestTableLayout(workbook, "production", requestedSheet);
  const detectedGasLayout = findBestTableLayout(workbook, "gas", requestedSheet);
  const detectedLayout =
    detectedProductionLayout.score >= detectedGasLayout.score ? detectedProductionLayout : detectedGasLayout;
  const detectedDataset: DatasetKind =
    detectedProductionLayout.score >= detectedGasLayout.score ? "production" : "gas";
  const appliedDataset: DatasetKind = preferredDataset ?? detectedDataset;
  const appliedLayout =
    preferredDataset === null
      ? detectedLayout
      : findBestTableLayout(workbook, preferredDataset, requestedSheet);

  const headers = appliedLayout.headers;
  const availableColumns = appliedLayout.availableColumns;
  const sampleRows = appliedLayout.sampleRows;
  const suggestedMapping = appliedLayout.suggestedMapping;
  const firstSampleRow = sampleRows[0] ?? {};
  const fieldMappings = buildFieldMappings(appliedDataset, firstSampleRow, suggestedMapping);
  const standardizedRows = buildStandardizedRows(fieldMappings, sampleRows);
  const confidence = Math.round(
    (detectedLayout.matchedFields / Math.max(detectedLayout.totalFields, 1)) * 100
  );

  const warnings: ImportIssue[] = [];

  if (requestedSheet && !workbook.SheetNames.includes(requestedSheet)) {
    warnings.push({
      severity: "warning",
      message: "선택한 시트를 찾지 못해 가장 적절한 시트를 자동으로 골랐습니다.",
    });
  }

  if (detectedLayout.headerDepth > 1) {
    warnings.push({
      severity: "warning",
      message: `헤더가 ${detectedLayout.headerDepth}줄이라 합쳐서 읽었습니다.`,
    });
  }

  if (detectedLayout.matchedFields === 0) {
    warnings.push({
      severity: "warning",
      message: "자동 인식을 확실하게 하지 못했습니다. 아래 수동 탭으로 확인해 주세요.",
    });
  } else if (preferredDataset && preferredDataset !== detectedDataset) {
    warnings.push({
      severity: "warning",
      message: `브라우저는 ${DATASET_CONFIGS[detectedDataset].title}로 추정하지만, 현재 ${DATASET_CONFIGS[preferredDataset].title} 형식으로 변환 중입니다.`,
    });
  }

  if (detectedLayout.matchedFields / Math.max(detectedLayout.totalFields, 1) < 0.6) {
    warnings.push({
      severity: "warning",
      message: "자동 인식 정확도가 낮습니다. 시트를 바꾸거나 수동 탭에서 매핑을 확인해 주세요.",
    });
  }

  return {
    sheetNames: workbook.SheetNames,
    selectedSheet: appliedLayout.sheetName,
    headerRowIndex: appliedLayout.headerRowIndex,
    headerDepth: appliedLayout.headerDepth,
    dataStartRowIndex: appliedLayout.dataStartRowIndex,
    headers,
    availableColumns,
    detectedDataset,
    dataset: appliedDataset,
    confidence,
    matchedFields: appliedLayout.matchedFields,
    totalFields: appliedLayout.totalFields,
    suggestedMapping,
    fieldMappings,
    standardizedRows,
    sampleRows,
    warnings,
  };
}
