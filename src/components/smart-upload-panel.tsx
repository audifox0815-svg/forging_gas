"use client";

import * as React from "react";

import { analyzeSmartWorkbook, type SmartWorkbookAnalysis } from "@/lib/smart-workbook";
import { DATASET_CONFIGS, type DashboardSnapshot, type DatasetKind, type ImportIssue } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FileSpreadsheet, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";

type SmartMode = "auto" | DatasetKind;

interface SmartUploadPanelProps {
  onCommitted(snapshot: DashboardSnapshot): void;
}

const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  return `${formatNumber(bytes / 1024 / 1024, 1)}MB`;
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

function SmartImportPanel({ onCommitted }: SmartUploadPanelProps) {
  const [mode, setMode] = React.useState<SmartMode>("auto");
  const [file, setFile] = React.useState<File | null>(null);
  const [analysis, setAnalysis] = React.useState<SmartWorkbookAnalysis | null>(null);
  const [sheetChoice, setSheetChoice] = React.useState<string>("");
  const [loadingAnalysis, setLoadingAnalysis] = React.useState(false);
  const [loadingCommit, setLoadingCommit] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [issues, setIssues] = React.useState<ImportIssue[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const requestIdRef = React.useRef(0);
  const currentDataset: DatasetKind | null = mode === "auto" ? analysis?.dataset ?? null : mode;
  const targetLabel = currentDataset ? DATASET_CONFIGS[currentDataset].title : "자동 인식";
  const missingFields = missingRequiredFields(analysis);

  const resetState = React.useCallback(() => {
    setFile(null);
    setAnalysis(null);
    setSheetChoice("");
    setLoadingAnalysis(false);
    setLoadingCommit(false);
    setMessage(null);
    setIssues([]);
  }, []);

  const setSelectedFile = React.useCallback((nextFile: File | null) => {
    if (!nextFile) {
      resetState();
      return;
    }

    if (nextFile.size > MAX_IMPORT_BYTES) {
      setFile(nextFile);
      setAnalysis(null);
      setSheetChoice("");
      setIssues([]);
      setLoadingAnalysis(false);
      setMessage("파일이 너무 큽니다. 16MB 이하 파일만 업로드해 주세요.");
      return;
    }

    setFile(nextFile);
    setAnalysis(null);
    setSheetChoice("");
    setLoadingAnalysis(Boolean(nextFile));
    setMessage(null);
    setIssues([]);
  }, [resetState]);

  React.useEffect(() => {
    if (!file) {
      return;
    }

    if (file.size > MAX_IMPORT_BYTES) {
      return;
    }

    let active = true;
    const requestId = ++requestIdRef.current;

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

    return () => {
      active = false;
    };
  }, [file, mode, sheetChoice]);

  const commitToServer = async () => {
    if (!file || !analysis || !currentDataset) {
      setMessage("먼저 엑셀을 선택해 주세요.");
      return;
    }

    if (missingFields.length > 0) {
      setMessage("자동 인식이 완전하지 않습니다. 아래 수동 탭에서 누락된 필드를 보완해 주세요.");
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
      setMessage(`${payload.summary?.inserted ?? 0}건을 브라우저 변환 후 적재했습니다.`);
      setIssues(payload.issues ?? []);
      setFile(null);
      setAnalysis(null);
      setSheetChoice("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch {
      setMessage("서버에 적재하는 동안 오류가 발생했습니다.");
    } finally {
      setLoadingCommit(false);
    }
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextFile = event.dataTransfer.files?.[0] ?? null;
    setSelectedFile(nextFile);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null);
  };

  const warningIssues = issues.filter((issue) => issue.severity === "warning");
  const errorIssues = issues.filter((issue) => issue.severity === "error");
  const canCommit = Boolean(file && analysis && currentDataset && missingFields.length === 0);

  return (
    <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.24)]">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <Sparkles className="mr-1 size-3" />
            스마트 업로드
          </Badge>
          <Badge variant="outline">브라우저 1차 변환</Badge>
          <Badge variant="outline">서버 최종 검증</Badge>
        </div>
        <CardTitle>브라우저에서 템플릿으로 자동 변환</CardTitle>
        <CardDescription>
          엑셀을 그대로 올리면 브라우저가 먼저 시트와 컬럼을 읽어 표준 템플릿으로 바꾸고, 서버가 다시
          검증한 뒤 적재합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Tabs
          value={mode}
          onValueChange={(next) => {
            setMode(next as SmartMode);
            setLoadingAnalysis(Boolean(file));
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
                <span className="text-sm font-medium">엑셀을 여기로 끌어오세요</span>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                생산량집계표나 가스검침량 파일을 올리면 브라우저가 표준 필드로 자동 변환합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <FileSpreadsheet className="mr-2 size-4" />
                파일 선택
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={commitToServer}
                disabled={!canCommit || loadingAnalysis || loadingCommit}
              >
                {loadingCommit ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    적재 중...
                  </>
                ) : (
                  "브라우저 변환 후 적재"
                )}
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">.xlsx / .xls</Badge>
            <Badge variant="outline">16MB 이하</Badge>
            <Badge variant="outline">브라우저 자동 인식</Badge>
          </div>
        </div>

        {file ? (
          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-4 text-primary" />
              <div>
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {loadingAnalysis ? "브라우저 분석 중..." : targetLabel}
              </Badge>
              <Button type="button" variant="ghost" size="sm" onClick={resetState}>
                초기화
              </Button>
            </div>
          </div>
        ) : (
          <Card className="border-dashed bg-background/30">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              아직 업로드된 파일이 없습니다. 엑셀을 넣으면 표준 템플릿으로 먼저 변환해서 보여줍니다.
            </CardContent>
          </Card>
        )}

        {message ? (
          <Alert>
            <AlertTitle>상태</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {analysis ? (
          <>
            <SmartSummary analysis={analysis} />

            {analysis.sheetNames.length > 1 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">시트 선택</div>
                <Select
                  value={sheetChoice || analysis.selectedSheet}
                  onValueChange={(next) => {
                    setSheetChoice(next ?? "");
                    setLoadingAnalysis(Boolean(file));
                  }}
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
                <Badge variant={missingFields.length > 0 ? "destructive" : "secondary"}>
                  {missingFields.length > 0 ? "누락 필드 있음" : "적재 가능"}
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
                        <TableCell colSpan={Math.max(analysis.fieldMappings.length, 1)} className="py-8 text-center text-muted-foreground">
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
                      {issue.message}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
              브라우저 인식이 완벽하지 않은 경우에는 아래의 일반 업로드 탭에서 직접 매핑을 조정할 수 있습니다.
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export { SmartImportPanel };
