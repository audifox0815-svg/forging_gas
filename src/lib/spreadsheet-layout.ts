import * as XLSX from "xlsx";

import { DATASET_CONFIGS, LINE_CODES, PRODUCT_BENCHMARKS, type DatasetKind } from "@/lib/domain";

export interface SpreadsheetColumnOption {
  header: string;
  letter: string;
  index: number;
  sample: string;
  unitWarning?: string;
}

export interface SpreadsheetTableLayout {
  sheetName: string;
  matrix: unknown[][];
  headerRowIndex: number;
  headerDepth: number;
  dataStartRowIndex: number;
  headers: string[];
  availableColumns: SpreadsheetColumnOption[];
  suggestedMapping: Record<string, string>;
  sampleRows: Array<Record<string, string>>;
  matchedFields: number;
  matchedRequiredFields: number;
  totalFields: number;
  score: number;
}

interface DatasetHeaderScore {
  mapping: Record<string, string>;
  matchedFields: number;
  matchedRequiredFields: number;
  totalFields: number;
  score: number;
}

const HEADER_ALIASES: Record<DatasetKind, Record<string, string[]>> = {
  production: {
    ym: ["ym", "년월", "월", "집계월", "기준월", "month", "yyyymm", "대상월"],
    line: ["line", "라인", "라인명", "프레스라인", "pressline", "press line", "호기"],
    product: ["product", "제품", "품명", "제품명", "item", "품목"],
    material: ["material", "재질", "소재", "자재", "강종"],
    weight_ton: ["weight_ton", "생산량", "중량", "톤", "weight", "qty", "실적"],
    work_hours: ["work_hours", "가동시간", "작업시간", "시간", "공수", "근무시간"],
    plan_ton: ["plan_ton", "목표", "계획", "목표량", "계획량", "plan"],
  },
  gas: {
    ym: ["ym", "년월", "월", "집계월", "기준월", "month", "yyyymm", "대상월"],
    furnace_no: ["furnace_no", "호기", "가열로", "furnace", "furnace no", "번호", "설비번호"],
    line: ["line", "라인", "라인명", "pressline", "press line"],
    usage_m3: ["usage_m3", "사용량", "가스사용량", "검침", "검침량", "m3", "㎥", "사용량(m3)"],
    basis: ["basis", "기준", "고지", "자체", "검침기준"],
  },
};

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

export function stringifyCell(value: unknown): string {
  if (isBlank(value)) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

export function normalizeHeaderToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_\-./()[\]{}]+/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

function getColumnUnitWarning(header: string): string | undefined {
  const normalized = normalizeHeaderToken(header);

  if ((normalized.includes("ton") || normalized.includes("생산량")) && normalized.includes("kg")) {
    return "이 열은 kg로 보입니다. 템플릿은 톤 기준입니다.";
  }

  if (normalized.includes("시간") && (normalized.includes("min") || normalized.includes("분"))) {
    return "이 열은 분으로 보입니다. 템플릿은 시간 기준입니다.";
  }

  if ((normalized.includes("usage") || normalized.includes("가스")) && normalized.includes("l")) {
    return "이 열은 L로 보입니다. 템플릿은 m³ 기준입니다.";
  }

  return undefined;
}

export function buildSheetMatrix(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
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

export function buildCombinedHeaders(matrix: unknown[][], headerRowIndex: number, headerDepth: number): string[] {
  const maxColumns = matrix.reduce((max, row) => Math.max(max, row.length), 0);

  return Array.from({ length: maxColumns }, (_, columnIndex) => {
    const parts: string[] = [];

    for (let offset = 0; offset < headerDepth; offset += 1) {
      const row = matrix[headerRowIndex + offset] ?? [];
      const cell = stringifyCell(row[columnIndex]);
      if (cell) {
        parts.push(cell);
      }
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
  });
}

function collectNonEmptyRows(rows: unknown[][], startIndex: number, limit: number): unknown[][] {
  const result: unknown[][] = [];

  for (let index = startIndex; index < rows.length && result.length < limit; index += 1) {
    const row = rows[index] ?? [];
    if (row.some((cell) => !isBlank(cell))) {
      result.push(row);
    }
  }

  return result;
}

function buildColumnSamples(rows: unknown[][], dataStartRowIndex: number, columnCount: number, limit = 5): string[][] {
  const samples = Array.from({ length: columnCount }, () => [] as string[]);
  const dataRows = collectNonEmptyRows(rows, dataStartRowIndex, limit);

  for (const row of dataRows) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const cell = stringifyCell(row[columnIndex]);
      if (cell) {
        samples[columnIndex].push(cell);
      }
    }
  }

  return samples;
}

function parseNumericValue(value: string): number | null {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isYearMonthValue(value: string): boolean {
  return /^(20\d{2})[-./]?(0?[1-9]|1[0-2])$/.test(value) || /^(20\d{2})(0[1-9]|1[0-2])$/.test(value);
}

function isDateLikeValue(value: string): boolean {
  return /^(20\d{2})[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])/.test(value);
}

function isLineValue(value: string): boolean {
  const normalized = normalizeHeaderToken(value).toUpperCase().replace(/-/g, "");

  if (normalized === "P05") {
    return true;
  }

  return LINE_CODES.includes(normalized as (typeof LINE_CODES)[number]);
}

function isFurnaceValue(value: string): boolean {
  const parsed = parseNumericValue(value);

  return parsed !== null && Number.isInteger(parsed) && parsed >= 1 && parsed <= 20;
}

function isBasisValue(value: string): boolean {
  const normalized = normalizeHeaderToken(value);

  return normalized.includes("고지") || normalized.includes("자체") || normalized.includes("notice") || normalized.includes("self");
}

function isKnownProductValue(value: string): boolean {
  const normalized = normalizeHeaderToken(value);

  return Object.keys(PRODUCT_BENCHMARKS).some((product) => normalizeHeaderToken(product) === normalized);
}

function looksLikeMaterialValue(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").toUpperCase();

  return /^(SCM|SKD|SKH|SNCM|SNB|S45C|S50C|S20C|FC|FCD|FC25|SUS|SM|SS|SC|ST|SN|SF|SCr|SUJ|SB)\d*[A-Z0-9-]*$/.test(
    normalized
  ) || /^[A-Z]{1,6}\d{1,4}[A-Z0-9-]*$/.test(normalized);
}

function scoreFieldValueEvidence(fieldKey: string, samples: string[]): number {
  const relevantSamples = samples.filter((sample) => !isBlank(sample));

  if (relevantSamples.length === 0) {
    return 0;
  }

  let score = 0;
  let matchedSamples = 0;

  for (const sample of relevantSamples) {
    const text = sample.trim();
    const parsedNumber = parseNumericValue(text);

    switch (fieldKey) {
      case "ym":
        if (isYearMonthValue(text) || isDateLikeValue(text)) {
          score += 6;
          matchedSamples += 1;
        } else if (parsedNumber !== null) {
          score -= 1;
        }
        break;
      case "line":
        if (isLineValue(text)) {
          score += 6;
          matchedSamples += 1;
        } else if (parsedNumber !== null) {
          score -= 1;
        }
        break;
      case "furnace_no":
        if (isFurnaceValue(text)) {
          score += 6;
          matchedSamples += 1;
        } else if (parsedNumber !== null) {
          score -= 1;
        }
        break;
      case "basis":
        if (isBasisValue(text)) {
          score += 6;
          matchedSamples += 1;
        } else if (text) {
          score -= 1;
        }
        break;
      case "product":
        if (isKnownProductValue(text)) {
          score += 5;
          matchedSamples += 1;
        } else if (/^[\p{Script=Hangul}\s]+$/u.test(text)) {
          score += 2;
        } else if (parsedNumber !== null) {
          score -= 1;
        }
        break;
      case "material":
        if (looksLikeMaterialValue(text)) {
          score += 5;
          matchedSamples += 1;
        } else if (/^[A-Za-z0-9]+$/.test(text)) {
          score += 1;
        } else if (parsedNumber !== null) {
          score -= 1;
        }
        break;
      case "work_hours":
        if (parsedNumber !== null && parsedNumber >= 0 && parsedNumber <= 744) {
          score += 4;
          matchedSamples += 1;
          if (parsedNumber <= 100) {
            score += 1;
          }

          if (!Number.isInteger(parsedNumber)) {
            score += 1;
          }
        } else if (parsedNumber !== null) {
          score -= 1;
        }
        break;
      case "usage_m3":
      case "weight_ton":
      case "plan_ton":
        if (parsedNumber !== null && parsedNumber >= 0) {
          score += 3;
          matchedSamples += 1;

          if (parsedNumber > 1000) {
            score += 1;
          }

          if (!Number.isInteger(parsedNumber)) {
            score += 1;
          }
        } else if (parsedNumber !== null) {
          score -= 1;
        }
        break;
      default:
        break;
    }
  }

  if (matchedSamples === 0) {
    return 0;
  }

  if (matchedSamples === relevantSamples.length) {
    score += 4;
  } else if (matchedSamples / relevantSamples.length >= 0.8) {
    score += 2;
  }

  return Math.max(score, 0);
}

function buildColumnOptions(headers: string[], rows: unknown[][], dataStartRowIndex: number): SpreadsheetColumnOption[] {
  const sampleRow = collectNonEmptyRows(rows, dataStartRowIndex, 1)[0] ?? [];

  return headers.map((header, index) => ({
    header: header || `열${index + 1}`,
    letter: XLSX.utils.encode_col(index),
    index,
    sample: stringifyCell(sampleRow[index]),
    unitWarning: header ? getColumnUnitWarning(header) : "빈 열입니다.",
  }));
}

function buildSampleRows(headers: string[], rows: unknown[][], dataStartRowIndex: number): Array<Record<string, string>> {
  return collectNonEmptyRows(rows, dataStartRowIndex, 5).map((row) => {
    const preview: Record<string, string> = {};

    headers.forEach((header, columnIndex) => {
      preview[header || `열${columnIndex + 1}`] = stringifyCell(row[columnIndex]);
    });

    return preview;
  });
}

function scoreHeaderMatch(header: string, alias: string): number {
  const normalizedHeader = normalizeHeaderToken(header);
  const normalizedAlias = normalizeHeaderToken(alias);

  if (!normalizedHeader || !normalizedAlias) {
    return 0;
  }

  if (normalizedHeader === normalizedAlias) {
    return 3;
  }

  if (normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)) {
    return 2;
  }

  return 0;
}

function buildUniqueMapping(
  headers: string[],
  dataset: DatasetKind,
  rows: unknown[][] = [],
  dataStartRowIndex = 0
): DatasetHeaderScore {
  const config = DATASET_CONFIGS[dataset];
  const normalizedHeaders = headers.map((header, index) => ({
    header,
    index,
    normalized: normalizeHeaderToken(header),
  }));
  const columnSamples = buildColumnSamples(rows, dataStartRowIndex, headers.length);
  const mapping: Record<string, string> = {};
  const usedIndexes = new Set<number>();
  const orderedFields = [...config.fields].sort((left, right) => Number(right.required) - Number(left.required));

  for (const field of orderedFields) {
    const aliases = HEADER_ALIASES[dataset][field.key] ?? [field.key];
    const matches = normalizedHeaders
      .map(({ header, index, normalized }) => {
        const bestScore = aliases.reduce((score, alias) => Math.max(score, scoreHeaderMatch(normalized, alias)), 0);
        const valueScore = scoreFieldValueEvidence(field.key, columnSamples[index] ?? []);
        return { header, index, score: bestScore * 100 + valueScore };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);

    const chosen = matches.find((item) => !usedIndexes.has(item.index));

    if (chosen) {
      mapping[field.key] = chosen.header;
      usedIndexes.add(chosen.index);
    }
  }

  const matchedFields = Object.keys(mapping).length;
  const matchedRequiredFields = config.fields.filter((field) => field.required && mapping[field.key]).length;
  const totalFields = config.fields.length;

  return {
    mapping,
    matchedFields,
    matchedRequiredFields,
    totalFields,
    score: matchedRequiredFields * 1000 + matchedFields * 100,
  };
}

function getNonEmptyHeaderCount(headers: string[]): number {
  return headers.filter((header) => !isBlank(header)).length;
}

function getDataDensity(headers: string[], rows: unknown[][], dataStartRowIndex: number): number {
  const dataRows = collectNonEmptyRows(rows, dataStartRowIndex, 5);

  if (dataRows.length === 0) {
    return 0;
  }

  const width = Math.max(headers.length, 1);
  const densityTotal = dataRows.reduce((sum, row) => {
    const filled = row.reduce<number>((count, cell) => (isBlank(cell) ? count : count + 1), 0);
    return sum + filled / width;
  }, 0);

  return densityTotal / dataRows.length;
}

function scoreHeaderShape(matrix: unknown[][], headerRowIndex: number, headerDepth: number): number {
  let textCells = 0;
  let dataLikeCells = 0;
  let nonEmptyCells = 0;

  for (let offset = 0; offset < headerDepth; offset += 1) {
    const row = matrix[headerRowIndex + offset] ?? [];

    for (const cell of row) {
      const text = stringifyCell(cell);

      if (!text) {
        continue;
      }

      nonEmptyCells += 1;

      if (
        parseNumericValue(text) !== null ||
        isYearMonthValue(text) ||
        isDateLikeValue(text) ||
        isLineValue(text) ||
        isFurnaceValue(text) ||
        isBasisValue(text)
      ) {
        dataLikeCells += 1;
      } else {
        textCells += 1;
      }
    }
  }

  if (nonEmptyCells === 0) {
    return 0;
  }

  return textCells * 6 + Math.min(nonEmptyCells, 10) * 2 - dataLikeCells * 12;
}

function scoreLayoutCandidate(
  headers: string[],
  rows: unknown[][],
  dataset: DatasetKind,
  headerRowIndex: number,
  headerDepth: number
): DatasetHeaderScore & { score: number } {
  const dataStartRowIndex = headerRowIndex + headerDepth;
  const headerScore = buildUniqueMapping(headers, dataset, rows, dataStartRowIndex);
  const nonEmptyHeaderCount = getNonEmptyHeaderCount(headers);
  const density = getDataDensity(headers, rows, dataStartRowIndex);
  const headerShapeScore = scoreHeaderShape(rows, headerRowIndex, headerDepth);
  const depthPenalty = Math.max(0, headerDepth - 1) * 40;
  const headerPresenceScore = nonEmptyHeaderCount * 8;

  return {
    ...headerScore,
    score: headerScore.score + headerPresenceScore + density * 40 + headerShapeScore - depthPenalty,
  };
}

function findBestCandidateForSheet(
  matrix: unknown[][],
  dataset: DatasetKind
): {
  headerRowIndex: number;
  headerDepth: number;
  headers: string[];
  dataStartRowIndex: number;
  mapping: Record<string, string>;
  matchedFields: number;
  matchedRequiredFields: number;
  totalFields: number;
  score: number;
} {
  let bestCandidate: ReturnType<typeof scoreLayoutCandidate> | null = null;
  let bestHeaderRowIndex = 0;
  let bestHeaderDepth = 1;
  let bestHeaders: string[] = [];

  for (let headerRowIndex = 0; headerRowIndex < matrix.length; headerRowIndex += 1) {
    for (let headerDepth = 1; headerDepth <= 3 && headerRowIndex + headerDepth <= matrix.length; headerDepth += 1) {
      const headers = buildCombinedHeaders(matrix, headerRowIndex, headerDepth);
      if (headers.length === 0) {
        continue;
      }

      const candidate = scoreLayoutCandidate(headers, matrix, dataset, headerRowIndex, headerDepth);

      if (
        !bestCandidate ||
        candidate.score > bestCandidate.score ||
        (candidate.score === bestCandidate.score && candidate.matchedRequiredFields > bestCandidate.matchedRequiredFields) ||
        (candidate.score === bestCandidate.score &&
          candidate.matchedRequiredFields === bestCandidate.matchedRequiredFields &&
          candidate.matchedFields > bestCandidate.matchedFields)
      ) {
        bestCandidate = candidate;
        bestHeaderRowIndex = headerRowIndex;
        bestHeaderDepth = headerDepth;
        bestHeaders = headers;
      }
    }
  }

  const fallbackScore = buildUniqueMapping([], dataset);

  if (!bestCandidate) {
    return {
      headerRowIndex: 0,
      headerDepth: 1,
      headers: [],
      dataStartRowIndex: 1,
      mapping: buildUniqueMapping([], dataset).mapping,
      matchedFields: fallbackScore.matchedFields,
      matchedRequiredFields: fallbackScore.matchedRequiredFields,
      totalFields: fallbackScore.totalFields,
      score: fallbackScore.score,
    };
  }

  return {
    headerRowIndex: bestHeaderRowIndex,
    headerDepth: bestHeaderDepth,
    headers: bestHeaders,
    dataStartRowIndex: bestHeaderRowIndex + bestHeaderDepth,
    mapping: bestCandidate.mapping,
    matchedFields: bestCandidate.matchedFields,
    matchedRequiredFields: bestCandidate.matchedRequiredFields,
    totalFields: bestCandidate.totalFields,
    score: bestCandidate.score,
  };
}

export function findBestTableLayout(
  workbook: XLSX.WorkBook,
  dataset: DatasetKind,
  requestedSheet?: string
): SpreadsheetTableLayout {
  const sheetNames =
    requestedSheet && workbook.SheetNames.includes(requestedSheet) ? [requestedSheet] : workbook.SheetNames;

  let bestLayout: SpreadsheetTableLayout | null = null;

  for (const sheetName of sheetNames) {
    const matrix = buildSheetMatrix(workbook, sheetName);
    const candidate = findBestCandidateForSheet(matrix, dataset);
    const availableColumns = buildColumnOptions(candidate.headers, matrix, candidate.dataStartRowIndex);
    const sampleRows = buildSampleRows(candidate.headers, matrix, candidate.dataStartRowIndex);

    const layout: SpreadsheetTableLayout = {
      sheetName,
      matrix,
      headerRowIndex: candidate.headerRowIndex,
      headerDepth: candidate.headerDepth,
      dataStartRowIndex: candidate.dataStartRowIndex,
      headers: candidate.headers,
      availableColumns,
      suggestedMapping: candidate.mapping,
      sampleRows,
      matchedFields: candidate.matchedFields,
      matchedRequiredFields: candidate.matchedRequiredFields,
      totalFields: candidate.totalFields,
      score: candidate.score,
    };

    if (!bestLayout || layout.score > bestLayout.score) {
      bestLayout = layout;
    }
  }

  return (
    bestLayout ?? {
      sheetName: workbook.SheetNames[0] ?? "",
      matrix: [],
      headerRowIndex: 0,
      headerDepth: 1,
      dataStartRowIndex: 1,
      headers: [],
      availableColumns: [],
      suggestedMapping: buildUniqueMapping([], dataset).mapping,
      sampleRows: [],
      matchedFields: 0,
      matchedRequiredFields: 0,
      totalFields: DATASET_CONFIGS[dataset].fields.length,
      score: 0,
    }
  );
}
