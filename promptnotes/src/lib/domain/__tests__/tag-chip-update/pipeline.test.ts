/**
 * pipeline.test.ts — Full TagChipUpdate pipeline integration tests
 *
 * REQ-TCU-001: Happy path — tag add → Ok(IndexedNote)
 * REQ-TCU-002: Happy path — tag remove → Ok(IndexedNote)
 * REQ-TCU-003: Idempotent add (tag already present) — no I/O, no Clock
 * REQ-TCU-004: Idempotent remove (tag already absent) — no I/O, no Clock
 * REQ-TCU-005: not-found error → Err(SaveError cause='note-not-in-feed')
 * REQ-TCU-006: hydration-fail error → Err(SaveError cause='hydration-failed')
 * REQ-TCU-007: NoteEditError from addTag → Err(SaveError cause='frontmatter-invariant')
 * REQ-TCU-008: save-fail → NoteSaveFailed emitted, projections NOT updated
 * REQ-TCU-009: previousFrontmatter sourcing (non-null)
 * REQ-TCU-010: TagInventoryUpdated emitted via publishInternal on happy path
 * REQ-TCU-011: NoteFileSaved IS PublicDomainEvent; TagInventoryUpdated IS CurateInternalEvent
 * REQ-TCU-012: Clock budget (max 1 per invocation; 0 on idempotent/error paths)
 *
 * PROP-TCU-004: No-op short-circuit — write/publish/clock never called
 * PROP-TCU-006: Save-failure projection isolation
 * PROP-TCU-007: SaveError + SaveValidationError.cause exhaustiveness
 * PROP-TCU-008: Happy-path add — tagInventory contains added tag
 * PROP-TCU-009: Happy-path remove — tagInventory does not contain removed tag
 * PROP-TCU-010: Not-found error returns correct SaveError
 * PROP-TCU-011: Hydration-fail returns correct SaveError
 * PROP-TCU-015: Clock budget per path
 * PROP-TCU-018: NoteSaveFailed reason mapping
 * PROP-TCU-019: Full pipeline integration
 * PROP-TCU-021: occurredOn threading invariant
 *
 * RED phase: imports from non-existent implementation file.
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type {
  NoteFileSaved,
  NoteSaveFailed,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type { CurateInternalEvent } from "promptnotes-domain-types/curate/internal-events";
import type { MutatedNote, TagChipCommand, IndexedNote } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory, TagEntry } from "promptnotes-domain-types/curate/read-models";
import type { NoteFileSnapshot, HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";
import type {
  SaveErrorDelta,
  TagChipUpdateDeps,
  WriteMarkdown,
} from "./_deltas";

import { tagChipUpdate } from "../../tag-chip-update/pipeline";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}
function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}
function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}
function makeFrontmatter(opts?: {
  tags?: Tag[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}): Frontmatter {
  return {
    tags: opts?.tags ?? [],
    createdAt: opts?.createdAt ?? makeTimestamp(1000),
    updatedAt: opts?.updatedAt ?? makeTimestamp(2000),
  } as unknown as Frontmatter;
}
function makeNote(opts?: {
  id?: NoteId;
  frontmatter?: Frontmatter;
}): Note {
  return {
    id: opts?.id ?? makeNoteId("2026-04-30-120000-001"),
    body: "hello" as unknown,
    frontmatter: opts?.frontmatter ?? makeFrontmatter(),
  } as Note;
}
function makeSnapshot(noteId: NoteId, fm?: Frontmatter): NoteFileSnapshot {
  return {
    noteId,
    filePath: `/vault/${noteId}.md`,
    frontmatter: fm ?? makeFrontmatter(),
    bodyPreview: "hello",
    fileSize: 42,
    lastModifiedAt: makeTimestamp(2000),
  } as unknown as NoteFileSnapshot;
}
function makeFeed(noteIds: NoteId[] = []): Feed {
  return {
    noteRefs: noteIds,
    filterCriteria: { tags: [], frontmatterFields: new Map() },
    searchQuery: null,
    sortOrder: { field: "timestamp", direction: "desc" },
  } as unknown as Feed;
}
function makeTagInventory(entries: TagEntry[] = []): TagInventory {
  return {
    entries,
    lastBuiltAt: makeTimestamp(1000),
  };
}
function makeTagEntry(tag: Tag, usageCount: number): TagEntry {
  return { name: tag, usageCount };
}

type SpyDeps = TagChipUpdateDeps & {
  _clockCallCount: number;
  _writeMarkdownCallCount: number;
  _publishCallCount: number;
  _publishInternalCallCount: number;
  _publishedEvents: unknown[];
  _publishInternalEvents: unknown[];
  _savedRequests: unknown[];
};

function makeHappyDeps(opts?: {
  noteId?: NoteId;
  noteTags?: Tag[];
  writeMarkdownResult?: Result<NoteFileSaved, FsError>;
  now?: Timestamp;
}): SpyDeps {
  const noteId = opts?.noteId ?? makeNoteId("2026-04-30-120000-001");
  const noteTags = opts?.noteTags ?? [];
  const noteFm = makeFrontmatter({ tags: noteTags });
  const note = makeNote({ id: noteId, frontmatter: noteFm });
  const snapshot = makeSnapshot(noteId, noteFm);
  const now = opts?.now ?? makeTimestamp(5000);

  let clockCallCount = 0;
  let writeMarkdownCallCount = 0;
  let publishCallCount = 0;
  let publishInternalCallCount = 0;
  const publishedEvents: unknown[] = [];
  const publishInternalEvents: unknown[] = [];
  const savedRequests: unknown[] = [];

  const defaultWriteResult: Result<NoteFileSaved, FsError> = {
    ok: true,
    value: {
      kind: "note-file-saved",
      noteId,
      body: note.body,
      frontmatter: noteFm,
      previousFrontmatter: noteFm,
      occurredOn: now,
    } as NoteFileSaved,
  };

  const writeMarkdownResult = opts?.writeMarkdownResult ?? defaultWriteResult;

  return {
    clockNow: () => {
      clockCallCount++;
      return now;
    },
    getNoteSnapshot: (id: NoteId) => (id === noteId ? snapshot : null),
    hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
      ok: true,
      value: note,
    }),
    publish: (e: PublicDomainEvent) => {
      publishCallCount++;
      publishedEvents.push(e);
    },
    publishInternal: (e: CurateInternalEvent) => {
      publishInternalCallCount++;
      publishInternalEvents.push(e);
    },
    writeMarkdown: async (req: unknown): Promise<Result<NoteFileSaved, FsError>> => {
      writeMarkdownCallCount++;
      savedRequests.push(req);
      if (writeMarkdownResult.ok) {
        // Echo occurredOn from the request
        const request = req as { occurredOn: Timestamp; noteId: NoteId; frontmatter: Frontmatter; previousFrontmatter: Frontmatter; body: unknown };
        return {
          ok: true,
          value: {
            kind: "note-file-saved",
            noteId: request.noteId,
            body: request.body,
            frontmatter: request.frontmatter,
            previousFrontmatter: request.previousFrontmatter,
            occurredOn: request.occurredOn,
          } as NoteFileSaved,
        };
      }
      return writeMarkdownResult;
    },
    getAllSnapshots: () => [snapshot],
    get _clockCallCount() { return clockCallCount; },
    get _writeMarkdownCallCount() { return writeMarkdownCallCount; },
    get _publishCallCount() { return publishCallCount; },
    get _publishInternalCallCount() { return publishInternalCallCount; },
    get _publishedEvents() { return publishedEvents; },
    get _publishInternalEvents() { return publishInternalEvents; },
    get _savedRequests() { return savedRequests; },
  } as SpyDeps;
}

function makeNotFoundDeps(opts?: { noteId?: NoteId }): SpyDeps {
  return makeHappyDeps({
    ...opts,
    // getNoteSnapshot will return null by default for unknown noteId
  });
}

// ── REQ-TCU-001: Happy path — tag add ─────────────────────────────────────

describe("REQ-TCU-001: Happy path — tag add", () => {
  test("returns Ok(IndexedNote) on successful add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] }); // tag absent
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    expect(result.ok).toBe(true);
  });

  test("adds tag → NoteFileSaved emitted via deps.publish", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const saved = deps._publishedEvents.filter(
      (e) => (e as { kind: string }).kind === "note-file-saved",
    );
    expect(saved.length).toBe(1);
  });

  test("TagInventoryUpdated emitted via deps.publishInternal on happy add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const updated = deps._publishInternalEvents.filter(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    );
    expect(updated.length).toBe(1);
  });

  test("Clock.now() called exactly once on happy add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._clockCallCount).toBe(1);
  });

  test("writeMarkdown called exactly once on happy add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._writeMarkdownCallCount).toBe(1);
  });

  test("SaveNoteRequested.source is 'curate-tag-chip'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const req = deps._savedRequests[0] as { source: string } | undefined;
    expect(req?.source).toBe("curate-tag-chip");
  });

  test("PROP-TCU-008: IndexedNote.tagInventory includes added tag with usageCount >= 1", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] }); // tag absent
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    if (!result.ok) throw new Error("expected Ok");
    const entries = result.value.tagInventory.entries;
    const found = entries.find((e) => String(e.name) === String(tag));
    expect(found).toBeDefined();
    expect(found!.usageCount).toBeGreaterThanOrEqual(1);
  });

  test("PROP-TCU-008: IndexedNote.feed is a new Feed instance from FeedOps.refreshSort", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const originalFeed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    const result = await tagChipUpdate(deps, originalFeed, inventory)(command);

    if (!result.ok) throw new Error("expected Ok");
    expect(result.value.feed).not.toBe(originalFeed); // FeedOps.refreshSort returns new instance
  });
});

// ── REQ-TCU-002: Happy path — tag remove ──────────────────────────────────

describe("REQ-TCU-002: Happy path — tag remove", () => {
  test("returns Ok(IndexedNote) on successful remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] }); // tag present
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    expect(result.ok).toBe(true);
  });

  test("NoteFileSaved emitted via deps.publish on happy remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const saved = deps._publishedEvents.filter(
      (e) => (e as { kind: string }).kind === "note-file-saved",
    );
    expect(saved.length).toBe(1);
  });

  test("Clock.now() called exactly once on happy remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._clockCallCount).toBe(1);
  });

  test("PROP-TCU-009: IndexedNote.tagInventory does not contain removed tag", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] }); // tag present
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    if (!result.ok) throw new Error("expected Ok");
    const entries = result.value.tagInventory.entries;
    const found = entries.find((e) => String(e.name) === String(tag));
    expect(found).toBeUndefined(); // removed tag should be absent (usageCount was 1, now 0 → dropped)
  });

  test("PROP-TCU-009: IndexedNote.feed is a new Feed instance from FeedOps.refreshSort on remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const originalFeed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    const result = await tagChipUpdate(deps, originalFeed, inventory)(command);

    if (!result.ok) throw new Error("expected Ok");
    expect(result.value.feed).not.toBe(originalFeed); // FeedOps.refreshSort returns new instance
  });
});

// ── REQ-TCU-003: Idempotent add (tag already present) ─────────────────────

describe("REQ-TCU-003: Idempotent add — tag already present, short-circuit before Clock", () => {
  test("returns Ok(IndexedNote) with unchanged state on idempotent add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] }); // tag already present
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "add", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    expect(result.ok).toBe(true);
  });

  test("PROP-TCU-004: Clock.now() NOT called on idempotent add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._clockCallCount).toBe(0);
  });

  test("PROP-TCU-004: writeMarkdown NOT called on idempotent add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._writeMarkdownCallCount).toBe(0);
  });

  test("PROP-TCU-004: deps.publish NOT called on idempotent add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._publishCallCount).toBe(0);
  });

  test("PROP-TCU-004: deps.publishInternal NOT called on idempotent add", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._publishInternalCallCount).toBe(0);
  });
});

// ── REQ-TCU-004: Idempotent remove (tag already absent) ───────────────────

describe("REQ-TCU-004: Idempotent remove — tag already absent, short-circuit before Clock", () => {
  test("returns Ok(IndexedNote) with unchanged state on idempotent remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    // tag is NOT in noteTags — absent
    const deps = makeHappyDeps({ noteId, noteTags: [makeTag("svelte")] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(makeTag("svelte"), 1)]);
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    expect(result.ok).toBe(true);
  });

  test("PROP-TCU-004: Clock.now() NOT called on idempotent remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] }); // tag absent
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._clockCallCount).toBe(0);
  });

  test("PROP-TCU-004: writeMarkdown NOT called on idempotent remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._writeMarkdownCallCount).toBe(0);
  });

  test("PROP-TCU-004: deps.publish NOT called on idempotent remove", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "remove", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._publishCallCount).toBe(0);
  });
});

// ── REQ-TCU-005: not-found error ──────────────────────────────────────────

describe("REQ-TCU-005: not-found error", () => {
  test("returns Err with cause 'note-not-in-feed' when note not in snapshot store", async () => {
    const noteId = makeNoteId("2026-04-30-120000-999"); // ID not in deps
    const tag = makeTag("typescript");
    // makeHappyDeps only knows about the default noteId, not 999
    const deps = makeHappyDeps({ noteId: makeNoteId("2026-04-30-120000-001") });
    const feed = makeFeed();
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as SaveErrorDelta;
    expect(error.kind).toBe("validation");
    if (error.kind !== "validation") return;
    expect(error.reason.kind).toBe("invariant-violated");
    if (error.reason.kind !== "invariant-violated") return;
    expect(error.reason.cause).toBe("note-not-in-feed");
  });

  test("PROP-TCU-015: Clock.now() NOT called on not-found path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-999");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId: makeNoteId("2026-04-30-120000-001") });
    const feed = makeFeed();
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._clockCallCount).toBe(0);
  });

  test("deps.publish NOT called on not-found path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-999");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId: makeNoteId("2026-04-30-120000-001") });
    const feed = makeFeed();
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._publishCallCount).toBe(0);
  });
});

// ── REQ-TCU-006: hydration-fail error ────────────────────────────────────

describe("REQ-TCU-006: hydration-fail error", () => {
  test("returns Err with cause 'hydration-failed' when hydrateNote fails", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const snapshot = makeSnapshot(noteId);
    let clockCallCount = 0;
    let publishCallCount = 0;
    const deps: SpyDeps = {
      clockNow: () => {
        clockCallCount++;
        return makeTimestamp(9999);
      },
      getNoteSnapshot: (id: NoteId) => (id === noteId ? snapshot : null),
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: false,
        error: { kind: "parse-error", detail: "bad frontmatter" } as unknown as HydrationFailureReason,
      }),
      publish: () => { publishCallCount++; },
      publishInternal: () => {},
      writeMarkdown: async () => ({ ok: true, value: {} as NoteFileSaved }),
      getAllSnapshots: () => [snapshot],
      get _clockCallCount() { return clockCallCount; },
      get _writeMarkdownCallCount() { return 0; },
      get _publishCallCount() { return publishCallCount; },
      get _publishInternalCallCount() { return 0; },
      get _publishedEvents() { return []; },
      get _publishInternalEvents() { return []; },
      get _savedRequests() { return []; },
    } as SpyDeps;

    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as SaveErrorDelta;
    expect(error.kind).toBe("validation");
    if (error.kind !== "validation") return;
    expect(error.reason.kind).toBe("invariant-violated");
    if (error.reason.kind !== "invariant-violated") return;
    expect(error.reason.cause).toBe("hydration-failed");
  });

  test("PROP-TCU-015: Clock.now() NOT called on hydration-fail path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const snapshot = makeSnapshot(noteId);
    let clockCallCount = 0;
    const deps = {
      clockNow: () => { clockCallCount++; return makeTimestamp(9999); },
      getNoteSnapshot: (id: NoteId) => (id === noteId ? snapshot : null),
      hydrateNote: (): Result<Note, HydrationFailureReason> => ({
        ok: false,
        error: { kind: "parse-error", detail: "bad" } as unknown as HydrationFailureReason,
      }),
      publish: () => {},
      publishInternal: () => {},
      writeMarkdown: async () => ({ ok: true, value: {} as NoteFileSaved }),
      getAllSnapshots: () => [],
    } as unknown as TagChipUpdateDeps;

    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(clockCallCount).toBe(0);
  });
});

// ── REQ-TCU-008: Save failure ─────────────────────────────────────────────

describe("REQ-TCU-008: Save failure — NoteSaveFailed emitted, projections NOT updated", () => {
  test("returns Err when writeMarkdown fails", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "disk-full" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    const result = await tagChipUpdate(deps, feed, inventory)(command);

    expect(result.ok).toBe(false);
  });

  test("NoteSaveFailed emitted on write failure", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const failed = deps._publishedEvents.filter(
      (e) => (e as { kind: string }).kind === "note-save-failed",
    );
    expect(failed.length).toBe(1);
  });

  test("NoteFileSaved NOT emitted on write failure", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "lock" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const saved = deps._publishedEvents.filter(
      (e) => (e as { kind: string }).kind === "note-file-saved",
    );
    expect(saved.length).toBe(0);
  });

  test("TagInventoryUpdated NOT emitted on write failure", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "unknown", detail: "disk error" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._publishInternalCallCount).toBe(0);
  });

  test("PROP-TCU-018: NoteSaveFailed.reason is 'disk-full' for FsError { kind: 'disk-full' }", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "disk-full" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-save-failed",
    ) as NoteSaveFailed | undefined;

    expect(failed?.reason).toBe("disk-full");
  });

  test("PROP-TCU-018: NoteSaveFailed.reason is 'permission' for FsError { kind: 'permission' }", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-save-failed",
    ) as NoteSaveFailed | undefined;

    expect(failed?.reason).toBe("permission");
  });

  test("PROP-TCU-018: NoteSaveFailed.reason is 'lock' for FsError { kind: 'lock' }", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "lock" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-save-failed",
    ) as NoteSaveFailed | undefined;

    expect(failed?.reason).toBe("lock");
  });

  test("PROP-TCU-018: NoteSaveFailed.reason is 'unknown' for FsError { kind: 'not-found' }", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "not-found" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-save-failed",
    ) as NoteSaveFailed | undefined;

    expect(failed?.reason).toBe("unknown");
  });

  test("PROP-TCU-018: NoteSaveFailed.reason is 'unknown' for FsError { kind: 'unknown' }", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const fsError: FsError = { kind: "unknown", detail: "unexpected" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-save-failed",
    ) as NoteSaveFailed | undefined;

    expect(failed?.reason).toBe("unknown");
  });
});

// ── REQ-TCU-010: TagInventoryUpdated on happy path ─────────────────────────

describe("REQ-TCU-010: TagInventoryUpdated emitted via publishInternal on happy path", () => {
  test("TagInventoryUpdated.kind is 'tag-inventory-updated'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const updated = deps._publishInternalEvents.find(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    );
    expect(updated).toBeDefined();
  });

  test("PROP-TCU-021: TagInventoryUpdated.occurredOn === SaveNoteRequested.occurredOn === now", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const now = makeTimestamp(42000);
    const deps = makeHappyDeps({ noteId, noteTags: [], now });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    const req = deps._savedRequests[0] as { occurredOn: Timestamp } | undefined;
    const tagUpdated = deps._publishInternalEvents.find(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    ) as { occurredOn: Timestamp } | undefined;

    expect(req?.occurredOn).toEqual(now);
    if (tagUpdated) {
      expect(tagUpdated.occurredOn).toEqual(now);
    }
  });
});

// ── REQ-TCU-012: Clock budget ─────────────────────────────────────────────

describe("REQ-TCU-012 / PROP-TCU-015: Clock budget", () => {
  test("Clock.now() called exactly once on save-fail path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({
      noteId,
      noteTags: [],
      writeMarkdownResult: { ok: false, error: { kind: "disk-full" } },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    await tagChipUpdate(deps, feed, inventory)(command);

    expect(deps._clockCallCount).toBe(1);
  });

  test("workflow never throws — all errors as Err(SaveError)", async () => {
    const noteId = makeNoteId("2026-04-30-120000-999");
    const tag = makeTag("typescript");
    const deps = makeHappyDeps({ noteId: makeNoteId("2026-04-30-120000-001") });
    const feed = makeFeed();
    const inventory = makeTagInventory();
    const command: TagChipCommand = { kind: "add", noteId, tag };

    let threw = false;
    let result: Result<IndexedNote, SaveErrorDelta> | undefined;
    try {
      result = await tagChipUpdate(deps, feed, inventory)(command);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result?.ok).toBe(false);
  });
});
