/**
 * PROP-TCU-015: Clock.now() call count per path.
 *
 * Tier 1 — spy wrapper to instrument clockNow per pipeline path.
 * Required: false
 *
 * Invariant: idempotent=0, not-found=0, hydration-fail=0;
 * all write paths (happy/save-fail)=1; never exceeds 1 per invocation.
 *
 * Covers: REQ-TCU-012
 *
 * RED phase: imports from non-existent implementation file.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
import type { NoteFileSnapshot, HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { TagChipCommand } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { Result } from "promptnotes-domain-types/util/result";
import type { TagChipUpdateDeps } from "../_deltas";

import { tagChipUpdate } from "../../../tag-chip-update/pipeline";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}
function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}
function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}
function makeFrontmatter(tags: Tag[] = []): Frontmatter {
  return {
    tags,
    createdAt: { epochMillis: 1000 } as unknown as Timestamp,
    updatedAt: { epochMillis: 2000 } as unknown as Timestamp,
  } as unknown as Frontmatter;
}
function makeNote(id: NoteId, tags: Tag[] = []): Note {
  return {
    id,
    body: "body" as unknown,
    frontmatter: makeFrontmatter(tags),
  } as Note;
}
function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    filePath: `/vault/${noteId}.md`,
    frontmatter: makeFrontmatter(),
    bodyPreview: "body",
    fileSize: 10,
    lastModifiedAt: makeTimestamp(2000),
  } as unknown as NoteFileSnapshot;
}
function makeFeed(ids: NoteId[] = []): Feed {
  return {
    noteRefs: ids,
    filterCriteria: { tags: [], frontmatterFields: new Map() },
    searchQuery: null,
    sortOrder: { field: "timestamp", direction: "desc" },
  } as unknown as Feed;
}
function makeInventory(): TagInventory {
  return { entries: [], lastBuiltAt: makeTimestamp(1000) };
}

type DepsWithClock = TagChipUpdateDeps & { _clockCallCount: number };

function makeDepsWithClockSpy(opts: {
  noteId: NoteId;
  noteTags: Tag[];
  hydrateOk: boolean;
  writeResult: Result<NoteFileSaved, FsError>;
}): DepsWithClock {
  let clockCallCount = 0;
  const snapshot = makeSnapshot(opts.noteId);
  const note = makeNote(opts.noteId, opts.noteTags);

  return {
    clockNow: () => {
      clockCallCount++;
      return makeTimestamp(5000);
    },
    getNoteSnapshot: (id: NoteId) => (id === opts.noteId ? snapshot : null),
    hydrateNote: (): Result<Note, HydrationFailureReason> =>
      opts.hydrateOk
        ? { ok: true, value: note }
        : {
            ok: false,
            error: { kind: "parse-error", detail: "bad" } as unknown as HydrationFailureReason,
          },
    publish: () => {},
    publishInternal: () => {},
    writeMarkdown: async (req: unknown): Promise<Result<NoteFileSaved, FsError>> => {
      if (opts.writeResult.ok) {
        const r = req as { noteId: NoteId; frontmatter: Frontmatter; previousFrontmatter: Frontmatter; body: unknown; occurredOn: Timestamp };
        return {
          ok: true,
          value: {
            kind: "note-file-saved",
            noteId: r.noteId,
            body: r.body,
            frontmatter: r.frontmatter,
            previousFrontmatter: r.previousFrontmatter,
            occurredOn: r.occurredOn,
          } as NoteFileSaved,
        };
      }
      return opts.writeResult;
    },
    getAllSnapshots: () => [snapshot],
    get _clockCallCount() { return clockCallCount; },
  } as DepsWithClock;
}

// ── PROP-TCU-015 ─────────────────────────────────────────────────────────

describe("PROP-TCU-015: Clock.now() budget — 0 on idempotent/error paths, 1 on write paths", () => {

  test("idempotent add (tag present): Clock.now() = 0", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("ts");
    const deps = makeDepsWithClockSpy({
      noteId,
      noteTags: [tag], // tag IS present → idempotent add
      hydrateOk: true,
      writeResult: { ok: true, value: {} as NoteFileSaved },
    });
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    expect(deps._clockCallCount).toBe(0);
  });

  test("idempotent remove (tag absent): Clock.now() = 0", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("ts");
    const deps = makeDepsWithClockSpy({
      noteId,
      noteTags: [], // tag NOT present → idempotent remove
      hydrateOk: true,
      writeResult: { ok: true, value: {} as NoteFileSaved },
    });
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    expect(deps._clockCallCount).toBe(0);
  });

  test("not-found error: Clock.now() = 0", async () => {
    const noteId = makeNoteId("2026-04-30-120000-999"); // not in snapshot store
    const tag = makeTag("ts");
    const deps = makeDepsWithClockSpy({
      noteId: makeNoteId("2026-04-30-120000-001"), // different id
      noteTags: [],
      hydrateOk: true,
      writeResult: { ok: true, value: {} as NoteFileSaved },
    });
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, makeFeed(), makeInventory())(command);

    expect(deps._clockCallCount).toBe(0);
  });

  test("hydration-fail error: Clock.now() = 0", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("ts");
    const deps = makeDepsWithClockSpy({
      noteId,
      noteTags: [],
      hydrateOk: false, // hydration fails
      writeResult: { ok: true, value: {} as NoteFileSaved },
    });
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    expect(deps._clockCallCount).toBe(0);
  });

  test("happy add (write succeeds): Clock.now() = 1", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("ts");
    const deps = makeDepsWithClockSpy({
      noteId,
      noteTags: [], // tag absent → non-idempotent add
      hydrateOk: true,
      writeResult: { ok: true, value: {} as NoteFileSaved },
    });
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    expect(deps._clockCallCount).toBe(1);
  });

  test("happy remove (write succeeds): Clock.now() = 1", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("ts");
    const deps = makeDepsWithClockSpy({
      noteId,
      noteTags: [tag], // tag present → non-idempotent remove
      hydrateOk: true,
      writeResult: { ok: true, value: {} as NoteFileSaved },
    });
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    expect(deps._clockCallCount).toBe(1);
  });

  test("save-fail (add): Clock.now() = 1", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("ts");
    const deps = makeDepsWithClockSpy({
      noteId,
      noteTags: [],
      hydrateOk: true,
      writeResult: { ok: false, error: { kind: "disk-full" } },
    });
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    expect(deps._clockCallCount).toBe(1);
  });

  test("Clock.now() never exceeds 1 per invocation on any path", async () => {
    // Property-based: generate random paths and verify call count <= 1
    const paths: Array<{ tagPresent: boolean; hydrateOk: boolean; writeOk: boolean }> = [
      { tagPresent: true,  hydrateOk: true,  writeOk: true  }, // idempotent add → 0
      { tagPresent: false, hydrateOk: true,  writeOk: true  }, // happy add      → 1
      { tagPresent: false, hydrateOk: true,  writeOk: false }, // save-fail      → 1
      { tagPresent: false, hydrateOk: false, writeOk: true  }, // hydrate-fail   → 0
    ];

    for (const path of paths) {
      const noteId = makeNoteId("2026-04-30-120000-001");
      const tag = makeTag("ts");
      const deps = makeDepsWithClockSpy({
        noteId,
        noteTags: path.tagPresent ? [tag] : [],
        hydrateOk: path.hydrateOk,
        writeResult: path.writeOk
          ? { ok: true, value: {} as NoteFileSaved }
          : { ok: false, error: { kind: "disk-full" } },
      });
      const command: TagChipCommand = { kind: "add", noteId, tag };

      await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

      expect(deps._clockCallCount).toBeLessThanOrEqual(1);
    }
  });
});
