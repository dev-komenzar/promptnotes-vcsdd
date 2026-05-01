/**
 * PROP-010: FsError pass-through — for each FsError variant, the wrapped
 * SaveError.fs.reason is structurally equal to the original error.
 *
 * Tier 1 — parameterized property test.
 * Required: true
 */

import { describe, test, expect } from "bun:test";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type {
  Body,
  Frontmatter,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState } from "promptnotes-domain-types/capture/states";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const body = (s: string): Body => s as unknown as Body;

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
  const note: Note = {
    id: id("2026-04-30-120000-000"),
    body: body("x"),
    frontmatter: {
      tags: [],
      createdAt: ts(1),
      updatedAt: ts(2),
    } as unknown as Frontmatter,
  };
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
        bodyForClipboard: (n) => n.body as unknown as string,
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
