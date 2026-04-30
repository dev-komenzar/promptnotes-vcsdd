// app-startup/stages.ts
// Value types representing the intermediate results at each pipeline stage.
// These are internal to the app-startup workflow; they are NOT domain events
// and do NOT cross bounded context boundaries.

import type {
  Body,
  Frontmatter,
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
 * FIND-005 / FIND-013 (Tier-0): both `fm.tags` and `body` are tightened to
 * the corresponding VO types. The parser port is the boundary that owns
 * Tag and Body VO construction — scanVault consumes already-validated values
 * and never re-wraps raw strings. scanVault still defensively re-validates
 * tag values (FIND-006) so a parser that smuggles raw strings via `as` casts
 * is rejected at runtime.
 *
 * FIND-016 (Sprint-4 2b, Tier-0 follow-up to FIND-013): `fm` は構造的型から
 * branded `Frontmatter` VO に締め直す。parser port が Frontmatter.tryNew に
 * よる構築責任を持つ。scan-vault.ts は受け取った Frontmatter を直接
 * NoteFileSnapshot.frontmatter に代入し、スキャン境界で再構築しない。
 * `Tag` / `Timestamp` は EditingState / ScannedVault 経由で他の型から引き続き
 * 参照されるため引き続き import を維持する。
 */
export type ParsedNote = {
  readonly body: Body;
  readonly fm: Frontmatter;
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
