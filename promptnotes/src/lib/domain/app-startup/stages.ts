// app-startup/stages.ts
// Value types representing the intermediate results at each pipeline stage.
// These are internal to the app-startup workflow; they are NOT domain events
// and do NOT cross bounded context boundaries.

import type {
  Tag,
  Timestamp,
  VaultPath,
} from "promptnotes-domain-types/shared/value-objects";
import type {
  CorruptedFile,
  NoteFileSnapshot,
} from "promptnotes-domain-types/shared/snapshots";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { EditingState } from "promptnotes-domain-types/capture/states";

// ── Parser-result shape (shared by Step 2 and the pipeline ports) ─────────

/**
 * Structured parse result returned by the FrontmatterParser port.
 *
 * FIND-005 (Tier-0): `fm.tags` is tightened to `readonly Tag[]` so the parser
 * port owns Tag VO construction. `body` remains `string` because scanVault is
 * the boundary that wraps the raw markdown into a Body VO; treating body as
 * `Body` here would force every parser stub to perform that cast itself.
 * scanVault still defensively re-validates the tag values (FIND-006) so a
 * parser that smuggles raw strings via `as` casts is rejected at runtime.
 */
export type ParsedNote = {
  readonly body: string;
  readonly fm: {
    readonly tags: readonly Tag[];
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
 * REQ-014 AC: shape {feed, tagInventory, corruptedFiles, editingSessionState}.
 *
 * FIND-001: editingSessionState (EditingState union member) replaces the
 * earlier flat `initialNoteId` field — it is the canonical Capture state
 * machine value, not just an id. The currentNoteId is reachable via
 * editingSessionState.currentNoteId in the editing branch.
 */
export type InitialUIState = {
  readonly kind: "InitialUIState";
  readonly feed: Feed;
  readonly tagInventory: TagInventory;
  readonly corruptedFiles: readonly CorruptedFile[];
  /** The Capture editing state seeded with the auto-allocated new NoteId. */
  readonly editingSessionState: EditingState;
};
