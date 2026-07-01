import * as XLSX from "xlsx";

import {
  DATASET_CONFIGS,
  type DatasetKind,
  type ImportIssue,
} from "@/lib/domain";

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

type DatasetScore = {
  dataset: DatasetKind;
  mapping: Record<string, string>;
  matchedFields: number;
  matchedRequiredFields: number;
  totalFields: number;
  score: number;
};

const FIELD_ALIASES: Record<DatasetKind, Record<string, string[]>> = {
  production: {
    ym: ["ym", "월", "기준월", "기준일자", "month", "yyyymm"],
    line: ["line", "라인", "호기", "pressline", "press line"],
    product: ["product", "제품", "품명", "제품명", "item"],
    material: ["material", "재질", "소재", "자재"],
    weight_ton: ["weight_ton", "생산량", "중량", "톤", "weight", "qty"],
    work_hours: ["work_hours", "가동시간", "작업시간", "시간", "공수"],
    plan_ton: ["plan_ton", "목표", "계획", "plan"],
  },
  gas: {
    ym: ["ym", "월", "기준월", "기준일자", "month", "yyyymm"],
    furnace_no: ["furnace_no", "가열로", "호기", "furnace", "furnace no"],
    line: ["line", "라인", "호기", "pressline", "press line"],
    usage_m3: ["usage_m3", "사용량", "가스사용량", "검침", "m3", "㎥"],
    basis: ["basis", "기준", "고지", "자체"],
  },
};

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function stringifyCell(value: unknown): string {
  if (isBlank(value)) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function normalizeHeaderToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_\-./()[\]{}]+/g, "")
    .replace(/[^0-9a-z가-힣]+/gi, "");
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

function findHeaderRow(matrix: unknown[][]): number {
  let bestIndex = 0;
  let bestScore = -1;

  matrix.slice(0, 10).forEach((row, index) => {
    const score = row.reduce<number>((sum, cell) => (isBlank(cell) ? sum : sum + 1), 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function buildSheetMatrix(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json(sheet, {
    blankrows: false,
    defval: "",
    header: 1,
  }) as unknown[][];
}

function pickBestSheet(workbook: XLSX.WorkBook): { sheetName: string; matrix: unknown[][]; headerRowIndex: number } {
  const scored = workbook.SheetNames.map((sheetName) => {
    const matrix = buildSheetMatrix(workbook, sheetName);
    const headerRowIndex = findHeaderRow(matrix);
    const score =
      matrix[headerRowIndex]?.reduce<number>((sum, cell) => (isBlank(cell) ? sum : sum + 1), 0) ?? 0;

    return { sheetName, matrix, headerRowIndex, score };
  });

  scored.sort((left, right) => right.score - left.score);
  const best = scored[0] ?? { sheetName: workbook.SheetNames[0] ?? "", matrix: [], headerRowIndex: 0, score: 0 };

  return {
    sheetName: best.sheetName,
    matrix: best.matrix,
    headerRowIndex: best.headerRowIndex,
  };
}

function buildSampleRows(headers: string[], rows: unknown[][], startRowIndex: number): Array<Record<string, string>> {
  return rows.slice(startRowIndex, startRowIndex + 5).map((row) => {
    const preview: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      preview[header || `열${columnIndex + 1}`] = stringifyCell(row[columnIndex]);
    });

    return preview;
  });
}

function buildColumnOptions(headers: string[], rows: unknown[][], headerRowIndex: number): SmartWorkbookColumnOption[] {
  const dataRow = rows[headerRowIndex + 1] ?? [];

  return headers.map((header, index) => ({
    header: header || `열${index + 1}`,
    letter: XLSX.utils.encode_col(index),
    index,
    sample: stringifyCell(dataRow[index]),
    unitWarning: header ? undefined : "빈 열입니다.",
  }));
}

function scoreDataset(headers: string[], dataset: DatasetKind): DatasetScore {
  const config = DATASET_CONFIGS[dataset];
  const normalizedHeaders = headers.map((header) => ({
    header,
    normalized: normalizeHeaderToken(header),
  }));

  const mapping: Record<string, string> = {};
  let matchedFields = 0;
  let matchedRequiredFields = 0;

  for (const field of config.fields) {
    const aliases = FIELD_ALIASES[dataset][field.key] ?? [field.key];
    const matched = normalizedHeaders.find(({ normalized }) =>
      aliases.some((alias) => {
        const aliasToken = normalizeHeaderToken(alias);
        return (
          normalized === aliasToken ||
          normalized.includes(aliasToken) ||
          aliasToken.includes(normalized)
        );
      })
    );

    if (matched?.header) {
      mapping[field.key] = matched.header;
      matchedFields += 1;
      if (field.required) {
        matchedRequiredFields += 1;
      }
    }
  }

  const totalFields = config.fields.length;
  const score = matchedRequiredFields * 2 + matchedFields;

  return {
    dataset,
    mapping,
    matchedFields,
    matchedRequiredFields,
    totalFields,
    score,
  };
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

function chooseDataset(headers: string[], preferredDataset: DatasetKind | null) {
  const scores = (["production", "gas"] as const).map((dataset) => scoreDataset(headers, dataset));
  scores.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (right.matchedRequiredFields !== left.matchedRequiredFields) {
      return right.matchedRequiredFields - left.matchedRequiredFields;
    }

    return right.matchedFields - left.matchedFields;
  });

  const detected = scores[0] ?? scoreDataset(headers, "production");
  const dataset = preferredDataset ?? detected.dataset;

  return {
    dataset,
    detectedDataset: detected.dataset,
    detectedScore: detected,
    fallbackScore: scores.find((item) => item.dataset === dataset) ?? detected,
  };
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

  const { sheetName, matrix, headerRowIndex } =
    requestedSheet && workbook.SheetNames.includes(requestedSheet)
      ? {
          sheetName: requestedSheet,
          matrix: buildSheetMatrix(workbook, requestedSheet),
          headerRowIndex: findHeaderRow(buildSheetMatrix(workbook, requestedSheet)),
        }
      : pickBestSheet(workbook);

  const headers = (matrix[headerRowIndex] ?? []).map((cell, index) => stringifyCell(cell) || `열${index + 1}`);
  const availableColumns = buildColumnOptions(headers, matrix, headerRowIndex);
  const sampleRows = buildSampleRows(headers, matrix, headerRowIndex + 1);
  const { dataset, detectedDataset, detectedScore, fallbackScore } = chooseDataset(headers, preferredDataset);
  const suggestedMapping = fallbackScore.mapping;
  const firstSampleRow = sampleRows[0] ?? {};
  const fieldMappings = buildFieldMappings(dataset, firstSampleRow, suggestedMapping);
  const standardizedRows = buildStandardizedRows(fieldMappings, sampleRows);

  const warnings: ImportIssue[] = [];

  if (!workbook.SheetNames.includes(sheetName)) {
    warnings.push({
      severity: "warning",
      message: "선택한 시트를 찾지 못해 가장 적절한 시트를 자동으로 골랐습니다.",
    });
  }

  if (detectedScore.matchedFields === 0) {
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

  if (detectedScore.matchedFields / Math.max(detectedScore.totalFields, 1) < 0.6) {
    warnings.push({
      severity: "warning",
      message: "자동 인식 정확도가 낮습니다. 시트를 바꾸거나 수동 탭에서 매핑을 확인해 주세요.",
    });
  }

  return {
    sheetNames: workbook.SheetNames,
    selectedSheet: sheetName,
    headerRowIndex,
    headers,
    availableColumns,
    detectedDataset,
    dataset,
    confidence: Math.round((detectedScore.matchedFields / Math.max(detectedScore.totalFields, 1)) * 100),
    matchedFields: fallbackScore.matchedFields,
    totalFields: fallbackScore.totalFields,
    suggestedMapping,
    fieldMappings,
    standardizedRows,
    sampleRows,
    warnings,
  };
}
