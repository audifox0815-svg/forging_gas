"use client";

import * as React from "react";

import { analyzeSmartWorkbook, type SmartWorkbookAnalysis } from "@/lib/smart-workbook";
import {
  DATASET_CONFIGS,
  type DashboardSnapshot,
  type DatasetKind,
  type ImportIssue,
} from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FileSpreadsheet, RefreshCw, Sparkles, TriangleAlert, Trash2 } from "lucide-react";

type SmartMode = "auto" | DatasetKind;

interface SmartUploadPanelProps {
  onCommitted(snapshot: DashboardSnapshot): void;
}

const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  return `${formatNumber(bytes / 1024 / 1024, 1)}MB`;
}

function isExcelFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name);
}

function createFileKey(file: File): string {
  return [file.name, file.size, file.lastModified].join("|");
}

function missingRequiredFields(analysis: SmartWorkbookAnalysis | null): string[] {
  if (!analysis) {
    return [];
  }

  return analysis.fieldMappings
    .filter((field) => field.required && !field.sourceHeader)
    .map((field) => field.label);
}

function issueKey(issue: ImportIssue, index: number): string {
  return [issue.severity, issue.row ?? "x", issue.cell ?? "x", issue.message, index].join("|");
}

function SmartSummary({ analysis }: { analysis: SmartWorkbookAnalysis }) {
  const recommended = DATASET_CONFIGS[analysis.detectedDataset];
  const applied = DATASET_CONFIGS[analysis.dataset];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">추천 형식</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{recommended.title}</Badge>
          <Badge variant="outline">{analysis.confidence}%</Badge>
        </div>
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">적용 형식</div>
        <div className="mt-2 text-sm font-medium">{applied.title}</div>
        <div className="text-xs text-muted-foreground">
          {analysis.matchedFields}/{analysis.totalFields} 필드 자동 매칭
        </div>
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">시트</div>
        <div className="mt-2 text-sm font-medium">{analysis.selectedSheet || "-"}</div>
        <div className="text-xs text-muted-foreground">{analysis.sheetNames.length}개 시트 탐지</div>
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">표준 열</div>
        <div className="mt-2 text-sm font-medium">{analysis.fieldMappings.length}개</div>
        <div className="text-xs text-muted-foreground">
          {analysis.availableColumns.length}개 원본 열을 브라우저가 읽었습니다.
        </div>
      </div>
    </div>
  );
}

function SmartFileCard({
  file,
  mode,
  onRemove,
  onCommitted,
}: {
  file: File;
  mode: SmartMode;
  onRemove(): void;
  onCommitted(snapshot: DashboardSnapshot): void;
}) {
  const [analysis, setAnalysis] = React.useState<SmartWorkbookAnalysis | null>(null);
  const [sheetChoice, setSheetChoice] = React.useState<string>("");
  const [loadingAnalysis, setLoadingAnalysis] = React.useState(false);
  const [loadingCommit, setLoadingCommit] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [issues, setIssues] = React.useState<ImportIssue[]>([]);
  const [committed, setCommitted] = React.useState(false);
  const requestIdRef = React.useRef(0);

  const currentDataset: DatasetKind | null = mode === "auto" ? analysis?.dataset ?? null : mode;
  const targetLabel = currentDataset ? DATASET_CONFIGS[currentDataset].title : "자동 인식";
  const missingFields = missingRequiredFields(analysis);
  const fileValidationMessage = !isExcelFile(file)
    ? "엑셀 파일(.xlsx, .xls)만 인식할 수 있습니다."
    : file.size > MAX_IMPORT_BYTES
      ? "파일이 너무 큽니다. 16MB 이하 파일만 업로드해 주세요."
      : null;
  const statusLabel = committed
    ? "적재 완료"
    : loadingCommit
      ? "적재 중"
      : loadingAnalysis
        ? "분석 중"
        : analysis
          ? "분석 완료"
          : "대기 중";

  React.useEffect(() => {
    if (fileValidationMessage) {
      return;
    }

    let active = true;
    const requestId = ++requestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      if (!active || requestId !== requestIdRef.current) {
        return;
      }

      setLoadingAnalysis(true);
      setAnalysis(null);
      setIssues([]);
      setMessage(null);
      setCommitted(false);

      analyzeSmartWorkbook(file, mode === "auto" ? null : mode, sheetChoice || undefined)
        .then((next) => {
          if (!active || requestId !== requestIdRef.current) {
            return;
          }

          setAnalysis(next);
          setIssues(next.warnings);
          setMessage("브라우저에서 표준 템플릿으로 변환했습니다. 필요하면 아래 수동 탭에서 더 조정할 수 있습니다.");
        })
        .catch(() => {
          if (!active || requestId !== requestIdRef.current) {
            return;
          }

          setAnalysis(null);
          setIssues([]);
          setMessage("브라우저에서 엑셀을 읽지 못했습니다. 다른 파일인지 확인해 주세요.");
        })
        .finally(() => {
          if (active && requestId === requestIdRef.current) {
            setLoadingAnalysis(false);
          }
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [file, fileValidationMessage, mode, sheetChoice]);

  const commitToServer = async () => {
    if (!analysis || !currentDataset) {
      setMessage("먼저 파일 분석을 완료해 주세요.");
      return;
    }

    if (missingFields.length > 0) {
      setMessage(`필수 열이 아직 ${missingFields.length}개 인식되지 않았습니다. 표 아래 매핑을 확인해 주세요.`);
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    formData.set("dataset", currentDataset);
    formData.set("mode", "commit");
    formData.set("mapping", JSON.stringify(analysis.suggestedMapping));
    if (sheetChoice || analysis.selectedSheet) {
      formData.set("sheetName", sheetChoice || analysis.selectedSheet);
    }

    setLoadingCommit(true);
    setMessage(null);
    setIssues([]);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "적재에 실패했습니다.");
        setIssues(payload.issues ?? []);
        return;
      }

      onCommitted(payload.snapshot as DashboardSnapshot);
      setMessage(
        payload.message ?? `${payload.summary?.inserted ?? 0}건을 브라우저 변환 후 적재했습니다.`
      );
      setIssues(payload.issues ?? []);
      setCommitted(true);
    } catch {
      setMessage("서버에 적재하는 동안 오류가 발생했습니다.");
    } finally {
      setLoadingCommit(false);
    }
  };

  const warningIssues = issues.filter((issue) => issue.severity === "warning");
  const errorIssues = issues.filter((issue) => issue.severity === "error");
  const canCommit = Boolean(
    analysis && currentDataset && missingFields.length === 0 && !loadingAnalysis && !loadingCommit && !committed && !fileValidationMessage
  );
  const commitDisabledReason = fileValidationMessage
    ? fileValidationMessage
    : loadingAnalysis
      ? "브라우저가 파일을 분석하는 중입니다."
      : !analysis
        ? "먼저 파일 분석을 완료해 주세요."
        : !currentDataset
          ? "자동 인식이 아직 데이터셋을 확정하지 못했습니다."
          : missingFields.length > 0
            ? `필수 열 ${missingFields.length}개가 아직 부족합니다.`
          : loadingCommit
            ? "적재 중입니다. 잠시만 기다려 주세요."
            : committed
              ? "이미 적재가 완료된 파일입니다."
              : null;

  return (
    <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.24)]">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <Sparkles className="mr-1 size-3" />
            파일별 분석
          </Badge>
          <Badge variant="outline">브라우저 1차 변환</Badge>
          <Badge variant="outline">서버 최종 검증</Badge>
          <Badge variant={committed ? "secondary" : "outline"}>{statusLabel}</Badge>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-base sm:text-lg">{file.name}</CardTitle>
            <CardDescription className="max-w-2xl">
              {mode === "auto"
                ? "각 파일을 브라우저가 따로 읽어서 생산량집계표인지 가스검침량인지 자동으로 구분합니다."
                : `${DATASET_CONFIGS[mode].title} 형식으로 읽습니다. 파일마다 개별적으로 분석하고 적재할 수 있습니다.`}
            </CardDescription>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{formatFileSize(file.size)}</span>
              <span>·</span>
              <span>{loadingAnalysis ? "분석 중" : targetLabel}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={loadingCommit}>
              <Trash2 className="mr-2 size-4" />
              제거
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {fileValidationMessage ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>파일 확인</AlertTitle>
            <AlertDescription>{fileValidationMessage}</AlertDescription>
          </Alert>
        ) : message ? (
          <Alert>
            <AlertTitle>상태</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {loadingAnalysis ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 p-6">
            <div className="flex items-center gap-3">
              <RefreshCw className="size-4 animate-spin text-primary" />
              <div>
                <div className="text-sm font-medium">브라우저가 파일을 읽는 중입니다.</div>
                <div className="text-xs text-muted-foreground">
                  원본 시트와 열을 분석해서 표준 템플릿으로 바꾸고 있습니다.
                </div>
              </div>
            </div>
          </div>
        ) : analysis ? (
          <>
            <SmartSummary analysis={analysis} />

            {analysis.sheetNames.length > 1 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">시트 선택</div>
                <Select
                  value={sheetChoice || analysis.selectedSheet}
                  onValueChange={(next) => {
                    setSheetChoice(next ?? "");
                  }}
                  disabled={loadingCommit}
                >
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue placeholder="시트를 선택해 주세요." />
                  </SelectTrigger>
                  <SelectContent>
                    {analysis.sheetNames.map((sheetName) => (
                      <SelectItem key={sheetName} value={sheetName}>
                        {sheetName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">표준 매핑</h3>
                  <p className="text-xs text-muted-foreground">
                    원본 열을 브라우저가 템플릿 필드로 바꾼 결과입니다.
                  </p>
                </div>
                <Badge variant={missingFields.length > 0 ? "destructive" : committed ? "secondary" : "outline"}>
                  {missingFields.length > 0
                    ? "누락 필드 있음"
                    : committed
                      ? "적재 완료"
                      : "적재 가능"}
                </Badge>
              </div>

              <div className="rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>표준 필드</TableHead>
                      <TableHead>원본 열</TableHead>
                      <TableHead>샘플</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.fieldMappings.map((field) => (
                      <TableRow key={field.key}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{field.label}</div>
                            <div className="text-xs text-muted-foreground">{field.unit ?? "-"}</div>
                          </div>
                        </TableCell>
                        <TableCell>{field.sourceHeader ?? "-"}</TableCell>
                        <TableCell>{field.sample || "-"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {field.required ? <Badge variant="secondary">필수</Badge> : <Badge variant="outline">선택</Badge>}
                            {field.unitWarning ? <Badge variant="destructive">단위 확인</Badge> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">표준화 미리보기</h3>
                  <p className="text-xs text-muted-foreground">
                    브라우저가 바꾼 표준 템플릿의 첫 몇 행입니다.
                  </p>
                </div>
                <Badge variant="outline">{analysis.standardizedRows.length}개 행 미리보기</Badge>
              </div>

              <div className="rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {analysis.fieldMappings.map((field) => (
                        <TableHead key={field.key}>{field.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analysis.standardizedRows.length > 0 ? (
                      analysis.standardizedRows.map((row, rowIndex) => (
                        <TableRow key={`${rowIndex}-${JSON.stringify(row)}`}>
                          {analysis.fieldMappings.map((field) => (
                            <TableCell key={`${rowIndex}-${field.key}`}>
                              {row[field.label] || "-"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={Math.max(analysis.fieldMappings.length, 1)}
                          className="py-8 text-center text-muted-foreground"
                        >
                          표준화할 행이 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {warningIssues.length > 0 ? (
              <Alert>
                <TriangleAlert className="size-4" />
                <AlertTitle>확인 필요</AlertTitle>
                <AlertDescription>
                  {warningIssues.map((issue, index) => (
                    <div key={issueKey(issue, index)} className="mt-1">
                      {issue.message}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            {errorIssues.length > 0 ? (
              <Alert variant="destructive">
                <TriangleAlert className="size-4" />
                <AlertTitle>오류</AlertTitle>
                <AlertDescription>
                  {errorIssues.map((issue, index) => (
                    <div key={issueKey(issue, index)} className="mt-1">
                      {issue.cell ? `${issue.cell}: ` : ""}
                      {issue.message}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="button"
              className="w-full"
              onClick={commitToServer}
              disabled={!canCommit}
            >
              {loadingCommit ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  적재 중...
                </>
              ) : committed ? (
                "적재 완료"
              ) : (
                "브라우저 변환 후 적재"
              )}
            </Button>

            {commitDisabledReason ? <p className="text-xs text-muted-foreground">{commitDisabledReason}</p> : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/30 p-6 text-sm text-muted-foreground">
            파일을 넣으면 브라우저가 먼저 표준 템플릿으로 바꿔 보여줍니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function describeQueueMessage(
  acceptedCount: number,
  skippedDuplicateCount: number,
  skippedLargeCount: number,
  skippedUnsupportedCount: number
): string | null {
  const parts: string[] = [];

  if (acceptedCount > 0) {
    parts.push(`${acceptedCount}개 파일을 추가했습니다.`);
  }

  if (skippedDuplicateCount > 0) {
    parts.push(`중복 ${skippedDuplicateCount}개를 제외했습니다.`);
  }

  if (skippedLargeCount > 0) {
    parts.push(`16MB 초과 ${skippedLargeCount}개를 제외했습니다.`);
  }

  if (skippedUnsupportedCount > 0) {
    parts.push(`엑셀이 아닌 파일 ${skippedUnsupportedCount}개를 제외했습니다.`);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

function SmartImportPanel({ onCommitted }: SmartUploadPanelProps) {
  const [mode, setMode] = React.useState<SmartMode>("auto");
  const [files, setFiles] = React.useState<File[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  const clearFiles = React.useCallback(() => {
    setFiles([]);
    setMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const appendFiles = React.useCallback(
    (incomingFiles: FileList | File[]) => {
      const nextFiles = Array.from(incomingFiles);
      if (nextFiles.length === 0) {
        return;
      }

      const existingKeys = new Set(files.map(createFileKey));
      const accepted: File[] = [];
      let skippedDuplicateCount = 0;
      let skippedLargeCount = 0;
      let skippedUnsupportedCount = 0;

      for (const file of nextFiles) {
        if (!isExcelFile(file)) {
          skippedUnsupportedCount += 1;
          continue;
        }

        if (file.size > MAX_IMPORT_BYTES) {
          skippedLargeCount += 1;
          continue;
        }

        const key = createFileKey(file);
        if (existingKeys.has(key) || accepted.some((item) => createFileKey(item) === key)) {
          skippedDuplicateCount += 1;
          continue;
        }

        accepted.push(file);
      }

      if (accepted.length > 0) {
        setFiles((current) => [...current, ...accepted]);
      }

      setMessage(describeQueueMessage(accepted.length, skippedDuplicateCount, skippedLargeCount, skippedUnsupportedCount));
    },
    [files]
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    appendFiles(event.target.files ?? []);
    event.currentTarget.value = "";
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    appendFiles(event.dataTransfer.files);
  };

  const fileCount = files.length;

  return (
    <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.24)]">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <Sparkles className="mr-1 size-3" />
            다중 파일 업로드
          </Badge>
          <Badge variant="outline">브라우저 1차 변환</Badge>
          <Badge variant="outline">서버 최종 검증</Badge>
        </div>
        <CardTitle>브라우저에서 템플릿으로 자동 변환</CardTitle>
        <CardDescription>
          엑셀을 여러 개 한 번에 올리면 파일마다 브라우저가 먼저 시트와 컬럼을 읽어 표준 템플릿으로 바꾸고, 서버가
          다시 검증한 뒤 적재합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs
          value={mode}
          onValueChange={(next) => {
            setMode(next as SmartMode);
          }}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="auto">자동 인식</TabsTrigger>
            <TabsTrigger value="production">생산량집계표</TabsTrigger>
            <TabsTrigger value="gas">가스검침량</TabsTrigger>
          </TabsList>
        </Tabs>

        <div
          className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-5 transition-colors"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={onDrop}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CloudUpload className="size-4 text-primary" />
                <span className="text-sm font-medium">엑셀을 여러 개 끌어오세요</span>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                각 파일은 별도 카드로 분석됩니다. 같은 달의 생산량집계표와 가스검침량을 함께 올려도 됩니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet className="mr-2 size-4" />
                파일 선택
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearFiles} disabled={fileCount === 0}>
                전체 지우기
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">.xlsx / .xls</Badge>
            <Badge variant="outline">파일별 16MB 이하</Badge>
            <Badge variant="outline">브라우저 자동 인식</Badge>
            <Badge variant="outline">총 {fileCount}개 파일</Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">선택 파일</div>
            <div className="mt-2 text-2xl font-semibold">{fileCount}개</div>
            <div className="text-xs text-muted-foreground">각 파일을 카드별로 따로 분석합니다.</div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">총 용량</div>
            <div className="mt-2 text-2xl font-semibold">{formatFileSize(totalSize)}</div>
            <div className="text-xs text-muted-foreground">16MB를 넘는 파일은 자동으로 제외됩니다.</div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/50 p-4">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">분석 기준</div>
            <div className="mt-2 text-sm font-medium">{mode === "auto" ? "자동 인식" : DATASET_CONFIGS[mode].title}</div>
            <div className="text-xs text-muted-foreground">모든 파일에 동일한 기준을 적용합니다.</div>
          </div>
        </div>

        {message ? (
          <Alert>
            <AlertTitle>상태</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {fileCount > 0 ? (
          <div className="space-y-4">
            {files.map((file) => (
              <SmartFileCard
                key={createFileKey(file)}
                file={file}
                mode={mode}
                onRemove={() => {
                  setFiles((current) => current.filter((item) => createFileKey(item) !== createFileKey(file)));
                }}
                onCommitted={onCommitted}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed bg-background/30">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              아직 업로드된 파일이 없습니다. 여러 개의 엑셀을 한 번에 넣으면 각각 별도 카드로 분석해서 보여줍니다.
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

export { SmartImportPanel };
