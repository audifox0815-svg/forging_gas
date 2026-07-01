import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  DashboardSnapshot,
  DatasetKind,
  GasReadingRecord,
  ImportIssue,
  ImportSummary,
  ProductionRecord,
} from "@/lib/domain";
import { seedGasRows, seedProductionRows } from "@/lib/sample-data";
import { createSupabaseServerClient, hasSupabaseAuthConfig } from "@/lib/supabase-auth";
import { getSupabaseAdminClient, hasSupabaseConfig } from "@/lib/supabase";

interface StoreState {
  production: ProductionRecord[];
  gas: GasReadingRecord[];
  lastImport?: ImportSummary;
}

interface StorePayload {
  production: ProductionRecord[];
  gas: GasReadingRecord[];
  source: DashboardSnapshot["source"];
  lastImport?: ImportSummary;
}

const LOCAL_STORE_PATH = path.join(process.cwd(), ".forging-store.json");

const memoryState: StoreState = {
  production: [...seedProductionRows],
  gas: [...seedGasRows],
};

function makeKey(dataset: DatasetKind, row: ProductionRecord | GasReadingRecord): string {
  if (dataset === "production") {
    const item = row as ProductionRecord;
    return [item.ym, item.line, item.product, item.material].join("|");
  }

  const item = row as GasReadingRecord;
  return [item.ym, item.furnace_no, item.line, item.basis].join("|");
}

function mergeRows<T extends ProductionRecord | GasReadingRecord>(
  existing: T[],
  incoming: T[],
  dataset: DatasetKind
): T[] {
  const incomingKeys = new Set(incoming.map((row) => makeKey(dataset, row)));
  const filtered = existing.filter((row) => !incomingKeys.has(makeKey(dataset, row)));
  return [...incoming, ...filtered];
}

function cloneState(state: StoreState): StoreState {
  return {
    production: [...state.production],
    gas: [...state.gas],
    lastImport: state.lastImport,
  };
}

interface SupabaseLikeSelectQuery extends PromiseLike<{
  data: Array<Record<string, unknown>> | null;
  error: null | { message: string };
}> {
  order(column: string, options: { ascending: boolean }): SupabaseLikeSelectQuery;
  limit(count: number): SupabaseLikeSelectQuery;
}

interface SupabaseLikeClient {
  from(table: "production" | "gas_reading" | "import_log"): {
    select(columns: string): SupabaseLikeSelectQuery;
    upsert(
      payload: Array<Record<string, unknown>>,
      options: { onConflict: string }
    ): {
      select(columns: string): Promise<{
        data: Array<{ ym: string }> | null;
        error: null | { message: string };
      }>;
    };
    insert(payload: Record<string, unknown>): Promise<{
      error: null | { message: string };
    }>;
  };
  auth?: {
    getUser(): Promise<{
      data: {
        user: {
          id: string;
          email?: string | null;
        } | null;
      };
    }>;
  };
}

function toImportSummary(row: Record<string, unknown> | undefined): ImportSummary | undefined {
  if (!row) {
    return undefined;
  }

  const warnings = Array.isArray(row.warnings) ? (row.warnings as ImportIssue[]) : [];

  return {
    dataset: (row.dataset as DatasetKind) ?? "production",
    inserted: Number(row.inserted ?? 0),
    fileName: String(row.file_name ?? ""),
    importedAt: String(row.imported_at ?? ""),
    warnings,
  };
}

async function readLatestImportSummary(client: SupabaseLikeClient): Promise<ImportSummary | undefined> {
  const latestResult = await client
    .from("import_log")
    .select("dataset,inserted,file_name,imported_at,warnings")
    .order("imported_at", { ascending: false })
    .limit(1);

  if (latestResult.error) {
    throw latestResult.error;
  }

  const latestRow = latestResult.data?.[0];

  return toImportSummary(latestRow);
}

async function readLocalStore(): Promise<StorePayload | null> {
  try {
    const raw = await readFile(LOCAL_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreState>;

    if (!Array.isArray(parsed.production) || !Array.isArray(parsed.gas)) {
      return null;
    }

    const state: StoreState = {
      production: parsed.production as ProductionRecord[],
      gas: parsed.gas as GasReadingRecord[],
      lastImport: parsed.lastImport as ImportSummary | undefined,
    };

    return {
      ...cloneState(state),
      source: state.lastImport ? "memory" : "seed",
    };
  } catch {
    return null;
  }
}

async function writeLocalStore(state: StoreState): Promise<void> {
  await mkdir(path.dirname(LOCAL_STORE_PATH), { recursive: true });
  await writeFile(LOCAL_STORE_PATH, JSON.stringify(state, null, 2), "utf8");
}

async function readFromSupabase(): Promise<StorePayload | null> {
  if (hasSupabaseAuthConfig()) {
    const authClient = await createSupabaseServerClient();

    if (!authClient) {
      return null;
    }

    const [productionResult, gasResult] = await Promise.all([
      authClient
        .from("production")
        .select("ym,line,product,material,weight_ton,work_hours,plan_ton")
        .order("ym", { ascending: true })
        .order("line", { ascending: true }),
      authClient
        .from("gas_reading")
        .select("ym,furnace_no,line,usage_m3,basis")
        .order("ym", { ascending: true })
        .order("furnace_no", { ascending: true }),
    ]);

    if (productionResult.error) {
      throw productionResult.error;
    }

    if (gasResult.error) {
      throw gasResult.error;
    }

    const lastImport = await readLatestImportSummary(authClient as unknown as SupabaseLikeClient);

    return {
      production: (productionResult.data ?? []) as ProductionRecord[],
      gas: (gasResult.data ?? []) as GasReadingRecord[],
      source: "supabase",
      lastImport,
    };
  }

  const client = getSupabaseAdminClient();

  if (!client || !hasSupabaseConfig()) {
    return null;
  }

  const [productionResult, gasResult] = await Promise.all([
    client
      .from("production")
      .select("ym,line,product,material,weight_ton,work_hours,plan_ton")
      .order("ym", { ascending: true })
      .order("line", { ascending: true }),
    client
      .from("gas_reading")
      .select("ym,furnace_no,line,usage_m3,basis")
      .order("ym", { ascending: true })
      .order("furnace_no", { ascending: true }),
  ]);

  if (productionResult.error) {
    throw productionResult.error;
  }

  if (gasResult.error) {
    throw gasResult.error;
  }

  const lastImport = await readLatestImportSummary(client as unknown as SupabaseLikeClient);

  return {
    production: (productionResult.data ?? []) as ProductionRecord[],
    gas: (gasResult.data ?? []) as GasReadingRecord[],
    source: "supabase",
    lastImport,
  };
}

export async function loadStore(): Promise<StorePayload> {
  try {
    const supabasePayload = await readFromSupabase();

    if (supabasePayload) {
      memoryState.production = [...supabasePayload.production];
      memoryState.gas = [...supabasePayload.gas];
      memoryState.lastImport = supabasePayload.lastImport;
      return supabasePayload;
    }
  } catch {
    // Fall back to local memory when Supabase is unavailable or the schema is not ready yet.
  }

  const localPayload = await readLocalStore();

  if (localPayload) {
    memoryState.production = [...localPayload.production];
    memoryState.gas = [...localPayload.gas];
    memoryState.lastImport = localPayload.lastImport;
    return localPayload;
  }

  return {
    production: [...memoryState.production],
    gas: [...memoryState.gas],
    source: memoryState.lastImport ? "memory" : "seed",
    lastImport: memoryState.lastImport,
  };
}

export async function saveImportedRows(
  dataset: DatasetKind,
  rows: Array<ProductionRecord | GasReadingRecord>,
  fileName: string,
  warnings: ImportIssue[] = []
): Promise<ImportSummary> {
  const importedAt = new Date().toISOString();
  let inserted = rows.length;
  const summary: ImportSummary = {
    dataset,
    inserted,
    fileName,
    importedAt,
    warnings,
  };

  const client = getSupabaseAdminClient();
  const authClient = hasSupabaseAuthConfig() ? await createSupabaseServerClient() : null;
  const hasSupabase = Boolean(client && hasSupabaseConfig()) || Boolean(authClient);

  if (authClient) {
    const upsertPayload = rows.map((row) => ({ ...row }));

    const response =
      dataset === "production"
        ? await authClient
            .from("production")
            .upsert(upsertPayload, {
              onConflict: "ym,line,product,material",
            })
            .select("ym")
        : await authClient
            .from("gas_reading")
            .upsert(upsertPayload, {
              onConflict: "ym,furnace_no,line,basis",
            })
            .select("ym");

    if (response.error) {
      throw response.error;
    }

    inserted = response.data?.length ?? rows.length;
  } else if (hasSupabase && client) {
    const upsertPayload = rows.map((row) => ({ ...row }));

    const response =
      dataset === "production"
        ? await client
            .from("production")
            .upsert(upsertPayload, {
              onConflict: "ym,line,product,material",
            })
            .select("ym")
        : await client
            .from("gas_reading")
            .upsert(upsertPayload, {
              onConflict: "ym,furnace_no,line,basis",
            })
            .select("ym");

    if (response.error) {
      throw response.error;
    }

    inserted = response.data?.length ?? rows.length;
  }

  if (hasSupabase) {
    if (dataset === "production") {
      memoryState.production = mergeRows(
        memoryState.production,
        rows as ProductionRecord[],
        dataset
      );
    } else {
      memoryState.gas = mergeRows(
        memoryState.gas,
        rows as GasReadingRecord[],
        dataset
      );
    }

    const logClient = authClient ?? client;

    if (logClient) {
      let createdBy: string | null = null;

      if (authClient) {
        const authUser = await authClient.auth.getUser();
        createdBy = authUser.data.user?.id ?? null;
      }

      const logResult = await (logClient as unknown as SupabaseLikeClient)
        .from("import_log")
        .insert({
          dataset,
          inserted,
          file_name: fileName,
          imported_at: importedAt,
          warnings,
          created_by: createdBy ?? null,
        });

      if (logResult.error) {
        throw logResult.error;
      }
    }
  } else {
    const currentStore =
      (await readLocalStore()) ?? {
        production: [...memoryState.production],
        gas: [...memoryState.gas],
        source: memoryState.lastImport ? "memory" : "seed",
        lastImport: memoryState.lastImport,
      };

    const nextState: StoreState = {
      production: [...currentStore.production],
      gas: [...currentStore.gas],
      lastImport: currentStore.lastImport,
    };

    if (dataset === "production") {
      nextState.production = mergeRows(nextState.production, rows as ProductionRecord[], dataset);
    } else {
      nextState.gas = mergeRows(nextState.gas, rows as GasReadingRecord[], dataset);
    }

    memoryState.production = [...nextState.production];
    memoryState.gas = [...nextState.gas];
  }

  memoryState.lastImport = summary;

  if (!hasSupabase) {
    await writeLocalStore(memoryState);
  }

  return summary;
}

export async function getStoreSnapshot(): Promise<StorePayload> {
  return loadStore();
}

export function getMemoryImportSummary(): ImportSummary | undefined {
  return memoryState.lastImport;
}
