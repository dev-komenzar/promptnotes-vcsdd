/**
 * PROP-EPNS-005: SwitchError type exhaustiveness
 * Tier 0 — TypeScript compile-time check
 * Required: true
 *
 * Sprint 2 block-based:
 * SwitchError.pendingNextFocus = { noteId: NoteId; blockId: BlockId }
 * (replaces Sprint 1's pendingNextNoteId: NoteId)
 *
 * If SwitchError gains a new variant, the `never` branch fails to compile.
 * If pendingNextFocus loses blockId, this file fails to compile.
 */

import { describe, test, expect } from "bun:test";
import type { SwitchError } from "promptnotes-domain-types/shared/errors";
import type { NoteId, BlockId } from "promptnotes-domain-types/shared/value-objects";

// Exhaustive switch — compile-time proof that SwitchError has exactly one variant.
// Sprint 2: reference pendingNextFocus.blockId to verify the shape.
function handleSwitchError(error: SwitchError): string {
  switch (error.kind) {
    case "save-failed-during-switch": {
      // Both noteId and blockId must exist on pendingNextFocus (Sprint 2 contract)
      const _noteId: NoteId = error.pendingNextFocus.noteId;
      const _blockId: BlockId = error.pendingNextFocus.blockId;
      void _noteId;
      void _blockId;
      return `Save failed: underlying=${error.underlying.kind}, target=${error.pendingNextFocus.noteId as unknown as string}/${error.pendingNextFocus.blockId as unknown as string}`;
    }
    default: {
      // If this compiles, SwitchError has exactly one variant
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

// Type-level: pendingNextFocus.blockId must be present (Sprint 2 delta)
type _PendingNextFocusHasBlockId = SwitchError["pendingNextFocus"]["blockId"];
const _pendingHasBlockId: _PendingNextFocusHasBlockId = "block-id" as unknown as BlockId;
void _pendingHasBlockId;

// Type-level: pendingNextFocus.noteId must be present
type _PendingNextFocusHasNoteId = SwitchError["pendingNextFocus"]["noteId"];
const _pendingHasNoteId: _PendingNextFocusHasNoteId = "note-id" as unknown as NoteId;
void _pendingHasNoteId;

describe("PROP-EPNS-005: SwitchError type exhaustiveness (Sprint 2 block-based)", () => {
  test("SwitchError has exactly one variant: save-failed-during-switch", () => {
    const noteId = "2026-04-30-150000-000" as unknown as NoteId;
    const blockId = "block-target-001" as unknown as BlockId;
    const testError: SwitchError = {
      kind: "save-failed-during-switch",
      underlying: { kind: "fs", reason: { kind: "permission" } },
      pendingNextFocus: { noteId, blockId },
    };
    const result = handleSwitchError(testError);
    expect(result).toContain("Save failed");
    expect(result).toContain("underlying=fs");
  });

  test("pendingNextFocus carries both noteId and blockId (Sprint 2 shape)", () => {
    const noteId = "2026-04-30-150000-001" as unknown as NoteId;
    const blockId = "block-specific-007" as unknown as BlockId;
    const error: SwitchError = {
      kind: "save-failed-during-switch",
      underlying: { kind: "fs", reason: { kind: "lock" } },
      pendingNextFocus: { noteId, blockId },
    };
    expect(error.pendingNextFocus.noteId).toBe(noteId);
    expect(error.pendingNextFocus.blockId).toBe(blockId);
    // Verify blockId exists in shape (not just noteId as in Sprint 1)
    expect("blockId" in error.pendingNextFocus).toBe(true);
  });
});
