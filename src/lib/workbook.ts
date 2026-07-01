import "server-only";

import * as XLSX from "xlsx";

import {
  DATASET_CONFIGS,
  FURNACE_TO_LINE,
  LINE_CODES,
  type DatasetKind,
  type GasBasis,
  type GasReadingRecord,
  type ImportIssue,
  type LineCode,
  type ProductionRecord,
} from "@/lib/domain";
import { findBestTableLayout, type SpreadsheetTableLayout } from "@/lib/spreadsheet-layout";

export interface WorkbookColumnOption {
  header: string;
  letter: string;
  index: number;
  sample: string;
  unitWarning?: string;
}

export interface WorkbookPreview {
  sheetNames: string[];
  selectedSheet: string;
  headerRowIndex: number;
  headerDepth: number;
  dataStartRowIndex: number;
  headers: string[];
  availableColumns: WorkbookColumnOption[];
  suggestedMapping: Record<string, string>;
  sampleRows: Array<Record<string, string>>;
  warnings: ImportIssue[];
}

interface ResolvedColumn {
  key: string;
  header: string;
  index: number;
  letter: string;
  required: boolean;
  description: string;
}

interface ParseResult<T> {
  rows: T[];
  warnings: ImportIssue[];
}

type ResolvedColumnMap = Partial<Record<string, ResolvedColumn>>;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function stringifyCell(value: unknown): string {
  if (isBlank(value)) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

function isLikelyYearMonth(value: string): boolean {
  return /^(20\d{2})[-./]?(0?[1-9]|1[0-2])$/.test(value) || /^(20\d{2})(0[1-9]|1[0-2])$/.test(value);
}

function toYearMonth(value: unknown): string | null {
  if (isBlank(value)) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  const text = stringifyCell(value).replace(/\s+/g, "");

  if (isLikelyYearMonth(text)) {
    const match = text.match(/^(20\d{2})[-./]?(0?[1-9]|1[0-2])$/) ?? text.match(/^(20\d{2})(0[1-9]|1[0-2])$/);
    if (!match) {
      return null;
    }

    return `${match[1]}-${String(match[2]).padStart(2, "0")}`;
  }

  if (/^\d{4}[-./]\d{1,2}$/.test(text)) {
    const [year, month] = text.split(/[-./]/);
    return `${year}-${String(Number(month)).padStart(2, "0")}`;
  }

  return null;
}

function toLine(value: unknown): LineCode | null {
  if (isBlank(value)) {
    return null;
  }

  const text = stringifyCell(value)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (text === "P05") {
    return "P5";
  }

  if (LINE_CODES.includes(text as LineCode)) {
    return text as LineCode;
  }

  if (text.startsWith("P15")) {
    return "P15";
  }

  if (text === "RM" || text === "R/M") {
    return "RM";
  }

  if (text === "P5" || text === "P8") {
    return text as LineCode;
  }

  return null;
}

function toBasis(value: unknown): GasBasis | null {
  if (isBlank(value)) {
    return null;
  }

  const text = stringifyCell(value).toLowerCase();

  if (text.includes("고지") || text.includes("notice")) {
    return "고지";
  }

  if (text.includes("자체") || text.includes("self")) {
    return "자체";
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (isBlank(value)) {
    return null;
  }

  const normalized = stringifyCell(value).replace(/,/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function resolveMapping(
  dataset: DatasetKind,
  headers: string[],
  mapping: Record<string, string>
): { columns: ResolvedColumn[]; issues: ImportIssue[] } {
  const config = DATASET_CONFIGS[dataset];
  const headerToIndex = new Map<string, number>();

  headers.forEach((header, index) => {
    headerToIndex.set(header, index);
  });

  const issues: ImportIssue[] = [];
  const seenIndexes = new Set<number>();
  const columns: ResolvedColumn[] = [];

  for (const field of config.fields) {
    const headerName = mapping[field.key];

    if (!headerName) {
      issues.push({
        severity: "error",
        field: field.key,
        message: `${field.label} 열이 매핑되지 않았습니다.`,
      });
      continue;
    }

    const index = headerToIndex.get(headerName);

    if (index === undefined) {
      issues.push({
        severity: "error",
        field: field.key,
        message: `${field.label} 열 "${headerName}"을(를) 찾을 수 없습니다.`,
      });
      continue;
    }

    if (seenIndexes.has(index)) {
      issues.push({
        severity: "error",
        field: field.key,
        message: `${headerName} 열이 중복 매핑되었습니다.`,
      });
      continue;
    }

    seenIndexes.add(index);
    columns.push({
      key: field.key,
      header: headerName,
      index,
      letter: XLSX.utils.encode_col(index),
      required: field.required,
      description: field.description,
    });
  }

  return { columns, issues };
}

function issue(
  severity: "error" | "warning",
  message: string,
  row?: number,
  cell?: string,
  field?: string
): ImportIssue {
  return { severity, message, row, cell, field };
}

function parseProductionRow(
  row: unknown[],
  rowNumber: number,
  columns: ResolvedColumnMap
): ParseResult<ProductionRecord> {
  const warnings: ImportIssue[] = [];
  const issues: ImportIssue[] = [];

  const ymCell = columns.ym!;
  const lineCell = columns.line!;
  const productCell = columns.product!;
  const materialCell = columns.material!;
  const weightCell = columns.weight_ton!;
  const workHoursCell = columns.work_hours!;
  const planCell = columns.plan_ton!;

  const ym = toYearMonth(row[ymCell.index]);
  const line = toLine(row[lineCell.index]);
  const product = stringifyCell(row[productCell.index]);
  const material = stringifyCell(row[materialCell.index]);
  const weightTon = toNumber(row[weightCell.index]);
  const workHours = toNumber(row[workHoursCell.index]);
  const planTon = toNumber(row[planCell.index]);

  if (!ym) {
    issues.push(issue("error", "년월은 YYYY-MM 형식이어야 합니다.", rowNumber, `${ymCell.letter}${rowNumber}`, "ym"));
  }

  if (!line) {
    issues.push(issue("error", "라인은 P5, P8, P15, RM 중 하나여야 합니다.", rowNumber, `${lineCell.letter}${rowNumber}`, "line"));
  }

  if (!product) {
    issues.push(issue("error", "제품명이 비어 있습니다.", rowNumber, `${productCell.letter}${rowNumber}`, "product"));
  }

  if (!material) {
    issues.push(issue("error", "재질이 비어 있습니다.", rowNumber, `${materialCell.letter}${rowNumber}`, "material"));
  }

  if (weightTon === null) {
    issues.push(issue("error", "생산량은 숫자여야 합니다.", rowNumber, `${weightCell.letter}${rowNumber}`, "weight_ton"));
  }

  if (workHours === null) {
    issues.push(issue("error", "가동시간은 숫자여야 합니다.", rowNumber, `${workHoursCell.letter}${rowNumber}`, "work_hours"));
  }

  if (planTon === null) {
    issues.push(issue("error", "목표량은 숫자여야 합니다.", rowNumber, `${planCell.letter}${rowNumber}`, "plan_ton"));
  }

  if ((weightTon ?? 0) > 5000) {
    warnings.push(
      issue(
        "warning",
        "생산량이 5,000톤을 넘습니다. kg를 입력한 것은 아닌지 확인하세요.",
        rowNumber,
        `${weightCell.letter}${rowNumber}`,
        "weight_ton"
      )
    );
  }

  if ((workHours ?? 0) > 744) {
    warnings.push(
      issue(
        "warning",
        "가동시간이 한 달 기준으로 너무 큽니다. 단위를 확인하세요.",
        rowNumber,
        `${workHoursCell.letter}${rowNumber}`,
        "work_hours"
      )
    );
  }

  if (issues.length > 0 || !ym || !line || !product || !material || weightTon === null || workHours === null || planTon === null) {
    return { rows: [], warnings: [...issues, ...warnings] };
  }

  return {
    rows: [
      {
        ym,
        line,
        product,
        material,
        weight_ton: weightTon,
        work_hours: workHours,
        plan_ton: planTon,
      },
    ],
    warnings,
  };
}

function parseGasRow(
  row: unknown[],
  rowNumber: number,
  columns: ResolvedColumnMap
): ParseResult<GasReadingRecord> {
  const warnings: ImportIssue[] = [];
  const issues: ImportIssue[] = [];

  const ymCell = columns.ym!;
  const furnaceCell = columns.furnace_no!;
  const lineCell = columns.line;
  const usageCell = columns.usage_m3!;
  const basisCell = columns.basis!;

  const ym = toYearMonth(row[ymCell.index]);
  const furnaceNo = toNumber(row[furnaceCell.index]);
  const lineInput = lineCell ? toLine(row[lineCell.index]) : null;
  const usageM3 = toNumber(row[usageCell.index]);
  const basis = toBasis(row[basisCell.index]);
  const derivedLine = furnaceNo ? FURNACE_TO_LINE[Math.trunc(furnaceNo)] : null;

  if (!ym) {
    issues.push(issue("error", "년월은 YYYY-MM 형식이어야 합니다.", rowNumber, `${ymCell.letter}${rowNumber}`, "ym"));
  }

  if (furnaceNo === null || furnaceNo <= 0 || !Number.isInteger(furnaceNo)) {
    issues.push(issue("error", "호기는 1 이상의 정수여야 합니다.", rowNumber, `${furnaceCell.letter}${rowNumber}`, "furnace_no"));
  }

  if (usageM3 === null) {
    issues.push(issue("error", "사용량은 숫자여야 합니다.", rowNumber, `${usageCell.letter}${rowNumber}`, "usage_m3"));
  }

  if (!basis) {
    issues.push(issue("error", "기준은 고지 또는 자체여야 합니다.", rowNumber, `${basisCell.letter}${rowNumber}`, "basis"));
  }

  const finalLine = lineInput ?? derivedLine;

  if (!finalLine) {
    issues.push(
      issue(
        "error",
        "라인을 판별할 수 없습니다.",
        rowNumber,
        `${(lineCell ?? furnaceCell).letter}${rowNumber}`,
        "line"
      )
    );
  }

  if (lineCell && lineInput && derivedLine && lineInput !== derivedLine) {
    warnings.push(
      issue(
        "warning",
        `호기 ${Math.trunc(furnaceNo ?? 0)}는 ${derivedLine} 라인으로 매핑됩니다. 입력된 라인(${lineInput})과 다릅니다.`,
        rowNumber,
        `${lineCell.letter}${rowNumber}`,
        "line"
      )
    );
  }

  if (usageM3 !== null && usageM3 < 0) {
    issues.push(issue("error", "사용량은 0 이상이어야 합니다.", rowNumber, `${usageCell.letter}${rowNumber}`, "usage_m3"));
  }

  if (issues.length > 0 || !ym || !furnaceNo || !basis || !finalLine || usageM3 === null) {
    return { rows: [], warnings: [...issues, ...warnings] };
  }

  return {
    rows: [
      {
        ym,
        furnace_no: Math.trunc(furnaceNo),
        line: finalLine,
        usage_m3: usageM3,
        basis,
      },
    ],
    warnings,
  };
}

function buildImportWarnings(
  layout: SpreadsheetTableLayout,
  workbook: XLSX.WorkBook,
  requestedSheet?: string
): ImportIssue[] {
  const warnings: ImportIssue[] = [];

  if (requestedSheet && !workbook.SheetNames.includes(requestedSheet)) {
    warnings.push(issue("warning", "선택한 시트를 찾지 못해 가장 적절한 시트를 사용했습니다."));
  }

  if (layout.headerDepth > 1) {
    warnings.push(issue("warning", `헤더가 ${layout.headerDepth}줄이라 합쳐서 읽었습니다.`));
  }

  if (layout.availableColumns.length === 0) {
    warnings.push(issue("warning", "표처럼 보이는 열을 찾지 못했습니다. 시트 구성을 다시 확인하세요."));
  }

  if (layout.matchedFields === 0) {
    warnings.push(issue("warning", "자동 인식을 확실하게 하지 못했습니다. 시트를 다시 확인해 주세요."));
  } else if (layout.matchedFields / Math.max(layout.totalFields, 1) < 0.6) {
    warnings.push(issue("warning", "자동 인식 정확도가 낮습니다. 시트 구조를 다시 확인해 주세요."));
  }

  return warnings;
}

function buildPreviewFromLayout(layout: SpreadsheetTableLayout, sheetNames: string[], warnings: ImportIssue[]): WorkbookPreview {
  return {
    sheetNames,
    selectedSheet: layout.sheetName,
    headerRowIndex: layout.headerRowIndex,
    headerDepth: layout.headerDepth,
    dataStartRowIndex: layout.dataStartRowIndex,
    headers: layout.headers,
    availableColumns: layout.availableColumns,
    suggestedMapping: layout.suggestedMapping,
    sampleRows: layout.sampleRows,
    warnings,
  };
}

export function analyzeWorkbook(buffer: ArrayBuffer, dataset: DatasetKind, requestedSheet?: string): WorkbookPreview {
  const workbook = XLSX.read(buffer, {
    cellDates: true,
    type: "array",
  });

  const layout = findBestTableLayout(workbook, dataset, requestedSheet);

  return buildPreviewFromLayout(layout, workbook.SheetNames, buildImportWarnings(layout, workbook, requestedSheet));
}

export function parseWorkbookRows(
  buffer: ArrayBuffer,
  dataset: DatasetKind,
  mapping: Record<string, string>,
  requestedSheet?: string
): {
  rows: Array<ProductionRecord | GasReadingRecord>;
  warnings: ImportIssue[];
  preview: WorkbookPreview;
} {
  const workbook = XLSX.read(buffer, {
    cellDates: true,
    type: "array",
  });

  const layout = findBestTableLayout(workbook, dataset, requestedSheet);
  const preview = buildPreviewFromLayout(
    layout,
    workbook.SheetNames,
    buildImportWarnings(layout, workbook, requestedSheet)
  );
  const { columns, issues } = resolveMapping(dataset, layout.headers, mapping);
  const columnMap = Object.fromEntries(columns.map((column) => [column.key, column])) as ResolvedColumnMap;
  const warnings: ImportIssue[] = [...preview.warnings, ...issues];
  const rows: Array<ProductionRecord | GasReadingRecord> = [];

  if (issues.some((item) => item.severity === "error")) {
    return { rows: [], warnings, preview };
  }

  const startRow = layout.dataStartRowIndex + 1;

  layout.matrix.slice(layout.dataStartRowIndex).forEach((row, index) => {
    if (!row || row.every((cell) => isBlank(cell))) {
      return;
    }

    const rowNumber = startRow + index;
    const result =
      dataset === "production"
        ? parseProductionRow(row, rowNumber, columnMap)
        : parseGasRow(row, rowNumber, columnMap);

    rows.push(...result.rows);
    warnings.push(...result.warnings);
  });

  return { rows, warnings, preview };
}

export function buildWorkbookPreview(
  buffer: ArrayBuffer,
  dataset: DatasetKind,
  requestedSheet?: string
): WorkbookPreview {
  return analyzeWorkbook(buffer, dataset, requestedSheet);
}
