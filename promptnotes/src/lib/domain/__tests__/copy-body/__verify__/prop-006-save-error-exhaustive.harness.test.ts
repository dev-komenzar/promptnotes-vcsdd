/**
 * PROP-006: SaveError exhaustiveness — only `kind: "fs"` is producible by copyBody.
 * The `validation` branch is dead code in this pipeline.
 *
 * Sprint 3: Note fixture updated to use blocks shape `{ id, blocks, frontmatter }`.
 *
 * Tier 0 — type-level / compile-time check, with a runtime assertion that
 * enumerates every FsError variant and confirms the wrapper is always `kind:"fs"`.
 * Required: true
 * REQ: REQ-010
 */

import { describe, test, expect } from "bun:test";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Frontmatter,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { EditingState } from "promptnotes-domain-types/capture/states";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const blockId = (s: string): BlockId => s as unknown as BlockId;
const blockContent = (s: string): BlockContent => s as unknown as BlockContent;

function makeNote(): Note {
  const blocks: ReadonlyArray<Block> = [
    {
      id: blockId("blk-001"),
      type: "paragraph" as BlockType,
      content: blockContent("x"),
    } as unknown as Block,
  ];
  return {
    id: id("2026-04-30-120000-000"),
    blocks,
    frontmatter: {
      tags: [],
      createdAt: ts(1),
      updatedAt: ts(2),
    } as unknown as Frontmatter,
  } as unknown as Note;
}

function makeState(noteId: NoteId): EditingState {
  return {
    status: "editing",
    currentNoteId: noteId,
    isDirty: false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  } as EditingState;
}

const allFsErrors: FsError[] = [
  { kind: "permission" },
  { kind: "permission", path: "/p" },
  { kind: "disk-full" },
  { kind: "lock" },
  { kind: "lock", path: "/l" },
  { kind: "not-found" },
  { kind: "not-found", path: "/n" },
  { kind: "unknown", detail: "boom" },
];

describe("PROP-006: SaveError exhaustiveness — only fs variant is producible", () => {
  test("type-level: switch over SaveError narrows to fs after asserting !validation", () => {
    // This is a compile-time exhaustiveness anchor. If SaveError gains a new variant,
    // this never-branch will fail to compile.
    const sample: SaveError = { kind: "fs", reason: { kind: "permission" } };
    function describe_(e: SaveError): string {
      switch (e.kind) {
        case "fs":
          return "fs";
        case "validation":
          return "validation";
        default: {
          const _exhaustive: never = e;
          return _exhaustive;
        }
      }
    }
    expect(describe_(sample)).toBe("fs");
  });

  test("runtime: every FsError variant produces SaveError.kind === 'fs', never 'validation'", () => {
    for (const fe of allFsErrors) {
      const note = makeNote();
      const state = makeState(note.id);
      const ports: CopyBodyPorts = {
        clockNow: () => ts(0),
        clipboardWrite: (): Result<void, FsError> => ({ ok: false, error: fe }),
        getCurrentNote: () => note,
        bodyForClipboard: (n) => serializeBlocksToMarkdown(n.blocks),
        emitInternal: () => {},
      };
      const result = copyBody(ports)(state);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.kind).toBe("fs");
      expect((result.error as { kind: string }).kind).not.toBe("validation");
    }
  });
});
