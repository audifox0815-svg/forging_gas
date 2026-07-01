"use client";

import * as React from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DATASET_CONFIGS, type DashboardSnapshot, type DatasetKind, type ImportIssue } from "@/lib/domain";
import type { WorkbookPreview } from "@/lib/workbook";
import { formatNumber } from "@/lib/format";
import { SmartImportPanel } from "@/components/smart-upload-panel";
import { CloudDownload, CloudUpload, FileSpreadsheet, RefreshCw, TriangleAlert } from "lucide-react";

interface DatasetUploadState {
  file: File | null;
  preview: WorkbookPreview | null;
  mapping: Record<string, string>;
  selectedSheet: string;
  loadingPreview: boolean;
  loadingCommit: boolean;
  message: string | null;
  issues: ImportIssue[];
}

interface UploadPanelProps {
  onCommitted(snapshot: DashboardSnapshot): void;
}

function createInitialState(): DatasetUploadState {
  return {
    file: null,
    preview: null,
    mapping: {},
    selectedSheet: "",
    loadingPreview: false,
    loadingCommit: false,
    message: null,
    issues: [],
  };
}

function formatFileSize(bytes: number): string {
  return `${formatNumber(bytes / 1024 / 1024, 1)}MB`;
}

function issueKey(issue: ImportIssue, index: number): string {
  return [issue.severity, issue.row ?? "x", issue.cell ?? "x", issue.message, index].join("|");
}

const TEMPLATE_DOWNLOAD_URLS: Record<DatasetKind, string> = {
  production: "/api/templates/production",
  gas: "/api/templates/gas",
};

function downloadTemplate(dataset: DatasetKind) {
  const link = document.createElement("a");
  link.href = TEMPLATE_DOWNLOAD_URLS[dataset];
  link.rel = "noreferrer";
  link.target = "_self";
  link.click();
}

function DatasetForm({
  dataset,
  state,
  onChange,
  onImported,
}: {
  dataset: DatasetKind;
  state: DatasetUploadState;
  onChange(next: DatasetUploadState): void;
  onImported(snapshot: DashboardSnapshot): void;
}) {
  const config = DATASET_CONFIGS[dataset];
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const updateState = (patch: Partial<DatasetUploadState>) => {
    onChange({ ...state, ...patch });
  };

  const setFile = (file: File | null) => {
    if (!file) {
      updateState({
        file: null,
        preview: null,
        mapping: {},
        selectedSheet: "",
        message: null,
        issues: [],
      });
      return;
    }

    updateState({
      file,
      preview: null,
      mapping: {},
      selectedSheet: "",
      message: null,
      issues: [],
    });
  };

  const handlePreview = async () => {
    if (!state.file) {
      updateState({
        message: "먼저 엑셀 파일을 선택해주세요.",
      });
      return;
    }

    const formData = new FormData();
    formData.set("file", state.file);
    formData.set("dataset", dataset);
    formData.set("mode", "preview");
    if (state.selectedSheet) {
      formData.set("sheetName", state.selectedSheet);
    }

    updateState({ loadingPreview: true, message: null, issues: [] });

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        updateState({
          loadingPreview: false,
          message: payload.message ?? "미리보기에 실패했습니다.",
          issues: payload.issues ?? [],
        });
        return;
      }

      const preview = payload.preview as WorkbookPreview;
      updateState({
        loadingPreview: false,
        preview,
        mapping: preview.suggestedMapping,
        selectedSheet: preview.selectedSheet,
        issues: preview.warnings,
        message: "미리보기를 불러왔습니다. 필요한 경우 컬럼 매핑을 조정한 뒤 적재하세요.",
      });
    } catch {
      updateState({
        loadingPreview: false,
        message: "미리보기 요청 중 오류가 발생했습니다.",
      });
    }
  };

  const handleCommit = async () => {
    if (!state.file) {
      updateState({
        message: "먼저 엑셀 파일을 선택해주세요.",
      });
      return;
    }

    const formData = new FormData();
    formData.set("file", state.file);
    formData.set("dataset", dataset);
    formData.set("mode", "commit");
    formData.set("mapping", JSON.stringify(state.mapping));
    if (state.selectedSheet) {
      formData.set("sheetName", state.selectedSheet);
    }

    updateState({ loadingCommit: true, message: null, issues: [] });

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        updateState({
          loadingCommit: false,
          message: payload.message ?? "적재에 실패했습니다.",
          issues: payload.issues ?? [],
          preview: payload.preview ?? state.preview,
        });
        return;
      }

      const preview = payload.preview as WorkbookPreview;
      updateState({
        loadingCommit: false,
        preview,
        mapping: preview.suggestedMapping,
        selectedSheet: preview.selectedSheet,
        issues: payload.issues ?? [],
        message: `${payload.summary?.inserted ?? 0}행을 적재했습니다.`,
      });
      onImported(payload.snapshot as DashboardSnapshot);
    } catch {
      updateState({
        loadingCommit: false,
        message: "적재 요청 중 오류가 발생했습니다.",
      });
    }
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setFile(file);
    }
  };

  const previewIssues = state.issues.filter((issue) => issue.severity !== "warning");
  const warningIssues = state.issues.filter((issue) => issue.severity === "warning");
  const preview = state.preview;
  const commitDisabledReason = !state.file
    ? "엑셀 파일을 먼저 선택해 주세요."
    : state.loadingCommit
      ? "검증 중에는 잠시 기다려 주세요."
      : !state.preview
        ? "1. 미리보기를 눌러 시트/컬럼 검증을 먼저 완료해야 합니다."
        : null;

  return (
    <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.35)] backdrop-blur">
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
        <CardDescription>{config.subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div
          className={[
            "rounded-2xl border border-dashed p-5 transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border/70 bg-background/40",
          ].join(" ")}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CloudUpload className="size-4 text-primary" />
                <span className="text-sm font-medium">엑셀 파일 드래그앤드롭</span>
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                {config.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                파일 선택
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handlePreview}
                disabled={!state.file || state.loadingPreview}
              >
                {state.loadingPreview ? "미리보기 중..." : "1. 미리보기"}
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">.xlsx / .xls</Badge>
            <Badge variant="outline">최대 16MB</Badge>
            <Badge variant="outline">시트 자동 감지</Badge>
          </div>
        </div>

        {state.file ? (
          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="size-4 text-primary" />
              <div>
                <div className="font-medium">{state.file.name}</div>
                <div className="text-xs text-muted-foreground">{formatFileSize(state.file.size)}</div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFile(null)}
            >
              초기화
            </Button>
          </div>
        ) : (
          <Card className="border-dashed bg-background/30">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              파일이 아직 없습니다. 시트 구조가 보이는 샘플 엑셀을 올려주세요.
            </CardContent>
          </Card>
        )}

        {state.message ? (
          <Alert>
            <AlertTitle>업로드 상태</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

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

        {previewIssues.length > 0 ? (
          <Alert variant="destructive">
            <TriangleAlert className="size-4" />
            <AlertTitle>검증 오류</AlertTitle>
            <AlertDescription>
              {previewIssues.map((issue, index) => (
                <div key={issueKey(issue, index)} className="mt-1">
                  {issue.cell ? `${issue.cell}: ` : ""}
                  {issue.message}
                </div>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">시트 / 컬럼 매핑</h3>
              <p className="text-xs text-muted-foreground">
                시트 선택 후 컬럼 이름을 맞춰주세요. 매핑이 끝나면 적재 버튼을 누릅니다.
              </p>
            </div>
            {state.preview ? (
              <Badge variant="secondary">미리보기 준비됨</Badge>
            ) : (
              <Badge variant="outline">대기 중</Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {config.fields.map((field) => {
              const currentValue = state.mapping[field.key] ?? "";
              const unitWarning = state.preview?.availableColumns.find(
                (column) => column.header === currentValue
              )?.unitWarning;

              return (
                <div key={field.key} className="space-y-2 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{field.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {field.description}
                        {field.unit ? ` · ${field.unit}` : ""}
                      </div>
                    </div>
                    {unitWarning ? (
                      <Badge variant="destructive">단위 확인</Badge>
                    ) : field.required ? (
                      <Badge variant="secondary">필수</Badge>
                    ) : null}
                  </div>
                  <Select
                    value={currentValue}
                    onValueChange={(next) =>
                      onChange({
                        ...state,
                        mapping: { ...state.mapping, [field.key]: next ?? "" },
                      })
                    }
                    disabled={!state.preview}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="열을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.preview?.availableColumns.map((column) => (
                        <SelectItem key={column.header} value={column.header}>
                          <span className="flex items-center gap-2">
                            <span>{column.header}</span>
                            <span className="text-xs text-muted-foreground">
                              {column.letter}
                              {column.sample ? ` · ${column.sample}` : ""}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          {state.preview?.sheetNames?.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">시트 선택</div>
              <Select
                value={state.selectedSheet || state.preview.selectedSheet}
                onValueChange={(next) =>
                  onChange({
                    ...state,
                    selectedSheet: next ?? "",
                  })
                }
                disabled={!state.preview}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="시트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {state.preview.sheetNames.map((sheetName) => (
                    <SelectItem key={sheetName} value={sheetName}>
                      {sheetName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <Button
            type="button"
            className="w-full"
            onClick={handleCommit}
            disabled={!state.file || state.loadingCommit || !state.preview}
          >
            {state.loadingCommit ? (
              <>
                <RefreshCw className="mr-2 size-4 animate-spin" />
                검증 중...
              </>
            ) : (
              "2. 검증 후 적재"
            )}
          </Button>

          {commitDisabledReason ? <p className="text-xs text-muted-foreground">{commitDisabledReason}</p> : null}
        </div>

        {preview ? (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">미리보기</h3>
                  <p className="text-xs text-muted-foreground">
                    첫 5행을 보여줍니다. 셀 위치 오류가 나면 행/열까지 함께 표시됩니다.
                  </p>
                </div>
                <Badge variant="outline">
                  {preview.availableColumns.length} columns
                </Badge>
              </div>
              <div className="rounded-xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((header, index) => (
                        <TableHead key={`${header}-${index}`}>{header || `열${index + 1}`}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.sampleRows.length > 0 ? (
                      preview.sampleRows.map((row, rowIndex) => (
                        <TableRow key={`${rowIndex}-${JSON.stringify(row)}`}>
                          {preview.headers.map((header, columnIndex) => (
                            <TableCell key={`${rowIndex}-${columnIndex}`}>
                              {row[header] || "-"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={preview.headers.length || 1} className="py-8 text-center text-muted-foreground">
                          데이터 행을 찾지 못했습니다. 헤더 아래에 값이 있는지 확인해주세요.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function UploadPanel({ onCommitted }: UploadPanelProps) {
  const [states, setStates] = React.useState<Record<DatasetKind, DatasetUploadState>>({
    production: createInitialState(),
    gas: createInitialState(),
  });

  const updateDatasetState = (dataset: DatasetKind, next: DatasetUploadState) => {
    setStates((current) => ({
      ...current,
      [dataset]: next,
    }));
  };

  return (
    <div className="space-y-4">
      <SmartImportPanel onCommitted={onCommitted} />

      <Card className="border-border/80 bg-card/80 shadow-[0_12px_45px_rgba(0,0,0,0.24)]">
        <CardHeader>
          <CardTitle>운영자용 템플릿 다운로드</CardTitle>
          <CardDescription>
            현장 엑셀 양식이 헷갈릴 때는 아래 샘플 파일을 내려받아 그대로 작성하세요. 헤더와 예시 행이
            들어 있어 처음 쓰는 분도 바로 시작할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(Object.keys(DATASET_CONFIGS) as DatasetKind[]).map((dataset) => {
            const config = DATASET_CONFIGS[dataset];
            const columns = config.fields.map((field) => field.label);

            return (
              <div key={dataset} className="rounded-xl border border-border/70 bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{config.title}</div>
                    <div className="text-xs text-muted-foreground">{config.subtitle}</div>
                  </div>
                  <Badge variant="outline">샘플 포함</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {columns.map((column) => (
                    <Badge key={`${dataset}-${column}`} variant="secondary" className="text-[11px]">
                      {column}
                    </Badge>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={() => downloadTemplate(dataset)}
                >
                  <CloudDownload className="mr-2 size-4" />
                  템플릿 다운로드
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Tabs defaultValue="production" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="production">생산량집계표</TabsTrigger>
        <TabsTrigger value="gas">호기별 가스검침량</TabsTrigger>
      </TabsList>

      <TabsContent value="production" className="space-y-4">
        <DatasetForm
          dataset="production"
          state={states.production}
          onChange={(next) => updateDatasetState("production", next)}
          onImported={onCommitted}
        />
      </TabsContent>

      <TabsContent value="gas" className="space-y-4">
        <DatasetForm
          dataset="gas"
          state={states.gas}
          onChange={(next) => updateDatasetState("gas", next)}
          onImported={onCommitted}
        />
      </TabsContent>
      </Tabs>
    </div>
  );
}
