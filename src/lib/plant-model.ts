export const PLANT_LINE_CODES = ["P5", "P8", "P15", "RM"] as const;

export type PlantLineCode = (typeof PLANT_LINE_CODES)[number];

export const PLANT_LINE_LABELS: Record<PlantLineCode, string> = {
  P5: "P5",
  P8: "P8",
  P15: "P15",
  RM: "R/M",
};

export const PLANT_DAILY_TARGET_TON: Record<PlantLineCode, number> = {
  P5: 172,
  P8: 160,
  P15: 190,
  RM: 139,
};

export const PLANT_FURNACE_TO_LINE: Record<number, PlantLineCode> = {
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

export const PLANT_BASIS_CODES = ["billing", "self"] as const;

export type PlantGasBasis = (typeof PLANT_BASIS_CODES)[number];

export interface PlantTargetRecord {
  year: number;
  lineCode: PlantLineCode;
  dailyTargetTon: number;
}

export interface PlantPlanDayRecord {
  year: number;
  lineCode: PlantLineCode;
  month: number;
  days: number;
}

export interface PlantLineTargetSummary {
  year: number;
  lineCode: PlantLineCode;
  dailyTargetTon: number;
  planDays: number;
  targetTon: number;
  actualTon: number;
  achievementRate: number;
}

export function normalizePlantLineCode(value: string | null | undefined): PlantLineCode | null {
  if (!value) {
    return null;
  }

  const normalized = value.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");

  if (normalized === "R/M" || normalized === "RM") {
    return "RM";
  }

  if ((PLANT_LINE_CODES as readonly string[]).includes(normalized)) {
    return normalized as PlantLineCode;
  }

  return null;
}

export function displayPlantLineLabel(lineCode: PlantLineCode): string {
  return PLANT_LINE_LABELS[lineCode];
}

