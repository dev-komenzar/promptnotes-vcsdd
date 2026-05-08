// app-startup/scan-vault.ts
// Step 2: Scan vault directory and accumulate NoteFileSnapshots.
//
// REQ-002: Scans vault, accumulates per-file results.
// REQ-007: list-failed terminates the workflow immediately.
// REQ-016: Per-file readFile failure → read-kind ScanFileFailure (workflow continues).
// REQ-017: parseMarkdownToBlocks failure / Ok([]) → hydrate-kind reason='block-parse'.
// REQ-018: Per-file parser exception / unrecognised Err variant → reason='unknown'.
// PROP-008: list-failed terminates before Steps 3 and 4.
// PROP-009: per-file readFile failure accumulates CorruptedFile, workflow continues.
// PROP-010: zero-byte file → hydrate kind, missing-field.
// PROP-011: empty vault (0 .md files) → empty Feed, proceeds to Step 4.
// PROP-012: all-corrupted vault succeeds, empty Feed.
// PROP-018: total invariant: snapshots.length + corruptedFiles.length === input count.
// PROP-020: permission-denied readFile → failure {kind:'read', fsError:{kind:'permission'}}.
// PROP-026: parseMarkdownToBlocks Err → failure {kind:'hydrate', reason:'block-parse'}.
// PROP-028: uncaught exception / unrecognised Err variant → reason:'unknown'.
// PROP-029: parseMarkdownToBlocks Ok([]) → failure {kind:'hydrate', reason:'block-parse'}.

import type { Result } from "promptnotes-domain-types/util/result";
import type {
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
import type { Block } from "promptnotes-domain-types/shared/note";
import type { BlockParseError } from "../capture-auto-save/parse-markdown-to-blocks.js";
import type { ParsedNote, ScannedVault } from "./stages.js";

// ── Known HydrationFailureReason variants ─────────────────────────────────

const KNOWN_HYDRATION_REASONS = new Set<string>([
  "yaml-parse",
  "missing-field",
  "invalid-value",
  "block-parse",
  "unknown",
]);

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
  /**
   * REQ-002 (rev7): Optional block parser port.
   * When provided, scanVault calls it after parseNote succeeds to validate
   * block structure. Err(BlockParseError) or Ok([]) → CorruptedFile reason='block-parse'.
   * The parsed Block[] is discarded — NoteFileSnapshot carries the raw body.
   */
  readonly parseMarkdownToBlocks?: (
    markdown: string
  ) => Result<ReadonlyArray<Block>, BlockParseError>;
};

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Step 2 of the AppStartup pipeline.
 *
 * Processes each file independently: a failure on one file produces a
 * CorruptedFile entry and does NOT terminate the overall workflow.
 * Only listMarkdown failure terminates early (REQ-007 / PROP-008).
 *
 * Defensive try/catch per file: parser exceptions and unrecognised Err variants
 * fold to failure:{kind:'hydrate', reason:'unknown'} (REQ-018 / PROP-028).
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

    // REQ-018 / PROP-028: wrap parsing in try/catch to catch synchronous exceptions.
    let parseResult: Result<ParsedNote, HydrationFailureReason>;
    try {
      parseResult = ports.parseNote(readResult.value);
    } catch (err) {
      corruptedFiles.push(
        makeUnknownFailure(filePath, err)
      );
      continue;
    }

    if (!parseResult.ok) {
      // PROP-028: fold unrecognised Err variants to 'unknown'.
      const reason = isKnownHydrationReason(parseResult.error)
        ? parseResult.error
        : "unknown";
      corruptedFiles.push({
        filePath,
        failure: { kind: "hydrate", reason },
      });
      continue;
    }

    // REQ-017 / PROP-026 / PROP-029: block-parse validation (when port is provided).
    if (ports.parseMarkdownToBlocks !== undefined) {
      let blockResult: Result<ReadonlyArray<Block>, BlockParseError>;
      try {
        blockResult = ports.parseMarkdownToBlocks(
          parseResult.value.body as unknown as string
        );
      } catch (err) {
        corruptedFiles.push(makeUnknownFailure(filePath, err));
        continue;
      }

      // Err(BlockParseError) or Ok([]) both → reason='block-parse' (REQ-017 / PROP-029).
      if (!blockResult.ok || blockResult.value.length === 0) {
        const detail = blockResult.ok
          ? "empty block array"
          : blockResultDetail(blockResult.error);
        corruptedFiles.push({
          filePath,
          failure: { kind: "hydrate", reason: "block-parse" },
          detail,
        });
        continue;
      }
      // Validated Block[] is discarded — NoteFileSnapshot carries the raw body (REQ-002 rev7).
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

    // FIND-016 (Sprint-4 2b): parser port が Frontmatter VO を保証済みのため
    // スキャン境界での再構築を撤廃し parsed.fm を直接代入する。
    // `as unknown as Frontmatter` キャストを除去。
    const snapshot: NoteFileSnapshot = {
      noteId: stem as unknown as NoteId,
      body: parsed.body,
      frontmatter: parsed.fm,
      filePath,
      fileMtime: parsed.fm.updatedAt,
    };
    snapshots.push(snapshot);
  }

  // PROP-018 invariant: snapshots.length + corruptedFiles.length === filePaths.length
  return {
    ok: true,
    value: {
      kind: "ScannedVault",
      snapshots,
      corruptedFiles,
      // PROP-030: carry the injected block parser so hydrateFeed can use the same
      // reference for Step 3 call-budget counting.
      parseMarkdownToBlocks: ports.parseMarkdownToBlocks,
    },
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

/**
 * REQ-018: check if a runtime value is a statically-known HydrationFailureReason.
 * A future value from an upgraded shared type would fail this check and fold to 'unknown'.
 */
function isKnownHydrationReason(reason: HydrationFailureReason): boolean {
  return KNOWN_HYDRATION_REASONS.has(reason as unknown as string);
}

/** REQ-018 / PROP-028: build a CorruptedFile with reason='unknown' from a caught exception. */
function makeUnknownFailure(filePath: string, err: unknown): CorruptedFile {
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  return {
    filePath,
    failure: { kind: "hydrate", reason: "unknown" },
    detail,
  };
}

/** Produce a human-readable description of a BlockParseError for the detail field. */
function blockResultDetail(error: BlockParseError): string {
  return error.kind === "unterminated-code-fence"
    ? `unterminated code fence at line ${error.line}`
    : `malformed structure at line ${error.line}: ${error.detail}`;
}
