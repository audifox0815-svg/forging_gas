const formatter0 = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const formatter1 = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});

const formatter2 = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

export function formatNumber(value: number, digits = 1): string {
  return digits === 0
    ? formatter0.format(value)
    : digits === 2
      ? formatter2.format(value)
      : formatter1.format(value);
}

export function formatTon(value: number): string {
  return `${formatNumber(value, 1)}톤`;
}

export function formatHours(value: number): string {
  return `${formatNumber(value, 1)}시간`;
}

export function formatM3(value: number): string {
  return `${formatNumber(value, 0)}m³`;
}

export function formatTonPerHour(value: number): string {
  return `${formatNumber(value, 1)}톤/h`;
}

export function formatGasUnit(value: number): string {
  return `${formatNumber(value, 1)}m³/톤`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 1)}%`;
}

export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  if (!year || !month) {
    return ym;
  }
  return `${year.slice(2)}년 ${Number(month)}월`;
}

export function formatFormula(
  numerator: number,
  denominator: number,
  result: number,
  suffix = ""
): string {
  return `${formatNumber(numerator, 1)} ÷ ${formatNumber(denominator, 1)} = ${formatNumber(result, 1)}${suffix}`;
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

