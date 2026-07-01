"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  type DashboardSnapshot,
  type GasBasis,
  LINE_COLORS,
} from "@/lib/domain";
import {
  formatFormula,
  formatGasUnit,
  formatHours,
  formatNumber,
  formatPercent,
  formatTon,
  formatTonPerHour,
} from "@/lib/format";
import { CircleAlert, ChevronUp } from "lucide-react";
import * as React from "react";

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="bg-card/80">
      <CardContent className="space-y-2 p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{helper}</div>
      </CardContent>
    </Card>
  );
}

function ChartShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.24)]">
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-[320px]">{children}</CardContent>
    </Card>
  );
}

function LineBadge({ line }: { line: keyof typeof LINE_COLORS }) {
  return (
    <Badge
      variant="outline"
      style={{ borderColor: LINE_COLORS[line], color: LINE_COLORS[line] }}
    >
      {line}
    </Badge>
  );
}

function formatBasisLabel(basis: GasBasis | "전체") {
  return basis === "전체" ? "전체" : basis;
}

export function DashboardView({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="총 생산량"
          value={formatTon(snapshot.kpis.totalProductionTon)}
          helper={`∑ weight_ton = ${formatTon(snapshot.kpis.totalProductionTon)}`}
        />
        <MetricCard
          label="시간당 생산량"
          value={formatTonPerHour(snapshot.kpis.avgTonPerHour)}
          helper={formatFormula(
            snapshot.kpis.totalProductionTon,
            snapshot.kpis.totalWorkHours,
            snapshot.kpis.avgTonPerHour,
            "톤/h"
          )}
        />
        <MetricCard
          label="목표 달성률"
          value={formatPercent(snapshot.kpis.targetAchievementRate)}
          helper={`${formatTon(snapshot.kpis.totalProductionTon)} ÷ ${formatTon(snapshot.kpis.totalPlanTon)} × 100`}
        />
        <MetricCard
          label="가스원단위"
          value={formatGasUnit(snapshot.kpis.avgGasUnit)}
          helper={`${formatNumber(snapshot.kpis.totalGasUsage, 0)}m³ ÷ ${formatTon(snapshot.kpis.totalProductionTon)}`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartShell
          title="라인별 연간 목표 vs 실적"
          description={`${snapshot.activeYear}년 기준 실적과 목표를 비교합니다.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={snapshot.lineChartData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="line" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value, name) => [
                  formatTon(Number(value ?? 0)),
                  name === "actualTon" ? "실적" : "목표",
                ]}
                labelFormatter={(value) => `라인 ${value}`}
              />
              <Bar dataKey="actualTon" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="planTon" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell
          title="3개년 추세"
          description="라인별 연간 실적 추세입니다."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={snapshot.threeYearTrend} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="year" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value) => formatTon(Number(value ?? 0))}
                labelFormatter={(value) => `${value}년`}
              />
              {(["P5", "P8", "P15", "RM"] as const).map((line) => (
                <Line
                  key={line}
                  type="monotone"
                  dataKey={line}
                  stroke={LINE_COLORS[line]}
                  strokeWidth={2.5}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      <ChartShell
        title="월별 변동"
        description="실적, 목표, 시간당 생산량, 가스원단위를 월별로 함께 봅니다."
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={snapshot.monthlyTrend} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value, name) => {
                if (name === "actualTon" || name === "planTon") {
                  return [formatTon(Number(value ?? 0)), name === "actualTon" ? "실적" : "목표"];
                }
                if (name === "tonPerHour") {
                  return [formatTonPerHour(Number(value ?? 0)), "시간당 생산량"];
                }
                return [formatGasUnit(Number(value ?? 0)), "가스원단위"];
              }}
            />
            <Area
              type="monotone"
              dataKey="actualTon"
              stroke="var(--color-primary)"
              fill="var(--color-primary)"
              fillOpacity={0.2}
            />
            <Area
              type="monotone"
              dataKey="planTon"
              stroke="var(--color-chart-2)"
              fill="var(--color-chart-2)"
              fillOpacity={0.12}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartShell>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/80 bg-card/80">
          <CardHeader>
            <CardTitle>라인별 상세</CardTitle>
            <CardDescription>
              분자/분모를 모두 표시해서 계산 근거를 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>라인</TableHead>
                  <TableHead>실적 / 목표</TableHead>
                  <TableHead>달성률</TableHead>
                  <TableHead>시간당 생산량</TableHead>
                  <TableHead>가스원단위</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.lineSummaries.map((item) => (
                  <TableRow key={item.line}>
                    <TableCell>
                      <div className="space-y-1">
                        <LineBadge line={item.line} />
                        <div className="text-xs text-muted-foreground">
                          마지막 집계 {item.lastMonth ?? "-"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {formatTon(item.actualTon)} / {formatTon(item.planTon)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatFormula(item.actualTon, item.planTon, item.achievementRate, "%")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatPercent(item.achievementRate)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{formatTonPerHour(item.tonPerHour)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatFormula(item.actualTon, item.workHours, item.tonPerHour, "톤/h")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{formatGasUnit(item.gasUnit)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(item.gasUsageM3, 0)}m³ ÷ {formatTon(item.actualTon)}
                        </div>
                      </div>
                      {item.warnings.length > 0 ? (
                        <Badge variant="destructive" className="mt-2">
                          단위 확인
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/80">
          <CardHeader>
            <CardTitle>활성 연도 개요</CardTitle>
            <CardDescription>
              {snapshot.activeYear}년 집계와 최신 적재 메타를 보여줍니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="생산 행 수"
                value={formatNumber(snapshot.counts.productionRows, 0)}
                helper="production 테이블 / 메모리 시드 포함"
              />
              <MetricCard
                label="가스 행 수"
                value={formatNumber(snapshot.counts.gasRows, 0)}
                helper="gas_reading 테이블 / 메모리 시드 포함"
              />
            </div>

            <div className="rounded-xl border border-border/70 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ChevronUp className="size-4 text-primary" />
                <span className="text-sm font-medium">최근 적재</span>
              </div>
              {snapshot.importHealth.lastImport ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>파일: {snapshot.importHealth.lastImport.fileName}</div>
                  <div>적재 행 수: {snapshot.importHealth.lastImport.inserted}행</div>
                  <div>적재 시각: {snapshot.importHealth.lastImport.importedAt}</div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">아직 적재된 파일이 없습니다.</div>
              )}
            </div>

            <div className="rounded-xl border border-border/70 p-4">
              <div className="mb-2 flex items-center gap-2">
                <CircleAlert className="size-4 text-amber-400" />
                <span className="text-sm font-medium">확인 메모</span>
              </div>
              <div className="text-sm text-muted-foreground">
                모든 계산은 <span className="font-medium text-foreground">분자 / 분모</span>를 함께
                표시합니다. 값이 이상하면 단위 배지가 먼저 노란색 또는 빨간색으로 바뀝니다.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProductivityView({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartShell
          title="제품별 시간당 생산량"
          description="제품별 실적과 벤치마크를 비교합니다."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={snapshot.productivityByProduct} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="product" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value, name) => [
                  formatTonPerHour(Number(value ?? 0)),
                  name === "benchmarkTonPerHour" ? "벤치마크" : "실적",
                ]}
              />
              <Bar dataKey="tonPerHour" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              <Bar
                dataKey="benchmarkTonPerHour"
                fill="var(--color-chart-2)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>

        <Card className="border-border/80 bg-card/80">
          <CardHeader>
            <CardTitle>제품별 요약</CardTitle>
            <CardDescription>
              벤치마크는 금형강 25, 크랭크축 26, 쉘 10, 로터 7입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제품</TableHead>
                  <TableHead>실적</TableHead>
                  <TableHead>가동시간</TableHead>
                  <TableHead>톤/h</TableHead>
                  <TableHead>비교</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.productivityByProduct.map((item) => (
                  <TableRow key={item.product}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{item.product}</div>
                        <div className="text-xs text-muted-foreground">{item.material}</div>
                      </div>
                    </TableCell>
                    <TableCell>{formatTon(item.actualTon)}</TableCell>
                    <TableCell>{formatHours(item.workHours)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{formatTonPerHour(item.tonPerHour)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatFormula(item.actualTon, item.workHours, item.tonPerHour, "톤/h")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.benchmarkTonPerHour ? (
                        <div className="space-y-1">
                          <div className="font-medium">
                            {formatTonPerHour(item.benchmarkTonPerHour)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            차이 {formatTonPerHour(Math.abs(item.gapTonPerHour ?? 0))}
                          </div>
                        </div>
                      ) : (
                        "-"
                      )}
                      {item.warning ? (
                        <Badge variant="destructive" className="mt-2">
                          {item.warning}
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/80">
        <CardHeader>
          <CardTitle>재질별 톤/h</CardTitle>
          <CardDescription>재질별로 실적과 가동시간을 합산한 값입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>재질</TableHead>
                <TableHead>실적</TableHead>
                <TableHead>가동시간</TableHead>
                <TableHead>톤/h</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.productivityByMaterial.map((item) => (
                <TableRow key={item.material}>
                  <TableCell className="font-medium">{item.material}</TableCell>
                  <TableCell>{formatTon(item.actualTon)}</TableCell>
                  <TableCell>{formatHours(item.workHours)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{formatTonPerHour(item.tonPerHour)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFormula(item.actualTon, item.workHours, item.tonPerHour, "톤/h")}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function GasView({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [basis, setBasis] = React.useState<GasBasis | "전체">("전체");

  const lineData =
    basis === "전체"
      ? snapshot.gasByLine
      : snapshot.gasByBasisLine.filter((item) => item.basis === basis);
  const furnaceData =
    basis === "전체"
      ? snapshot.gasByFurnace
      : snapshot.gasByBasisFurnace.filter((item) => item.basis === basis);
  const lineChartData = lineData.map((item) => ({
    line: item.line,
    gasUnit: item.gasUnit,
  }));

  return (
    <div className="space-y-5">
      <Tabs
        value={basis}
        onValueChange={(next) => setBasis(next as GasBasis | "전체")}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="전체">전체</TabsTrigger>
          <TabsTrigger value="고지">고지</TabsTrigger>
          <TabsTrigger value="자체">자체</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartShell
          title={`라인별 가스원단위 · ${formatBasisLabel(basis)}`}
          description="라인 생산량 대비 가스 사용량을 비교합니다."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={lineChartData} margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
              <XAxis dataKey="line" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value) => [formatGasUnit(Number(value ?? 0)), "가스원단위"]}
                labelFormatter={(value) => `라인 ${value}`}
              />
              <Bar dataKey="gasUnit" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>

        <Card className="border-border/80 bg-card/80">
          <CardHeader>
            <CardTitle>가스 개요</CardTitle>
            <CardDescription>
              기준 토글에 따라 고지/자체 데이터를 교차 비교할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="총 가스 사용량"
                value={`${formatNumber(
                  lineData.reduce((sum, item) => sum + item.usageM3, 0),
                  0
                )}m³`}
                helper={`${formatBasisLabel(basis)} 기준`}
              />
              <MetricCard
                label="평균 원단위"
                value={formatGasUnit(
                  lineData.reduce((sum, item) => sum + item.gasUnit, 0) / Math.max(lineData.length, 1)
                )}
                helper="라인 평균"
              />
            </div>

            <div className="rounded-xl border border-border/70 p-4">
              <div className="mb-2 text-sm font-medium">설명</div>
              <div className="text-sm text-muted-foreground">
                가스원단위는 <span className="font-medium text-foreground">라인가스 ÷ 라인생산톤</span>으로 계산됩니다.
                기준을 바꾸면 같은 월의 데이터를 고지와 자체로 나눠 볼 수 있습니다.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 bg-card/80">
        <CardHeader>
          <CardTitle>호기별 가스원단위</CardTitle>
          <CardDescription>호기별 사용량과 기준별 분리 결과를 함께 보여줍니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>호기</TableHead>
                <TableHead>라인</TableHead>
                <TableHead>사용량</TableHead>
                <TableHead>원단위</TableHead>
                <TableHead>기준</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {furnaceData.map((item) => (
                <TableRow key={`${item.furnaceNo}-${basis}`}>
                  <TableCell className="font-medium">{item.furnaceNo}</TableCell>
                  <TableCell>
                    <LineBadge line={item.line} />
                  </TableCell>
                  <TableCell>{formatNumber(item.usageM3, 0)}m³</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{formatGasUnit(item.gasUnit)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFormula(item.usageM3, item.actualTon, item.gasUnit, "m³/톤")}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{formatBasisLabel(basis)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
