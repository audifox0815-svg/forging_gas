export const DATASET_KINDS = ["production", "gas"] as const;

export type DatasetKind = (typeof DATASET_KINDS)[number];
export type LineCode = "P5" | "P8" | "P15" | "RM";
export type GasBasis = "고지" | "자체";

export interface FieldConfig {
  key: string;
  label: string;
  unit?: string;
  example: string;
  description: string;
  required: boolean;
}

export interface DatasetConfig {
  kind: DatasetKind;
  title: string;
  subtitle: string;
  description: string;
  fields: readonly FieldConfig[];
}

export const LINE_CODES: readonly LineCode[] = ["P5", "P8", "P15", "RM"] as const;

export const LINE_LABELS: Record<LineCode, string> = {
  P5: "P5",
  P8: "P8",
  P15: "P15",
  RM: "RM",
};

export const LINE_COLORS: Record<LineCode, string> = {
  P5: "#14b8a6",
  P8: "#38bdf8",
  P15: "#f59e0b",
  RM: "#f43f5e",
};

export const FURNACE_TO_LINE: Record<number, LineCode> = {
  1: "P5",
  2: "P5",
  3: "P5",
  4: "P5",
  5: "P5",
  6: "P15",
  7: "RM",
  8: "RM",
  9: "RM",
  10: "RM",
  11: "RM",
  12: "RM",
  13: "RM",
  14: "P8",
  15: "P8",
  16: "P15",
  17: "P15",
  18: "P15",
  19: "P15",
  20: "P15",
};

export const PRODUCT_BENCHMARKS = {
  금형강: 25,
  크랭크축: 26,
  쉘: 10,
  로터: 7,
} as const;

export type ProductName = keyof typeof PRODUCT_BENCHMARKS;

export interface ProductionRecord {
  ym: string;
  line: LineCode;
  product: string;
  material: string;
  weight_ton: number;
  work_hours: number;
  plan_ton: number;
}

export interface GasReadingRecord {
  ym: string;
  furnace_no: number;
  line: LineCode;
  usage_m3: number;
  basis: GasBasis;
}

export interface ImportIssue {
  severity: "error" | "warning";
  message: string;
  cell?: string;
  row?: number;
  field?: string;
}

export interface ImportSummary {
  dataset: DatasetKind;
  inserted: number;
  warnings: ImportIssue[];
  fileName: string;
  importedAt: string;
}

export interface DashboardSnapshot {
  generatedAt: string;
  source: "seed" | "memory" | "supabase";
  activeYear: number;
  years: number[];
  counts: {
    productionRows: number;
    gasRows: number;
  };
  kpis: {
    totalProductionTon: number;
    totalWorkHours: number;
    totalPlanTon: number;
    totalGasUsage: number;
    avgTonPerHour: number;
    avgGasUnit: number;
    targetAchievementRate: number;
  };
  lineSummaries: Array<{
    line: LineCode;
    actualTon: number;
    planTon: number;
    workHours: number;
    tonPerHour: number;
    gasUsageM3: number;
    gasUnit: number;
    achievementRate: number;
    lastMonth?: string;
    warnings: string[];
  }>;
  lineChartData: Array<{
    line: LineCode;
    actualTon: number;
    planTon: number;
    achievementRate: number;
  }>;
  threeYearTrend: Array<{
    year: number;
    P5: number;
    P8: number;
    P15: number;
    RM: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    actualTon: number;
    planTon: number;
    tonPerHour: number;
    gasUnit: number;
  }>;
  productivityByProduct: Array<{
    product: string;
    material: string;
    actualTon: number;
    workHours: number;
    tonPerHour: number;
    benchmarkTonPerHour?: number;
    gapTonPerHour?: number;
    warning?: string;
  }>;
  productivityByMaterial: Array<{
    material: string;
    actualTon: number;
    workHours: number;
    tonPerHour: number;
  }>;
  gasByLine: Array<{
    line: LineCode;
    usageM3: number;
    actualTon: number;
    gasUnit: number;
    basisSummary: string;
  }>;
  gasByBasisLine: Array<{
    basis: GasBasis;
    line: LineCode;
    usageM3: number;
    actualTon: number;
    gasUnit: number;
  }>;
  gasByFurnace: Array<{
    furnaceNo: number;
    line: LineCode;
    usageM3: number;
    actualTon: number;
    gasUnit: number;
    basisSummary: string;
  }>;
  gasByBasisFurnace: Array<{
    basis: GasBasis;
    furnaceNo: number;
    line: LineCode;
    usageM3: number;
    actualTon: number;
    gasUnit: number;
  }>;
  importHealth: {
    warningCount: number;
    errorCount: number;
    lastImport?: ImportSummary;
  };
}

export const DATASET_CONFIGS: Record<DatasetKind, DatasetConfig> = {
  production: {
    kind: "production",
    title: "생산량집계표",
    subtitle: "라인별 목표, 실적, 시간당 생산량",
    description:
      "월별 생산량집계표를 올리면 라인 기준 실적과 시간당 생산량을 자동으로 계산합니다.",
    fields: [
      {
        key: "ym",
        label: "년월",
        unit: "YYYY-MM",
        example: "2026-06",
        description: "집계 기준 월",
        required: true,
      },
      {
        key: "line",
        label: "라인",
        unit: "P5 / P8 / P15 / RM",
        example: "P15",
        description: "프레스 라인",
        required: true,
      },
      {
        key: "product",
        label: "제품",
        example: "금형강",
        description: "제품명",
        required: true,
      },
      {
        key: "material",
        label: "재질",
        example: "SCM440",
        description: "투입 재질",
        required: true,
      },
      {
        key: "weight_ton",
        label: "생산량",
        unit: "톤",
        example: "124.5",
        description: "월별 생산 중량",
        required: true,
      },
      {
        key: "work_hours",
        label: "가동시간",
        unit: "시간",
        example: "18.5",
        description: "실가동 시간",
        required: true,
      },
      {
        key: "plan_ton",
        label: "목표량",
        unit: "톤",
        example: "130.0",
        description: "월 목표 생산량",
        required: true,
      },
    ],
  },
  gas: {
    kind: "gas",
    title: "호기별 가스검침량",
    subtitle: "호기 사용량과 라인별 원단위",
    description:
      "호기별 가스검침량을 올리면 라인별 가스원단위와 호기별 비교가 자동으로 계산됩니다.",
    fields: [
      {
        key: "ym",
        label: "년월",
        unit: "YYYY-MM",
        example: "2026-06",
        description: "집계 기준 월",
        required: true,
      },
      {
        key: "furnace_no",
        label: "호기",
        unit: "1 ~ 20",
        example: "6",
        description: "가열로 번호",
        required: true,
      },
      {
        key: "line",
        label: "라인",
        unit: "P5 / P8 / P15 / RM",
        example: "P15",
        description: "가열로가 연결된 생산 라인",
        required: true,
      },
      {
        key: "usage_m3",
        label: "사용량",
        unit: "m³",
        example: "12450",
        description: "가스 사용량",
        required: true,
      },
      {
        key: "basis",
        label: "기준",
        unit: "고지 / 자체",
        example: "고지",
        description: "검침 기준",
        required: true,
      },
    ],
  },
};

export const APP_NAME = "단조 생산성 · 가스원단위";

export function getDatasetConfig(kind: DatasetKind): DatasetConfig {
  return DATASET_CONFIGS[kind];
}

export function isLineCode(value: string): value is LineCode {
  return LINE_CODES.includes(value as LineCode);
}
