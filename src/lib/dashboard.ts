import "server-only";

import {
  LINE_CODES,
  PRODUCT_BENCHMARKS,
  type DashboardSnapshot,
  type GasBasis,
  type GasReadingRecord,
  type LineCode,
  type ProductionRecord,
} from "@/lib/domain";
import { formatMonthLabel, safeDivide } from "@/lib/format";
import { loadStore } from "@/lib/store";
import type { PlantPlanDayRecord, PlantTargetRecord } from "@/lib/plant-model";

interface ProductionLineAggregate {
  actualTon: number;
  targetTon: number;
  workHours: number;
  lastMonth: string;
}

interface GasLineAggregate {
  usageM3: number;
  basisCounts: Record<GasBasis, number>;
}

interface GasBasisLineAggregate {
  usageM3: number;
}

interface GasBasisFurnaceAggregate {
  usageM3: number;
}

interface YearLineTotals {
  year: number;
  P5: number;
  P8: number;
  P15: number;
  RM: number;
}

const DEFAULT_PLAN_DAYS_BY_MONTH = [20, 19, 21, 20, 20, 20, 21, 20, 20, 20, 19, 18] as const;

const PRODUCT_NAMES = Object.keys(PRODUCT_BENCHMARKS);

function createBasisCounts(): Record<GasBasis, number> {
  return {
    고지: 0,
    자체: 0,
  };
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getYear(ym: string): number {
  return Number(ym.slice(0, 4));
}

function sortUniqueMonths(months: Iterable<string>): string[] {
  return [...new Set(months)].sort((left, right) => left.localeCompare(right));
}

function makeTargetKey(year: number, line: LineCode): string {
  return `${year}:${line}`;
}

function makePlanDayKey(year: number, line: LineCode, month: number): string {
  return `${year}:${line}:${month}`;
}

function buildTargetMaps(
  targets: PlantTargetRecord[],
  planDays: PlantPlanDayRecord[]
): {
  targetMap: Map<string, number>;
  planDayMap: Map<string, number>;
} {
  const targetMap = new Map<string, number>();
  const planDayMap = new Map<string, number>();

  for (const target of targets) {
    targetMap.set(makeTargetKey(target.year, target.lineCode), target.dailyTargetTon);
  }

  for (const planDay of planDays) {
    planDayMap.set(makePlanDayKey(planDay.year, planDay.lineCode, planDay.month), planDay.days);
  }

  return { targetMap, planDayMap };
}

function resolveDailyTarget(
  targetMap: Map<string, number>,
  year: number,
  line: LineCode
): number {
  return (
    targetMap.get(makeTargetKey(year, line)) ??
    targetMap.get(makeTargetKey(year - 1, line)) ??
    0
  );
}

function resolvePlanDays(
  planDayMap: Map<string, number>,
  year: number,
  line: LineCode,
  month: number
): number {
  return (
    planDayMap.get(makePlanDayKey(year, line, month)) ??
    DEFAULT_PLAN_DAYS_BY_MONTH[month - 1] ??
    0
  );
}

function resolveAnnualTargetTon(
  targetMap: Map<string, number>,
  planDayMap: Map<string, number>,
  year: number,
  line: LineCode
): { dailyTargetTon: number; planDays: number; targetTon: number } {
  const dailyTargetTon = resolveDailyTarget(targetMap, year, line);

  const planDays = DEFAULT_PLAN_DAYS_BY_MONTH.reduce(
    (sum, _, index) => sum + resolvePlanDays(planDayMap, year, line, index + 1),
    0
  );

  return {
    dailyTargetTon,
    planDays,
    targetTon: dailyTargetTon * planDays,
  };
}

function resolveMonthlyTargetTon(
  targetMap: Map<string, number>,
  planDayMap: Map<string, number>,
  year: number,
  month: number
): number {
  return LINE_CODES.reduce((sum, line) => {
    const dailyTargetTon = resolveDailyTarget(targetMap, year, line);
    const planDays = resolvePlanDays(planDayMap, year, line, month);
    return sum + dailyTargetTon * planDays;
  }, 0);
}

function createProductionAggregates(
  productionRows: ProductionRecord[],
  activeYear: number,
  targets: PlantTargetRecord[],
  planDays: PlantPlanDayRecord[]
) {
  const { targetMap, planDayMap } = buildTargetMaps(targets, planDays);
  const lineMap = new Map<LineCode, ProductionLineAggregate>();
  const productMap = new Map<string, { actualTon: number; workHours: number; material: string }>();
  const materialMap = new Map<string, { actualTon: number; workHours: number }>();
  const monthlyMap = new Map<string, { actualTon: number; targetTon: number; workHours: number }>();
  const monthsInYear: string[] = [];

  for (const row of productionRows) {
    const year = getYear(row.ym);
    const line = row.line;

    if (year === activeYear) {
      monthsInYear.push(row.ym);

      const currentLine = lineMap.get(line) ?? {
        actualTon: 0,
        targetTon: 0,
        workHours: 0,
        lastMonth: row.ym,
      };

      currentLine.actualTon += row.weight_ton;
      currentLine.workHours += row.work_hours;
      currentLine.lastMonth = row.ym > currentLine.lastMonth ? row.ym : currentLine.lastMonth;
      lineMap.set(line, currentLine);

      const productKey = `${row.product}__${row.material}`;
      const productAggregate = productMap.get(productKey) ?? {
        actualTon: 0,
        workHours: 0,
        material: row.material,
      };
      productAggregate.actualTon += row.weight_ton;
      productAggregate.workHours += row.work_hours;
      productMap.set(productKey, productAggregate);

      const materialAggregate = materialMap.get(row.material) ?? {
        actualTon: 0,
        workHours: 0,
      };
      materialAggregate.actualTon += row.weight_ton;
      materialAggregate.workHours += row.work_hours;
      materialMap.set(row.material, materialAggregate);

      const monthlyAggregate = monthlyMap.get(row.ym) ?? {
        actualTon: 0,
        targetTon: 0,
        workHours: 0,
      };
      monthlyAggregate.actualTon += row.weight_ton;
      monthlyAggregate.workHours += row.work_hours;
      monthlyMap.set(row.ym, monthlyAggregate);
    }
  }

  for (const line of LINE_CODES) {
    const target = resolveAnnualTargetTon(targetMap, planDayMap, activeYear, line);
    const currentLine = lineMap.get(line) ?? {
      actualTon: 0,
      targetTon: 0,
      workHours: 0,
      lastMonth: "",
    };

    currentLine.targetTon = target.targetTon;
    lineMap.set(line, currentLine);
  }

  for (let month = 1; month <= 12; month += 1) {
    const ym = `${activeYear}-${String(month).padStart(2, "0")}`;
    const targetTon = resolveMonthlyTargetTon(targetMap, planDayMap, activeYear, month);
    const monthlyAggregate = monthlyMap.get(ym) ?? {
      actualTon: 0,
      targetTon: 0,
      workHours: 0,
    };

    monthlyAggregate.targetTon = targetTon;
    monthlyMap.set(ym, monthlyAggregate);
  }

  const productionMonths = sortUniqueMonths(monthsInYear);

  return {
    lineMap,
    productMap,
    materialMap,
    monthlyMap,
    productionMonths,
    targetMap,
    planDayMap,
  };
}

function createGasAggregates(
  gasRows: GasReadingRecord[],
  activeYear: number
) {
  const lineMap = new Map<LineCode, GasLineAggregate>();
  const furnaceMap = new Map<number, { line: LineCode; usageM3: number; basisCounts: Record<GasBasis, number> }>();
  const basisLineMap = new Map<string, GasBasisLineAggregate>();
  const basisFurnaceMap = new Map<string, GasBasisFurnaceAggregate>();

  for (const row of gasRows) {
    const year = getYear(row.ym);

    if (year !== activeYear) {
      continue;
    }

    const lineAggregate = lineMap.get(row.line) ?? {
      usageM3: 0,
      basisCounts: createBasisCounts(),
    };
    lineAggregate.usageM3 += row.usage_m3;
    lineAggregate.basisCounts[row.basis] += 1;
    lineMap.set(row.line, lineAggregate);

    const basisLineKey = `${row.basis}:${row.line}`;
    const basisLineAggregate = basisLineMap.get(basisLineKey) ?? {
      usageM3: 0,
    };
    basisLineAggregate.usageM3 += row.usage_m3;
    basisLineMap.set(basisLineKey, basisLineAggregate);

    const furnaceAggregate = furnaceMap.get(row.furnace_no) ?? {
      line: row.line,
      usageM3: 0,
      basisCounts: createBasisCounts(),
    };
    furnaceAggregate.usageM3 += row.usage_m3;
    furnaceAggregate.basisCounts[row.basis] += 1;
    furnaceMap.set(row.furnace_no, furnaceAggregate);

    const basisFurnaceKey = `${row.basis}:${row.furnace_no}`;
    const basisFurnaceAggregate = basisFurnaceMap.get(basisFurnaceKey) ?? {
      usageM3: 0,
    };
    basisFurnaceAggregate.usageM3 += row.usage_m3;
    basisFurnaceMap.set(basisFurnaceKey, basisFurnaceAggregate);
  }

  return { lineMap, furnaceMap, basisLineMap, basisFurnaceMap };
}

function getActiveYear(productionRows: ProductionRecord[], gasRows: GasReadingRecord[]): number {
  const years = [
    ...productionRows.map((row) => getYear(row.ym)),
    ...gasRows.map((row) => getYear(row.ym)),
  ];

  const fallback = new Date().getFullYear();
  return years.length > 0 ? Math.max(...years) : fallback;
}

function buildYearTrend(
  productionRows: ProductionRecord[],
  years: number[]
): YearLineTotals[] {
  return years.map((year) => {
    const totals: YearLineTotals = { year, P5: 0, P8: 0, P15: 0, RM: 0 };

    for (const row of productionRows) {
      if (getYear(row.ym) === year) {
        totals[row.line] += row.weight_ton;
      }
    }

    return totals;
  });
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const store = await loadStore();
  const activeYear = getActiveYear(store.production, store.gas);
  const { lineMap, productMap, materialMap, monthlyMap } = createProductionAggregates(
    store.production,
    activeYear,
    store.targets,
    store.planDays
  );
  const {
    lineMap: gasLineMap,
    furnaceMap,
    basisLineMap,
    basisFurnaceMap,
  } = createGasAggregates(store.gas, activeYear);

  const years = [...new Set([
    ...store.production.map((row) => getYear(row.ym)),
    ...store.gas.map((row) => getYear(row.ym)),
  ])].sort((left, right) => left - right);

  const yearTrend = buildYearTrend(store.production, years.slice(-3));

  const lineSummaries = LINE_CODES.map((line) => {
    const production = lineMap.get(line as LineCode) ?? {
      actualTon: 0,
      targetTon: 0,
      workHours: 0,
      lastMonth: "",
    };
    const gas = gasLineMap.get(line as LineCode) ?? {
      usageM3: 0,
      basisCounts: createBasisCounts(),
    };
    const tonPerHour = safeDivide(production.actualTon, production.workHours);
    const gasUnit = safeDivide(gas.usageM3, production.actualTon);
    const achievementRate = safeDivide(production.actualTon, production.targetTon) * 100;

    return {
      line,
      actualTon: round(production.actualTon),
      targetTon: round(production.targetTon),
      workHours: round(production.workHours, 1),
      tonPerHour: round(tonPerHour, 1),
      gasUsageM3: round(gas.usageM3, 0),
      gasUnit: round(gasUnit, 1),
      achievementRate: round(achievementRate, 1),
      lastMonth: production.lastMonth || undefined,
      warnings:
        production.actualTon === 0
          ? ["실적 데이터가 아직 없습니다."]
          : production.workHours <= 0
            ? ["가동시간이 0시간입니다."]
            : [],
    };
  });

  const totalProductionTon = lineSummaries.reduce((sum, item) => sum + item.actualTon, 0);
  const totalWorkHours = lineSummaries.reduce((sum, item) => sum + item.workHours, 0);
  const totalTargetTon = lineSummaries.reduce((sum, item) => sum + item.targetTon, 0);
  const totalGasUsage = lineSummaries.reduce((sum, item) => sum + item.gasUsageM3, 0);

  const monthlyTrend = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const ym = `${activeYear}-${String(month).padStart(2, "0")}`;
    const production = monthlyMap.get(ym) ?? {
      actualTon: 0,
      targetTon: 0,
      workHours: 0,
    };
    const lineGasTotal = store.gas
      .filter((row) => row.ym === ym && getYear(row.ym) === activeYear)
      .reduce((sum, row) => sum + row.usage_m3, 0);
    return {
      month: formatMonthLabel(ym),
      actualTon: round(production.actualTon),
      targetTon: round(production.targetTon),
      tonPerHour: round(safeDivide(production.actualTon, production.workHours), 1),
      gasUnit: round(safeDivide(lineGasTotal, production.actualTon), 1),
    };
  });

  const productivityByProduct = PRODUCT_NAMES.map((product) => {
    const key = [...productMap.keys()].find((item) => item.startsWith(`${product}__`));
    const aggregate = key ? productMap.get(key) : undefined;
    const actualTon = aggregate?.actualTon ?? 0;
    const workHours = aggregate?.workHours ?? 0;
    const tonPerHour = safeDivide(actualTon, workHours);
    const benchmarkTonPerHour = PRODUCT_BENCHMARKS[product as keyof typeof PRODUCT_BENCHMARKS];
    const gapTonPerHour = benchmarkTonPerHour - tonPerHour;

    return {
      product,
      material: aggregate?.material ?? "-",
      actualTon: round(actualTon),
      workHours: round(workHours, 1),
      tonPerHour: round(tonPerHour, 1),
      benchmarkTonPerHour,
      gapTonPerHour: round(gapTonPerHour, 1),
      warning:
        actualTon > 0 && benchmarkTonPerHour && tonPerHour < benchmarkTonPerHour * 0.6
          ? "벤치마크 대비 낮습니다."
          : undefined,
    };
  });

  const productivityByMaterial = [...materialMap.entries()]
    .map(([material, aggregate]) => ({
      material,
      actualTon: round(aggregate.actualTon),
      workHours: round(aggregate.workHours, 1),
      tonPerHour: round(safeDivide(aggregate.actualTon, aggregate.workHours), 1),
    }))
    .sort((left, right) => right.actualTon - left.actualTon);

  const gasByLine = ["P5", "P8", "P15", "RM"].map((line) => {
    const gas = gasLineMap.get(line as LineCode) ?? {
      usageM3: 0,
      basisCounts: createBasisCounts(),
    };
    const production = lineMap.get(line as LineCode) ?? {
      actualTon: 0,
      targetTon: 0,
      workHours: 0,
      lastMonth: "",
    };

    return {
      line: line as LineCode,
      usageM3: round(gas.usageM3, 0),
      actualTon: round(production.actualTon),
      gasUnit: round(safeDivide(gas.usageM3, production.actualTon), 1),
      basisSummary: `고지 ${gas.basisCounts.고지} / 자체 ${gas.basisCounts.자체}`,
    };
  });

  const gasByFurnace = [...furnaceMap.entries()]
    .map(([furnaceNo, aggregate]) => ({
      furnaceNo,
      line: aggregate.line,
      usageM3: round(aggregate.usageM3, 0),
      actualTon: round(lineMap.get(aggregate.line)?.actualTon ?? 0),
      gasUnit: round(safeDivide(aggregate.usageM3, lineMap.get(aggregate.line)?.actualTon ?? 0), 1),
      basisSummary: `고지 ${aggregate.basisCounts.고지} / 자체 ${aggregate.basisCounts.자체}`,
    }))
    .sort((left, right) => left.furnaceNo - right.furnaceNo);

  const gasByBasisLine = ["고지", "자체"]
    .flatMap((basis) =>
      ["P5", "P8", "P15", "RM"].map((line) => {
        const aggregate = basisLineMap.get(`${basis}:${line}`) ?? { usageM3: 0 };
        const production = lineMap.get(line as LineCode) ?? {
          actualTon: 0,
          targetTon: 0,
          workHours: 0,
          lastMonth: "",
        };

        return {
          basis: basis as "고지" | "자체",
          line: line as LineCode,
          usageM3: round(aggregate.usageM3, 0),
          actualTon: round(production.actualTon),
          gasUnit: round(safeDivide(aggregate.usageM3, production.actualTon), 1),
        };
      })
    )
    .filter((item) => item.usageM3 > 0);

  const gasByBasisFurnace = ["고지", "자체"]
    .flatMap((basis) =>
      [...furnaceMap.entries()].map(([furnaceNo, aggregate]) => {
        const basisAggregate = basisFurnaceMap.get(`${basis}:${furnaceNo}`) ?? { usageM3: 0 };

        return {
          basis: basis as "고지" | "자체",
          furnaceNo,
          line: aggregate.line,
          usageM3: round(basisAggregate.usageM3, 0),
          actualTon: round(lineMap.get(aggregate.line)?.actualTon ?? 0),
          gasUnit: round(
            safeDivide(basisAggregate.usageM3, lineMap.get(aggregate.line)?.actualTon ?? 0),
            1
          ),
        };
      })
    )
    .filter((item) => item.usageM3 > 0)
    .sort((left, right) => left.furnaceNo - right.furnaceNo);

  const importHealth = {
    warningCount: store.lastImport?.warnings.length ?? 0,
    errorCount: store.lastImport?.warnings.filter((issue) => issue.severity === "error").length ?? 0,
    lastImport: store.lastImport,
  };

  return {
    generatedAt: new Date().toISOString(),
    source: store.source,
    activeYear,
    years,
    counts: {
      productionRows: store.production.length,
      gasRows: store.gas.length,
    },
    kpis: {
      totalProductionTon: round(totalProductionTon),
      totalWorkHours: round(totalWorkHours, 1),
      totalTargetTon: round(totalTargetTon),
      totalGasUsage: round(totalGasUsage, 0),
      avgTonPerHour: round(safeDivide(totalProductionTon, totalWorkHours), 1),
      avgGasUnit: round(safeDivide(totalGasUsage, totalProductionTon), 1),
      targetAchievementRate: round(safeDivide(totalProductionTon, totalTargetTon) * 100, 1),
    },
    lineSummaries,
    lineChartData: lineSummaries,
    threeYearTrend: yearTrend,
    monthlyTrend,
    productivityByProduct,
    productivityByMaterial,
    gasByLine,
    gasByBasisLine,
    gasByFurnace,
    gasByBasisFurnace,
    importHealth,
  };
}
