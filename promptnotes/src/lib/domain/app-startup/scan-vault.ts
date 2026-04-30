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
import type {
  Frontmatter,
  NoteId,
  VaultPath,
} from "promptnotes-domain-types/shared/value-objects";
import type {
  AppStartupError,
  FsError,
} from "promptnotes-domain-types/shared/errors";
import type {
  CorruptedFile,
  HydrationFailureReason,
  NoteFileSnapshot,
} from "promptnotes-domain-types/shared/snapshots";
import type { ParsedNote, ScannedVault } from "./stages.js";

// ── Port definitions ────────────────────────────────────────────────────────

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

    // FIND-004: validate the file stem against the NoteId VO format
    // before constructing the NoteFileSnapshot. Non-conforming stems are
    // recorded as CorruptedFile with hydrate/invalid-value, never reach Step 3.
    const stem = filePathStem(filePath);
    if (!isValidNoteIdFormat(stem)) {
      corruptedFiles.push({
        filePath,
        failure: { kind: "hydrate", reason: "invalid-value" },
      });
      continue;
    }

    // FIND-006: validate every tag in the parsed frontmatter against the
    // Tag VO rules. Empty / whitespace-only strings would be rejected by
    // Tag.tryNew; surface the violation as CorruptedFile/hydrate/invalid-value.
    const parsed = parseResult.value;
    if (!areAllTagsValid(parsed.fm.tags)) {
      corruptedFiles.push({
        filePath,
        failure: { kind: "hydrate", reason: "invalid-value" },
      });
      continue;
    }

    const snapshot: NoteFileSnapshot = {
      noteId: stem as unknown as NoteId,
      body: parsed.body,
      frontmatter: {
        tags: parsed.fm.tags,
        createdAt: parsed.fm.createdAt,
        updatedAt: parsed.fm.updatedAt,
      } as unknown as Frontmatter,
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

/** Strip directory components and the trailing `.md` extension. */
function filePathStem(filePath: string): string {
  return filePath.replace(/\.md$/, "").split("/").pop() ?? filePath;
}

/** Anchored NoteId format regex: `YYYY-MM-DD-HHmmss-SSS[-N]` (REQ-011 AC). */
const NOTE_ID_FORMAT = /^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}(-\d+)?$/;

/**
 * NoteId VO Smart Constructor mirror — accepts the same set of strings as
 * `NoteId::try_new` in docs/domain/code/rust/src/value_objects.rs.
 */
function isValidNoteIdFormat(raw: string): boolean {
  return NOTE_ID_FORMAT.test(raw);
}

/**
 * Tag VO admissibility: non-empty string after trim. Mirrors the rejection set
 * of `Tag.tryNew` (`{kind:'empty'}` and `{kind:'only-whitespace'}`); both
 * collapse to `invalid-value` per F-005 / FIND-006.
 */
function isValidTag(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim().length > 0;
}

function areAllTagsValid(tags: readonly unknown[]): boolean {
  return tags.every(isValidTag);
}
