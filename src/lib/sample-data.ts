import {
  LINE_CODES,
  PRODUCT_BENCHMARKS,
  type GasBasis,
  type GasReadingRecord,
  type LineCode,
  type ProductionRecord,
} from "@/lib/domain";
import { safeDivide } from "@/lib/format";

const PRODUCT_ORDER = Object.keys(PRODUCT_BENCHMARKS) as Array<
  keyof typeof PRODUCT_BENCHMARKS
>;

const PRODUCT_SHARES: Record<keyof typeof PRODUCT_BENCHMARKS, number> = {
  금형강: 0.33,
  크랭크축: 0.29,
  쉘: 0.21,
  로터: 0.17,
};

const MATERIAL_BY_PRODUCT: Record<keyof typeof PRODUCT_BENCHMARKS, string> = {
  금형강: "SKD61",
  크랭크축: "SCM440",
  쉘: "S45C",
  로터: "SCM415",
};

const LINE_BASE_TON: Record<LineCode, number> = {
  P5: 620,
  P8: 520,
  P15: 980,
  RM: 760,
};

const LINE_BASE_GAS: Record<LineCode, number> = {
  P5: 11.8,
  P8: 10.1,
  P15: 8.6,
  RM: 13.4,
};

const FURNACES_BY_LINE: Record<LineCode, number[]> = {
  P5: [1, 2, 3, 4, 5],
  P8: [14, 15],
  P15: [6, 16, 17, 18, 19, 20],
  RM: [7, 8, 9, 10, 11, 12, 13],
};

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthRange(startYear: number, endYear: number): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(startYear, 0, 1));

  while (cursor.getUTCFullYear() <= endYear) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function wave(seed: number, phase = 0, amplitude = 1): number {
  return 1 + Math.sin(seed / 2.7 + phase) * amplitude;
}

function lineTrendFactor(line: LineCode): number {
  return {
    P5: 0.02,
    P8: 0.015,
    P15: 0.05,
    RM: 0.03,
  }[line];
}

function buildProductionRows(months: string[]): {
  rows: ProductionRecord[];
  monthlyLineTotals: Record<string, number>;
} {
  const rows: ProductionRecord[] = [];
  const monthlyLineTotals: Record<string, number> = {};

  months.forEach((ym, monthIndex) => {
    const yearOffset = Number(ym.slice(0, 4)) - 2024;

    LINE_CODES.forEach((line, lineIndex) => {
      const lineActualTon =
        LINE_BASE_TON[line] *
        wave(monthIndex + 1, lineIndex * 0.8, 0.08) *
        (1 + yearOffset * lineTrendFactor(line));

      const shares = PRODUCT_ORDER.map((product, productIndex) => ({
        product,
        share:
          PRODUCT_SHARES[product] *
          wave(monthIndex + 1 + productIndex, lineIndex * 0.5, 0.08),
      }));

      const shareTotal = shares.reduce((sum, item) => sum + item.share, 0);

      shares.forEach(({ product, share }, productIndex) => {
        const normalizedShare = share / shareTotal;
        const actualTon = lineActualTon * normalizedShare;
        const benchmarkTonPerHour = PRODUCT_BENCHMARKS[product];
        const efficiency = 0.54 + lineIndex * 0.03 + wave(monthIndex + productIndex, 0.6, 0.07) * 0.06;
        const tonPerHour = benchmarkTonPerHour * efficiency;
        const workHours = safeDivide(actualTon, tonPerHour);
        const planTon = actualTon * (1.04 + wave(monthIndex + lineIndex, 1.2, 0.02));

        rows.push({
          ym,
          line,
          product,
          material: MATERIAL_BY_PRODUCT[product],
          weight_ton: round(actualTon),
          work_hours: round(workHours, 1),
          plan_ton: round(planTon),
        });
      });

      monthlyLineTotals[`${ym}:${line}`] = round(lineActualTon);
    });
  });

  return { rows, monthlyLineTotals };
}

function buildGasRows(
  months: string[],
  monthlyLineTotals: Record<string, number>
): GasReadingRecord[] {
  const rows: GasReadingRecord[] = [];

  months.forEach((ym, monthIndex) => {
    const yearOffset = Number(ym.slice(0, 4)) - 2024;

    LINE_CODES.forEach((line, lineIndex) => {
      const lineActualTon = monthlyLineTotals[`${ym}:${line}`] ?? 0;
      const lineGasUnit =
        LINE_BASE_GAS[line] *
        wave(monthIndex + lineIndex, 0.3, 0.05) *
        (1 + yearOffset * 0.02);
      const lineGasUsage = lineActualTon * lineGasUnit;
      const furnaces = FURNACES_BY_LINE[line];
      const weights = furnaces.map((furnaceNo, furnaceIndex) =>
        wave(monthIndex + furnaceIndex + furnaceNo, lineIndex * 0.2, 0.14)
      );
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

      furnaces.forEach((furnaceNo, furnaceIndex) => {
        const share = weights[furnaceIndex] / totalWeight;
        const basis: GasBasis = (monthIndex + furnaceNo) % 2 === 0 ? "고지" : "자체";

        rows.push({
          ym,
          furnace_no: furnaceNo,
          line,
          usage_m3: round(lineGasUsage * share),
          basis,
        });
      });
    });
  });

  return rows;
}

const months = monthRange(2024, 2026);
const productionSeed = buildProductionRows(months);

export const seedProductionRows = productionSeed.rows;
export const seedGasRows = buildGasRows(months, productionSeed.monthlyLineTotals);
