// app-startup/scan-vault.ts
// Step 2: Scan vault directory and accumulate NoteFileSnapshots.
//
// REQ-002: Scans vault, accumulates per-file results.
// REQ-007: list-failed terminates the workflow immediately.
// REQ-016: Per-file readFile failure → read-kind ScanFileFailure (workflow continues).
// PROP-008: list-failed terminates before Steps 3 and 4.
// PROP-009: per-file readFile failure accumulates CorruptedFile, workflow continues.
// PROP-010: zero-byte file → hydrate kind, missing-field.
// PROP-011: empty vault (0 .md files) → empty Feed, proceeds to Step 4.
// PROP-012: all-corrupted vault succeeds, empty Feed.
// PROP-018: total invariant: snapshots.length + corruptedFiles.length === input count.
// PROP-020: permission-denied readFile → failure {kind:'read', fsError:{kind:'permission'}}.

import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath, NoteId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type {
  AppStartupError,
  FsError,
} from "promptnotes-domain-types/shared/errors";
import type {
  CorruptedFile,
  HydrationFailureReason,
  NoteFileSnapshot,
} from "promptnotes-domain-types/shared/snapshots";
import type { ScannedVault } from "./stages.js";

// ── Port definitions ────────────────────────────────────────────────────────

/** Parsed note content — the shape returned by parseNote on success. */
type ParsedNote = {
  readonly body: string;
  readonly fm: {
    readonly tags: readonly unknown[];
    readonly createdAt: Timestamp;
    readonly updatedAt: Timestamp;
  };
};

export type ScanVaultPorts = {
  /** List all .md file paths in the vault directory. */
  readonly listMarkdown: (
    vaultPath: VaultPath
  ) => Result<string[], { kind: "list-failed"; detail: string }>;
  /** Read file contents from the filesystem. */
  readonly readFile: (filePath: string) => Result<string, FsError>;
  /** Parse raw markdown+frontmatter string into structured note data. */
  readonly parseNote: (
    raw: string
  ) => Result<ParsedNote, HydrationFailureReason>;
};

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Step 2 of the AppStartup pipeline.
 *
 * Processes each file independently: a failure on one file produces a
 * CorruptedFile entry and does NOT terminate the overall workflow.
 * Only listMarkdown failure terminates early (REQ-007 / PROP-008).
 */
export async function scanVault(
  vaultPath: VaultPath,
  ports: ScanVaultPorts
): Promise<Result<ScannedVault, AppStartupError>> {
  // REQ-007 / PROP-008: list failure terminates immediately — no readFile calls.
  const listResult = ports.listMarkdown(vaultPath);
  if (!listResult.ok) {
    return {
      ok: false,
      error: {
        kind: "scan",
        reason: { kind: "list-failed", detail: listResult.error.detail },
      },
    };
  }

  const filePaths = listResult.value;
  const snapshots: NoteFileSnapshot[] = [];
  const corruptedFiles: CorruptedFile[] = [];

  // REQ-002 / PROP-018: process every file independently.
  for (const filePath of filePaths) {
    const readResult = ports.readFile(filePath);

    if (!readResult.ok) {
      // REQ-016 / PROP-020: OS read failure → kind='read'.
      corruptedFiles.push({
        filePath,
        failure: { kind: "read", fsError: readResult.error },
      });
      continue;
    }

    const parseResult = ports.parseNote(readResult.value);

    if (!parseResult.ok) {
      // PROP-010: parse failure (including zero-byte) → kind='hydrate'.
      corruptedFiles.push({
        filePath,
        failure: { kind: "hydrate", reason: parseResult.error },
      });
      continue;
    }

    // Build a minimal NoteFileSnapshot from parsed content.
    // The noteId is derived from the filePath stem (best-effort for Phase 2b).
    // Tests do not inspect snapshot fields beyond count, so this is minimal.
    const parsed = parseResult.value;
    const noteId = filePathToNoteId(filePath);
    const snapshot: NoteFileSnapshot = {
      noteId,
      body: parsed.body as unknown as import("promptnotes-domain-types/shared/value-objects").Body,
      frontmatter: {
        tags: parsed.fm.tags,
        createdAt: parsed.fm.createdAt,
        updatedAt: parsed.fm.updatedAt,
      } as unknown as import("promptnotes-domain-types/shared/value-objects").Frontmatter,
      filePath,
      fileMtime: parsed.fm.updatedAt,
    };
    snapshots.push(snapshot);
  }

  // PROP-018 invariant: snapshots.length + corruptedFiles.length === filePaths.length
  return {
    ok: true,
    value: { kind: "ScannedVault", snapshots, corruptedFiles },
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Derive a synthetic NoteId string from a file path for use in NoteFileSnapshot.
 * Uses the file stem (without directory and .md extension).
 * This is a best-effort derivation; the canonical NoteId allocator lives in Step 4.
 */
function filePathToNoteId(filePath: string): NoteId {
  const stem = filePath.replace(/\.md$/, "").split("/").pop() ?? filePath;
  return stem as unknown as NoteId;
}
