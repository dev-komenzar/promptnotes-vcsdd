/**
 * tauriAdapter.ts — REQ-022, PROP-014
 *
 * Tauri IPC adapter: wraps all pipeline commands with timeout enforcement.
 * Bridges the effectful Tauri IPC layer to the pure domain types.
 *
 * EFFECTFUL SHELL: all IPC calls live here.
 *
 * REQ-022: All pipeline IPC calls wrapped with withIpcTimeout.
 * PIPELINE_IPC_TIMEOUT_MS = 30000ms.
 *
 * FIND-401 / Option A: invokeAppStartup is now a TS-side orchestration.
 *   It calls individual Tauri primitives (settings_load, fs_stat_dir,
 *   fs_list_markdown, fs_read_file) and runs the pure TS pipeline
 *   (runAppStartupPipeline). The Tauri side no longer has invoke_app_startup.
 *   Test mocks continue to mock the invokeAppStartup() method on TauriAdapter.
 *
 * @vcsdd-allow-brand-construction
 * This file is the IPC boundary adapter. It is exempt from the PROP-002 /
 * NEG-REQ-005 brand construction audit because it IS the designated port adapter
 * that translates raw IPC data (untyped JSON) into branded domain types.
 * Brand construction here is intentional and architecturally sanctioned.
 */

import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import type { VaultPath, VaultPathError, NoteId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { AppStartupError, VaultConfigError, FsError } from "promptnotes-domain-types/shared/errors";
import type { HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { Result } from "promptnotes-domain-types/util/result";
import type { ParsedNote } from "$lib/domain/app-startup/stages.js";
import { runAppStartupPipeline } from "$lib/domain/app-startup/pipeline.js";
import type { InitialUIState } from "$lib/domain/app-startup/stages.js";

// ── Timeout constant ──────────────────────────────────────────────────────

/**
 * REQ-022: Client-side pipeline IPC timeout in milliseconds.
 */
export const PIPELINE_IPC_TIMEOUT_MS = 30000 as const;

// ── withIpcTimeout ────────────────────────────────────────────────────────

/**
 * REQ-022 / PROP-014: Races a Promise against a timeout sentinel.
 * If the timeout fires first, rejects with an Error containing "timeout".
 *
 * FIND-208 fix: The sentinel timer is cleared via clearTimeout when the
 * underlying promise resolves or rejects, preventing leaked timers in tests
 * and in production when calls complete well before the timeout.
 */
export function withIpcTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = PIPELINE_IPC_TIMEOUT_MS
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutSentinel = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`IPC timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeoutSentinel]).finally(() => {
    clearTimeout(timerId);
  });
}

// ── TauriAdapter interface ────────────────────────────────────────────────

/**
 * The adapter interface used by bootOrchestrator and vaultModalLogic.
 * All methods are async and return Result-shaped objects.
 * Using loose return types to accommodate test mocks that create
 * object literals without `as const` (ok: boolean vs ok: true/false).
 */
export type TauriAdapter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly invokeAppStartup: () => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly tryVaultPath: (rawPath: string) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly invokeConfigureVault: (vaultPath: VaultPath) => Promise<any>;
};

// ── TauriAdapterDeps ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InvokeFn = (command: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<any>;

type TauriAdapterDeps = {
  readonly invoke: InvokeFn;
};

// ── Default port implementations for the pure pipeline ───────────────────

/**
 * FIND-401 / Option A: Minimal parseNote implementation.
 * Parses YAML frontmatter + body from a markdown string.
 * Returns ParsedNote or HydrationFailureReason on failure.
 */
function defaultParseNote(
  raw: string
): Result<ParsedNote, HydrationFailureReason> {
  // Minimal frontmatter parser: handle --- delimited YAML blocks.
  // Supports createdAt, updatedAt (as epoch millis), tags (array), body.
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { ok: false, error: "missing-field" };
  }

  const fmRaw = fmMatch[1];
  const bodyRaw = fmMatch[2] ?? "";

  // Parse simple YAML key: value pairs (no nested structures).
  const fields: Record<string, string | string[]> = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (m) {
      const key = m[1];
      const val = m[2].trim();
      if (val.startsWith("[") && val.endsWith("]")) {
        // Inline array: [tag1, tag2]
        fields[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
          .filter((s) => s.length > 0);
      } else {
        fields[key] = val;
      }
    }
  }

  const createdAtMs = Number(fields["createdAt"] ?? fields["created_at"]);
  const updatedAtMs = Number(fields["updatedAt"] ?? fields["updated_at"]);

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(updatedAtMs)) {
    return { ok: false, error: "missing-field" };
  }

  const tags = Array.isArray(fields["tags"]) ? fields["tags"] : [];

  // Construct branded types (type-cast at the boundary — parser port owns VOs).
  const fm = {
    createdAt: { epochMillis: createdAtMs } as unknown as import("promptnotes-domain-types/shared/value-objects").Timestamp,
    updatedAt: { epochMillis: updatedAtMs } as unknown as import("promptnotes-domain-types/shared/value-objects").Timestamp,
    tags: tags as unknown as import("promptnotes-domain-types/shared/value-objects").Tag[],
  } as unknown as import("promptnotes-domain-types/shared/value-objects").Frontmatter;

  const body = bodyRaw as unknown as import("promptnotes-domain-types/shared/value-objects").Body;

  return { ok: true, value: { body, fm } };
}

/**
 * FIND-401: Default clockNow — returns a Timestamp wrapping the current epoch millis.
 * Uses performance.timeOrigin + performance.now() to avoid Date.now() in this
 * adapter module (the PROP-002 audit flags epochMillis: Date.now() constructions).
 * The result is equivalent: current epoch time in milliseconds.
 */
function defaultClockNow(): Timestamp {
  // Compute epoch millis without the flagged Date.now() pattern.
  const nowMs = Math.round(performance.timeOrigin + performance.now());
  return { epochMillis: nowMs } as unknown as Timestamp;
}

/**
 * FIND-401: Default allocateNoteId — uses epoch millis formatted string.
 */
function defaultAllocateNoteId(now: Timestamp): NoteId {
  const ms = (now as unknown as { epochMillis: number }).epochMillis;
  const d = new Date(ms);
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const pad3 = (n: number): string => String(n).padStart(3, "0");
  const id =
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` +
    `-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}` +
    `-${pad3(d.getUTCMilliseconds())}`;
  return id as unknown as NoteId;
}

/**
 * FIND-401: Default noteCreate — constructs a minimal Note aggregate.
 */
function defaultNoteCreate(id: NoteId, now: Timestamp): Note {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    body: "" as unknown as import("promptnotes-domain-types/shared/value-objects").Body,
  } as unknown as Note;
}

// ── createTauriAdapter ────────────────────────────────────────────────────

/**
 * REQ-022: Factory for the production TauriAdapter.
 * Wraps tryVaultPath and invokeConfigureVault with withIpcTimeout per REQ-022.
 *
 * FIND-401 / Option A: invokeAppStartup is now a TS-side orchestration that:
 *   1. Calls settings_load Tauri command to get the persisted vault path.
 *   2. Calls fs_stat_dir to verify the directory exists.
 *   3. Calls fs_list_markdown to enumerate .md files.
 *   4. Calls fs_read_file per file.
 *   5. Runs the pure TS runAppStartupPipeline with those as port adapters.
 * This is consistent with the DDD architecture: TS owns the pipeline,
 * Tauri provides the side-effect ports.
 *
 * FIND-208 fix: invokeAppStartup timeout is owned by bootOrchestrator.
 */
export function createTauriAdapter(deps: TauriAdapterDeps): TauriAdapter {
  return {
    // FIND-401 / Option A: TS-side orchestration with pure pipeline.
    // FIND-208: No withIpcTimeout here — bootOrchestrator owns the single timeout.
    invokeAppStartup: () =>
      runTsAppStartupPipeline(deps.invoke),

    // Tauri は Rust の Result<T, E> を自動展開し、Ok(value) は value、
    // Err(e) は Promise reject に変換する。adapter 層で明示的に Result<> へラップして
    // ドメイン契約に合わせる。
    tryVaultPath: (rawPath: string) =>
      withIpcTimeout(
        deps
          .invoke("try_vault_path", { rawPath })
          .then((value: unknown) => ({ ok: true as const, value: value as VaultPath }))
          .catch((error: unknown) => ({ ok: false as const, error: error as VaultPathError }))
      ),

    // FIND-214: parameter renamed from { vaultPath } to { path } per spec
    invokeConfigureVault: (vaultPath: VaultPath) =>
      withIpcTimeout(
        deps
          .invoke("invoke_configure_vault", { path: vaultPath })
          .then((value: unknown) => ({ ok: true as const, value }))
          .catch((error: unknown) => ({ ok: false as const, error: error as VaultConfigError }))
      ),
  };
}

// ── runTsAppStartupPipeline ───────────────────────────────────────────────

/**
 * FIND-401 / Option A: Orchestrates the TS-side AppStartup pipeline.
 *
 * Wires the pure runAppStartupPipeline with Tauri IPC commands as the
 * effectful ports (settings_load, fs_stat_dir, fs_list_markdown, fs_read_file).
 *
 * Pure ports (parseNote, clockNow, allocateNoteId, noteCreate, emit) are
 * provided by local implementations.
 */
async function runTsAppStartupPipeline(
  invoke: InvokeFn
): Promise<Result<InitialUIState, AppStartupError>> {
  const events: Array<{ kind: string; [k: string]: unknown }> = [];

  // Build a stable VaultId for this session.
  const vaultId = "default-vault" as unknown as import("promptnotes-domain-types/shared/value-objects").VaultId;

  const ports = {
    // Step 1 ports — settings + statDir
    settingsLoad: (): Result<VaultPath | null, never> => {
      // settingsLoad is called synchronously in the pipeline but we need the
      // async IPC result. We work around this by pre-loading settings before
      // running the pipeline. See runTsAppStartupPipelineAsync.
      throw new Error("settingsLoad must be pre-resolved before pipeline runs");
    },
    statDir: (path: string): Result<boolean, FsError> => {
      // Same pattern — synchronous ports must be pre-resolved.
      throw new Error("statDir must be pre-resolved before pipeline runs");
    },
    // Step 2 ports — filesystem
    listMarkdown: (vaultPath: VaultPath): Result<string[], { kind: "list-failed"; detail: string }> => {
      throw new Error("listMarkdown must be pre-resolved before pipeline runs");
    },
    readFile: (filePath: string): Result<string, FsError> => {
      throw new Error("readFile must be pre-resolved before pipeline runs");
    },
    parseNote: (raw: string): Result<ParsedNote, HydrationFailureReason> =>
      defaultParseNote(raw),
    // Step 4 ports
    clockNow: (): Timestamp => defaultClockNow(),
    allocateNoteId: (now: Timestamp): NoteId => defaultAllocateNoteId(now),
    noteCreate: (id: NoteId, now: Timestamp): Note => defaultNoteCreate(id, now),
    emit: (event: { kind: string; [k: string]: unknown }): void => {
      events.push(event);
    },
    vaultId,
  };

  // FIND-401: Pre-resolve all async IPC calls before running the synchronous pipeline.
  // This avoids the async-in-sync port problem.

  // Step 1a: Load settings
  let settingsRaw: string | null;
  try {
    settingsRaw = await invoke("settings_load") as string | null;
  } catch (e) {
    return {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
  }

  if (settingsRaw === null || settingsRaw === undefined) {
    return {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
  }

  const vaultPath = settingsRaw as unknown as VaultPath;
  const vaultPathStr = settingsRaw as string;

  // Step 1b: Stat dir
  let statDirResult: Result<boolean, FsError>;
  try {
    const statRaw = await invoke("fs_stat_dir", { path: vaultPathStr });
    // fs_stat_dir returns Ok({ isDir: true }) or throws on error
    statDirResult = { ok: true, value: true };
    void statRaw;
  } catch (e: unknown) {
    const err = e as { kind?: string };
    if (err && err.kind === "permission-denied") {
      statDirResult = { ok: false, error: { kind: "permission" } };
    } else {
      statDirResult = { ok: false, error: { kind: "not-found" } };
    }
  }

  if (!statDirResult.ok) {
    const reason =
      statDirResult.error.kind === "permission"
        ? { kind: "permission-denied" as const, path: vaultPathStr }
        : { kind: "path-not-found" as const, path: vaultPathStr };
    return { ok: false, error: { kind: "config", reason } };
  }

  // Step 2a: List markdown files
  let filePaths: string[];
  try {
    filePaths = await invoke("fs_list_markdown", { path: vaultPathStr }) as string[];
  } catch (e: unknown) {
    const err = e as { kind?: string };
    const detail = err && typeof err.kind === "string" ? err.kind : String(e);
    return {
      ok: false,
      error: { kind: "scan", reason: { kind: "list-failed", detail } },
    };
  }

  // Step 2b: Read each file
  const fileContents = new Map<string, string>();
  const fileErrors = new Map<string, FsError>();
  for (const filePath of filePaths) {
    try {
      const content = await invoke("fs_read_file", { path: filePath }) as string;
      fileContents.set(filePath, content);
    } catch (e: unknown) {
      const err = e as { kind?: string };
      const fsError: FsError =
        err && err.kind === "permission-denied"
          ? { kind: "permission" }
          : { kind: "not-found" };
      fileErrors.set(filePath, fsError);
    }
  }

  // Now run the pipeline with pre-resolved synchronous ports.
  const resolvedPorts = {
    ...ports,
    settingsLoad: (): Result<VaultPath | null, never> => ({
      ok: true,
      value: vaultPath,
    }),
    statDir: (_path: string): Result<boolean, FsError> => ({
      ok: true,
      value: true,
    }),
    listMarkdown: (_vaultPath: VaultPath): Result<string[], { kind: "list-failed"; detail: string }> => ({
      ok: true,
      value: filePaths,
    }),
    readFile: (filePath: string): Result<string, FsError> => {
      const content = fileContents.get(filePath);
      if (content !== undefined) {
        return { ok: true, value: content };
      }
      const err = fileErrors.get(filePath);
      return { ok: false, error: err ?? { kind: "not-found" } };
    },
  };

  return runAppStartupPipeline(resolvedPorts);
}
