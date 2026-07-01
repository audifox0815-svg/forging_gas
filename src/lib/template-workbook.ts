import "server-only";

import * as XLSX from "xlsx";

import { DATASET_CONFIGS, type DatasetKind } from "@/lib/domain";

type TemplateRow = Record<string, string | number>;

function currentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function buildProductionRows(): TemplateRow[] {
  const ym = currentYearMonth();

  return [
    {
      ym,
      line: "P15",
      product: "금형강",
      material: "SCM440",
      weight_ton: 124.5,
      work_hours: 18.5,
      plan_ton: 130,
    },
    {
      ym,
      line: "P5",
      product: "크랭크축",
      material: "SCM420",
      weight_ton: 96.2,
      work_hours: 15.8,
      plan_ton: 101,
    },
    {
      ym,
      line: "P8",
      product: "쉘",
      material: "SAE1045",
      weight_ton: 72.8,
      work_hours: 10.6,
      plan_ton: 78,
    },
    {
      ym,
      line: "RM",
      product: "로터",
      material: "S45C",
      weight_ton: 58.1,
      work_hours: 8.4,
      plan_ton: 61,
    },
  ];
}

function buildGasRows(): TemplateRow[] {
  const ym = currentYearMonth();

  return [
    {
      ym,
      furnace_no: 6,
      line: "P15",
      usage_m3: 12450,
      basis: "고지",
    },
    {
      ym,
      furnace_no: 16,
      line: "P15",
      usage_m3: 7380,
      basis: "자체",
    },
    {
      ym,
      furnace_no: 1,
      line: "P5",
      usage_m3: 6820,
      basis: "고지",
    },
    {
      ym,
      furnace_no: 14,
      line: "P8",
      usage_m3: 5210,
      basis: "자체",
    },
    {
      ym,
      furnace_no: 7,
      line: "RM",
      usage_m3: 9040,
      basis: "고지",
    },
  ];
}

function buildHeaders(dataset: DatasetKind): string[] {
  return DATASET_CONFIGS[dataset].fields.map((field) => field.key);
}

function buildRows(dataset: DatasetKind): TemplateRow[] {
  return dataset === "production" ? buildProductionRows() : buildGasRows();
}

export function buildTemplateWorkbook(dataset: DatasetKind): XLSX.WorkBook {
  const headers = buildHeaders(dataset);
  const rows = buildRows(dataset);
  const worksheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ]);

  worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(header.length + 2, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    dataset === "production" ? "생산량집계표" : "가스검침량"
  );

  workbook.Props = {
    Title: dataset === "production" ? "생산량집계표 템플릿" : "가스검침량 템플릿",
    Subject: "forging 업로드 템플릿",
    Author: "Codex",
    Company: "forging",
  };

  return workbook;
}

export function getTemplateFileName(dataset: DatasetKind): string {
  return dataset === "production"
    ? "생산량집계표_템플릿.xlsx"
    : "가스검침량_템플릿.xlsx";
}

