// app-startup/pipeline.ts
// Full AppStartup pipeline — orchestrates Steps 1 through 4.
//
// REQ-001: Happy path full pipeline.
// REQ-013a: VaultScanned emitted after Step 2 (Vault public domain event).
// REQ-013b: FeedRestored then TagInventoryBuilt emitted after VaultScanned (Curate-internal).
// PROP-017: Full pipeline integration: happy path → InitialUIState with editing status.
// PROP-021: Event ordering: VaultScanned → FeedRestored → TagInventoryBuilt.

import type { Result } from "promptnotes-domain-types/util/result";
import type {
  VaultPath,
  VaultId,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { AppStartupError, FsError } from "promptnotes-domain-types/shared/errors";
import type { HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { InitialUIState, ParsedNote } from "./stages.js";
import { loadVaultConfig } from "./load-vault-config.js";
import { scanVault } from "./scan-vault.js";
import { hydrateFeed } from "./hydrate-feed.js";
import { initializeCaptureSession } from "./initialize-capture.js";

// ── Port definitions ────────────────────────────────────────────────────────

/**
 * All ports required to run the full AppStartup pipeline.
 * Combines ports from Steps 1, 2, and 4 plus vaultId for VaultScanned event.
 */
export type AppStartupPipelinePorts = {
  // Step 1 ports
  readonly settingsLoad: () => Result<VaultPath | null, never>;
  readonly statDir: (path: string) => Result<boolean, FsError>;
  // Step 2 ports
  readonly listMarkdown: (
    vaultPath: VaultPath
  ) => Result<string[], { kind: "list-failed"; detail: string }>;
  readonly readFile: (filePath: string) => Result<string, FsError>;
  readonly parseNote: (
    raw: string
  ) => Result<ParsedNote, HydrationFailureReason>;
  // Step 4 ports
  readonly clockNow: () => Timestamp;
  readonly allocateNoteId: (now: Timestamp) => NoteId;
  // Shared event emitter
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
  // VaultId for VaultScanned public domain event
  readonly vaultId: VaultId;
};

// ── Pipeline implementation ─────────────────────────────────────────────────

/**
 * Orchestrates the four-step AppStartup pipeline.
 *
 * Steps:
 *   1. loadVaultConfig — verifies VaultPath, emits VaultDirectoryNotConfigured on failure.
 *   2. scanVault — enumerates .md files, accumulates snapshots and corruptedFiles.
 *   3. hydrateFeed (pure) — builds Feed and TagInventory.
 *   4. initializeCaptureSession — allocates NoteId, emits two Capture-internal events.
 *
 * Between steps 2 and 3, emits VaultScanned (Vault public domain event).
 * Between steps 3 and 4, emits FeedRestored then TagInventoryBuilt (Curate-internal).
 *
 * PROP-021 event ordering: VaultScanned → FeedRestored → TagInventoryBuilt.
 */
export async function runAppStartupPipeline(
  ports: AppStartupPipelinePorts
): Promise<Result<InitialUIState, AppStartupError>> {
  // ── Step 1: load and validate vault configuration ──────────────────────
  const step1Result = await loadVaultConfig(ports);
  if (!step1Result.ok) {
    return step1Result;
  }
  const configuredVault = step1Result.value;

  // ── Step 2: scan vault directory ─────────────────────────────────────
  const step2Result = await scanVault(configuredVault.vaultPath, ports);
  if (!step2Result.ok) {
    return step2Result;
  }
  const scannedVault = step2Result.value;

  // REQ-013a: emit VaultScanned public domain event (Vault context).
  const occurredOn = ports.clockNow();
  ports.emit({
    kind: "vault-scanned",
    vaultId: ports.vaultId,
    snapshots: scannedVault.snapshots,
    corruptedFiles: scannedVault.corruptedFiles,
    occurredOn,
  });

  // ── Step 3: hydrate Feed (pure) ───────────────────────────────────────
  const hydratedFeed = hydrateFeed(scannedVault);

  // REQ-013b: emit FeedRestored then TagInventoryBuilt (Curate-internal, in order).
  ports.emit({ kind: "feed-restored", occurredOn });
  ports.emit({ kind: "tag-inventory-built", occurredOn });

  // ── Step 4: initialize capture session ───────────────────────────────
  const initialUIState = await initializeCaptureSession(hydratedFeed, ports);

  return { ok: true, value: initialUIState };
}
