/**
 * PROP-010: FsError pass-through — for each FsError variant, the wrapped
 * SaveError.fs.reason is structurally equal to the original error.
 *
 * Sprint 3: Note fixture updated to use blocks shape `{ id, blocks, frontmatter }`.
 *
 * Tier 1 — parameterized property test.
 * Required: true
 * REQ: REQ-004, REQ-010
 */

import { describe, test, expect } from "bun:test";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
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

const variants: FsError[] = [
  { kind: "permission" },
  { kind: "permission", path: "/p" },
  { kind: "disk-full" },
  { kind: "lock" },
  { kind: "lock", path: "/l" },
  { kind: "not-found" },
  { kind: "not-found", path: "/n" },
  { kind: "unknown", detail: "boom" },
];

function makeFixture() {
  const blocks: ReadonlyArray<Block> = [
    {
      id: blockId("blk-001"),
      type: "paragraph" as BlockType,
      content: blockContent("x"),
    } as unknown as Block,
  ];
  const note: Note = {
    id: id("2026-04-30-120000-000"),
    blocks,
    frontmatter: {
      tags: [],
      createdAt: ts(1),
      updatedAt: ts(2),
    } as unknown as Frontmatter,
  } as unknown as Note;
  const state: EditingState = {
    status: "editing",
    currentNoteId: note.id,
    isDirty: false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  } as EditingState;
  return { note, state };
}

describe("PROP-010: FsError pass-through", () => {
  for (const v of variants) {
    test(`variant ${v.kind}${"path" in v && v.path ? `+path` : ""}${"detail" in v && v.detail ? `+detail` : ""} preserved`, () => {
      const { note, state } = makeFixture();
      const ports: CopyBodyPorts = {
        clockNow: () => ts(0),
        clipboardWrite: (): Result<void, FsError> => ({ ok: false, error: v }),
        getCurrentNote: () => note,
        bodyForClipboard: (n) => serializeBlocksToMarkdown(n.blocks),
        emitInternal: () => {},
      };
      const r = copyBody(ports)(state);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.kind).toBe("fs");
      if (r.error.kind !== "fs") return;
      expect(r.error.reason).toEqual(v);
    });
  }
});
