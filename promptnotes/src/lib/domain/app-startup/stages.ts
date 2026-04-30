// app-startup/stages.ts
// Value types representing the intermediate results at each pipeline stage.
// These are internal to the app-startup workflow; they are NOT domain events
// and do NOT cross bounded context boundaries.

import type {
  NoteId,
  Timestamp,
  VaultPath,
} from "promptnotes-domain-types/shared/value-objects";
import type {
  CorruptedFile,
  NoteFileSnapshot,
} from "promptnotes-domain-types/shared/snapshots";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";

// ── Parser-result shape (shared by Step 2 and the pipeline ports) ─────────

/**
 * Structured parse result returned by the FrontmatterParser port.
 * The body is a raw string (Body VO conversion happens inside scanVault).
 * The frontmatter fields are typed as Timestamp because port implementations
 * are expected to construct VO-validated values.
 */
export type ParsedNote = {
  readonly body: string;
  readonly fm: {
    readonly tags: readonly unknown[];
    readonly createdAt: Timestamp;
    readonly updatedAt: Timestamp;
  };
};

// ── Step 1 output ──────────────────────────────────────────────────────────

/** Produced by Step 1 (loadVaultConfig). VaultPath is verified to exist. */
export type ConfiguredVault = {
  readonly kind: "ConfiguredVault";
  readonly vaultPath: VaultPath;
};

// ── Step 2 output ──────────────────────────────────────────────────────────

/**
 * Produced by Step 2 (scanVault).
 * Invariant: snapshots.length + corruptedFiles.length === total files enumerated.
 */
export type ScannedVault = {
  readonly kind: "ScannedVault";
  readonly snapshots: readonly NoteFileSnapshot[];
  readonly corruptedFiles: readonly CorruptedFile[];
};

// ── Step 3 output ──────────────────────────────────────────────────────────

/**
 * Produced by Step 3 (hydrateFeed). Pure — no ports, no async.
 * corruptedFiles passed through unchanged from ScannedVault.
 */
export type HydratedFeed = {
  readonly kind: "HydratedFeed";
  readonly feed: Feed;
  readonly tagInventory: TagInventory;
  readonly corruptedFiles: readonly CorruptedFile[];
};

// ── Step 4 output / pipeline final output ─────────────────────────────────

/**
 * Produced by Step 4 (initializeCaptureSession).
 * This is the post-condition of the full AppStartup pipeline.
 * REQ-014 AC: shape {feed, tagInventory, corruptedFiles, initialNoteId}.
 */
export type InitialUIState = {
  readonly kind: "InitialUIState";
  readonly feed: Feed;
  readonly tagInventory: TagInventory;
  readonly corruptedFiles: readonly CorruptedFile[];
  /** The NoteId allocated for the auto-created new note at session start. */
  readonly initialNoteId: NoteId;
};
