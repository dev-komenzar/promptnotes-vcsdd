/**
 * PROP-EPNS-026: Enumerative SaveError → NoteSaveFailureReason mapping
 * Tier 1 — fast-check oneof over all SaveError discriminants
 * Required: false
 *
 * For every SaveError discriminant, the emitted NoteSaveFailed.reason
 * matches the table in REQ-EPNS-004:
 *   { kind:'fs', reason:{kind:'permission'} }   → "permission"
 *   { kind:'fs', reason:{kind:'disk-full'} }    → "disk-full"
 *   { kind:'fs', reason:{kind:'lock'} }         → "lock"
 *   { kind:'fs', reason:{kind:'not-found'} }    → "unknown"
 *   { kind:'fs', reason:{kind:'unknown'} }      → "unknown"
 *   { kind:'validation', ... }                  → "unknown"
 *
 * Tests flushCurrentSession directly (unit level) with each SaveError variant.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
  Frontmatter,
  BlockId,
  BlockContent,
  BlockType,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { SaveError, NoteSaveFailureReason } from "promptnotes-domain-types/shared/errors";
import type { NoteSaveFailed } from "promptnotes-domain-types/shared/events";
import type { CurrentSessionDecision, BlockFocusRequest } from "promptnotes-domain-types/capture/stages";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";

import {
  flushCurrentSession,
  type FlushCurrentSessionPorts,
} from "../../../edit-past-note-start/flush-current-session";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId { return raw as unknown as NoteId; }
function makeBlockId(raw: string): BlockId { return raw as unknown as BlockId; }
function makeTimestamp(ms: number): Timestamp { return { epochMillis: ms } as unknown as Timestamp; }
function makeBlockContent(raw: string): BlockContent { return raw as unknown as BlockContent; }
function makeFrontmatter(): Frontmatter {
  return { tags: [], createdAt: makeTimestamp(1000), updatedAt: makeTimestamp(1000) } as unknown as Frontmatter;
}
function makeBlock(content: string, type: BlockType = "paragraph", id = "block-001"): Block {
  return { id: makeBlockId(id), type: type as unknown as BlockType, content: makeBlockContent(content) } as unknown as Block;
}
function makeNote(noteId: NoteId): Note {
  return { id: noteId, blocks: [makeBlock("content")], frontmatter: makeFrontmatter() } as unknown as Note;
}
function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    body: "content" as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    filePath: "/vault/test.md",
    fileMtime: makeTimestamp(1000),
  } as unknown as NoteFileSnapshot;
}

function runFlushAndGetReason(saveError: SaveError): NoteSaveFailureReason {
  const noteId = makeNoteId("2026-04-30-120000-026");
  const targetId = makeNoteId("2026-04-30-150000-026");
  const note = makeNote(noteId);
  const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
  const request: BlockFocusRequest = {
    kind: "BlockFocusRequest",
    noteId: targetId,
    blockId: makeBlockId("block-target"),
    snapshot: makeSnapshot(targetId),
  };
  const emittedEvents: Array<{ kind: string; [k: string]: unknown }> = [];
  const ports: FlushCurrentSessionPorts = {
    clockNow: () => makeTimestamp(1000),
    blurSave: () => ({ ok: false as const, error: saveError }),
    emit: (e) => emittedEvents.push(e),
  };
  flushCurrentSession(decision, request, ports, null);
  const failEvent = emittedEvents.find((e) => e.kind === "note-save-failed") as NoteSaveFailed | undefined;
  if (!failEvent) throw new Error("NoteSaveFailed not emitted");
  return failEvent.reason;
}

// ── Table-driven: all 6 SaveError discriminants ────────────────────────

describe("PROP-EPNS-026: SaveError → NoteSaveFailureReason mapping (REQ-EPNS-004)", () => {
  test("fs/permission → 'permission'", () => {
    const error: SaveError = { kind: "fs", reason: { kind: "permission" } };
    expect(runFlushAndGetReason(error)).toBe("permission");
  });

  test("fs/disk-full → 'disk-full'", () => {
    const error: SaveError = { kind: "fs", reason: { kind: "disk-full" } };
    expect(runFlushAndGetReason(error)).toBe("disk-full");
  });

  test("fs/lock → 'lock'", () => {
    const error: SaveError = { kind: "fs", reason: { kind: "lock" } };
    expect(runFlushAndGetReason(error)).toBe("lock");
  });

  test("fs/not-found → 'unknown'", () => {
    const error: SaveError = { kind: "fs", reason: { kind: "not-found", path: "/x" } };
    expect(runFlushAndGetReason(error)).toBe("unknown");
  });

  test("fs/unknown → 'unknown'", () => {
    const error: SaveError = { kind: "fs", reason: { kind: "unknown", detail: "err" } };
    expect(runFlushAndGetReason(error)).toBe("unknown");
  });

  test("validation/any → 'unknown'", () => {
    const error: SaveError = { kind: "validation", reason: { kind: "empty-body-on-idle" } };
    expect(runFlushAndGetReason(error)).toBe("unknown");
  });

  test("validation/invariant-violated → 'unknown'", () => {
    const error: SaveError = { kind: "validation", reason: { kind: "invariant-violated", detail: "bad" } };
    expect(runFlushAndGetReason(error)).toBe("unknown");
  });
});

// ── fast-check: property over all SaveError variants ─────────────────────

describe("PROP-EPNS-026: fast-check property — all SaveError discriminants produce valid reason", () => {
  const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
    fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
    fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
    fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
    fc.constant({ kind: "fs" as const, reason: { kind: "not-found" as const, path: "/vault/x.md" } }),
    fc.constant({ kind: "fs" as const, reason: { kind: "unknown" as const, detail: "test error" } }),
    fc.constant({ kind: "validation" as const, reason: { kind: "empty-body-on-idle" as const } }),
    fc.constant({ kind: "validation" as const, reason: { kind: "invariant-violated" as const, detail: "bad" } }),
  );

  const validReasons = new Set<NoteSaveFailureReason>(["permission", "disk-full", "lock", "unknown"]);

  test("∀ SaveError variant, emitted reason is a valid NoteSaveFailureReason (200 runs)", () => {
    fc.assert(
      fc.property(arbSaveError, (saveError) => {
        const reason = runFlushAndGetReason(saveError);
        expect(validReasons.has(reason)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test("fs/permission always maps to 'permission' (not unknown)", () => {
    const error: SaveError = { kind: "fs", reason: { kind: "permission" } };
    expect(runFlushAndGetReason(error)).not.toBe("unknown");
    expect(runFlushAndGetReason(error)).toBe("permission");
  });
});
