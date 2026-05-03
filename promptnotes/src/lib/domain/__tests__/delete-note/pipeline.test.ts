/**
 * pipeline.test.ts — Full DeleteNote pipeline integration tests
 *
 * REQ-DLN-001: Happy path — authorization succeeds, trash succeeds, projections updated
 * REQ-DLN-002: Authorization Error — editing-in-progress
 * REQ-DLN-003: Authorization Error — note not in Feed
 * REQ-DLN-004: Filesystem Error — permission, lock, disk-full, or unknown
 * REQ-DLN-005: Filesystem Error — not-found (graceful continue)
 * REQ-DLN-006: frontmatter sourcing invariant — Curate snapshot at authorization time
 * REQ-DLN-007: occurredOn threading invariant
 * REQ-DLN-008: Clock budget invariant
 * REQ-DLN-009: Event channel membership
 * REQ-DLN-010: TagInventoryUpdated emission rule
 * REQ-DLN-011: Non-coupling — DeleteNoteDeps does not include editor-buffer ports
 * REQ-DLN-012: Projection update correctness — Feed and TagInventory
 * REQ-DLN-013: disk-full normalization and FsError.unknown.detail propagation
 *
 * PROP-DLN-003: Save-failure projection isolation
 * PROP-DLN-005: occurredOn threading invariant
 * PROP-DLN-008: not-found graceful path
 * PROP-DLN-009: Happy-path full pipeline
 * PROP-DLN-010: TagInventoryUpdated emission rule and removedTags semantics
 * PROP-DLN-011: Clock budget
 * PROP-DLN-014: NoteDeletionFailed.reason mapping
 * PROP-DLN-015: Full pipeline integration
 * PROP-DLN-016: updateProjectionsAfterDelete invokes no port
 * PROP-DLN-017: disk-full → 'unknown' normalization is total
 * PROP-DLN-018: FsError.unknown.detail propagation
 *
 * RED phase: imports from non-existent implementation file.
 * Module resolution failure is valid RED evidence.
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
  NoteFileDeleted,
  NoteDeletionFailed,
} from "./_deltas";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { CurateInternalEvent } from "promptnotes-domain-types/curate/internal-events";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory, TagEntry } from "promptnotes-domain-types/curate/read-models";
import type { Result } from "promptnotes-domain-types/util/result";
import type { DeletionConfirmed, UpdatedProjection } from "promptnotes-domain-types/curate/stages";
import type {
  DeleteNoteDeps,
  DeletionErrorDelta,
} from "./_deltas";

import { deleteNote } from "../../delete-note/pipeline";

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
function makeSnapshot(noteId: NoteId, fm?: Frontmatter): NoteFileSnapshot {
  return {
    noteId,
    filePath: `/vault/${String(noteId)}.md`,
    frontmatter: fm ?? makeFrontmatter(),
    body: "body text",
    fileMtime: makeTimestamp(2000),
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
function makeDeletionConfirmed(noteId: NoteId): DeletionConfirmed {
  return { kind: "DeletionConfirmed", noteId };
}

type SpyDeps = DeleteNoteDeps & {
  _clockCallCount: number;
  _trashFileCallCount: number;
  _publishCallCount: number;
  _publishInternalCallCount: number;
  _publishedEvents: unknown[];
  _publishInternalEvents: unknown[];
};

function makeHappyDeps(opts?: {
  noteId?: NoteId;
  noteTags?: Tag[];
  trashFileResult?: Result<void, FsError>;
  now?: Timestamp;
  snapshotOverride?: NoteFileSnapshot | null;
}): SpyDeps {
  const noteId = opts?.noteId ?? makeNoteId("2026-04-30-120000-001");
  const noteTags = opts?.noteTags ?? [];
  const noteFm = makeFrontmatter({ tags: noteTags });
  const snapshot = opts?.snapshotOverride !== undefined
    ? opts.snapshotOverride
    : makeSnapshot(noteId, noteFm);
  const now = opts?.now ?? makeTimestamp(5000);

  let clockCallCount = 0;
  let trashFileCallCount = 0;
  let publishCallCount = 0;
  let publishInternalCallCount = 0;
  const publishedEvents: unknown[] = [];
  const publishInternalEvents: unknown[] = [];

  const defaultTrashResult: Result<void, FsError> = { ok: true, value: undefined };
  const trashFileResult = opts?.trashFileResult ?? defaultTrashResult;

  return {
    clockNow: () => {
      clockCallCount++;
      return now;
    },
    getNoteSnapshot: (id: NoteId) => (String(id) === String(noteId) ? snapshot : null),
    hydrateNote: (_snap: NoteFileSnapshot) => ({ ok: true, value: {} as never }),
    publish: (e: PublicDomainEvent) => {
      publishCallCount++;
      publishedEvents.push(e);
    },
    publishInternal: (e: CurateInternalEvent) => {
      publishInternalCallCount++;
      publishInternalEvents.push(e);
    },
    trashFile: async (_filePath: string): Promise<Result<void, FsError>> => {
      trashFileCallCount++;
      return trashFileResult;
    },
    getAllSnapshots: () => (snapshot ? [snapshot] : []),
    get _clockCallCount() { return clockCallCount; },
    get _trashFileCallCount() { return trashFileCallCount; },
    get _publishCallCount() { return publishCallCount; },
    get _publishInternalCallCount() { return publishInternalCallCount; },
    get _publishedEvents() { return publishedEvents; },
    get _publishInternalEvents() { return publishInternalEvents; },
  } as SpyDeps;
}

// ── REQ-DLN-001: Happy path ───────────────────────────────────────────────

describe("REQ-DLN-001: Happy path — authorization succeeds, trash succeeds, projections updated", () => {
  test("returns Ok(UpdatedProjection) on full happy path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(true);
  });

  test("PROP-DLN-009: UpdatedProjection.feed does not contain noteId", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const noteRefs = result.value.feed.noteRefs as NoteId[];
    const stillPresent = noteRefs.some((r) => String(r) === String(noteId));
    expect(stillPresent).toBe(false);
  });

  test("DeleteNoteRequested emitted via deps.publish before trashFile", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const requested = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "delete-note-requested",
    );
    expect(requested).toBeDefined();
  });

  test("NoteFileDeleted emitted via deps.publish after successful trash", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const deleted = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-file-deleted",
    );
    expect(deleted).toBeDefined();
  });

  test("REQ-DLN-006: NoteFileDeleted.frontmatter deep-equals snapshot frontmatter at authorization time", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const snapshotFrontmatter = makeFrontmatter({
      tags: [makeTag("typescript"), makeTag("svelte")],
      createdAt: makeTimestamp(1111),
      updatedAt: makeTimestamp(2222),
    });
    const deps = makeHappyDeps({
      noteId,
      noteTags: [makeTag("typescript"), makeTag("svelte")],
      snapshotOverride: makeSnapshot(noteId, snapshotFrontmatter),
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([
      makeTagEntry(makeTag("typescript"), 1),
      makeTagEntry(makeTag("svelte"), 1),
    ]);
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const event = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-file-deleted",
    ) as NoteFileDeleted | undefined;

    expect(event).toBeDefined();
    expect(event?.frontmatter).toEqual(snapshotFrontmatter);
  });

  test("trashFile called exactly once on happy path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._trashFileCallCount).toBe(1);
  });

  test("PROP-DLN-011: Clock.now() called exactly once on happy path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._clockCallCount).toBe(1);
  });

  test("REQ-DLN-001: TagInventoryUpdated NOT emitted when note has no tags", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] }); // no tags
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._publishInternalCallCount).toBe(0);
  });

  test("workflow never throws — all errors as Err(DeletionError)", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([]); // note not in feed
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    let threw = false;
    let result: Result<UpdatedProjection, DeletionErrorDelta> | undefined;
    try {
      result = await deleteNote(deps, feed, inventory, null)(confirmed);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result?.ok).toBe(false);
  });
});

// ── REQ-DLN-002: Authorization Error — editing-in-progress ───────────────

describe("REQ-DLN-002: Authorization Error — editing-in-progress", () => {
  test("returns Err with kind 'authorization' and reason 'editing-in-progress'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);
    const editingCurrentNoteId = noteId; // currently editing the note we're trying to delete

    const result = await deleteNote(deps, feed, inventory, editingCurrentNoteId)(confirmed);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    expect(error.kind).toBe("authorization");
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("editing-in-progress");
  });

  test("PROP-DLN-011: Clock.now() NOT called on editing-in-progress path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, noteId)(confirmed);

    expect(deps._clockCallCount).toBe(0);
  });

  test("trashFile NOT called on editing-in-progress path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, noteId)(confirmed);

    expect(deps._trashFileCallCount).toBe(0);
  });

  test("deps.publish NOT called on editing-in-progress path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, noteId)(confirmed);

    expect(deps._publishCallCount).toBe(0);
  });

  test("deps.publishInternal NOT called on editing-in-progress path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, noteId)(confirmed);

    expect(deps._publishInternalCallCount).toBe(0);
  });
});

// ── REQ-DLN-003: Authorization Error — note not in Feed ──────────────────

describe("REQ-DLN-003: Authorization Error — note not in Feed", () => {
  test("returns Err with kind 'authorization' and reason 'not-in-feed' when not in Feed", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([]); // note NOT in feed
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    expect(error.kind).toBe("authorization");
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("not-in-feed");
  });

  test("not-in-feed error has no cause when Feed.hasNote returns false", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    if (error.kind !== "authorization") return;
    if (error.reason.kind !== "not-in-feed") return;
    expect(error.reason.cause).toBeUndefined();
  });

  test("returns Err with cause 'snapshot-missing' when Feed has note but snapshot is null", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, snapshotOverride: null }); // snapshot missing
    const feed = makeFeed([noteId]); // but note IS in Feed
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    expect(error.kind).toBe("authorization");
    if (error.kind !== "authorization") return;
    expect(error.reason.kind).toBe("not-in-feed");
    if (error.reason.kind !== "not-in-feed") return;
    expect(error.reason.cause).toBe("snapshot-missing");
  });

  test("PROP-DLN-011: Clock.now() NOT called on not-in-feed path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._clockCallCount).toBe(0);
  });

  test("trashFile NOT called on not-in-feed path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._trashFileCallCount).toBe(0);
  });

  test("deps.publish NOT called on not-in-feed path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._publishCallCount).toBe(0);
  });
});

// ── REQ-DLN-004: Filesystem Error — permission ───────────────────────────

describe("REQ-DLN-004: Filesystem Error — permission", () => {
  test("returns Err(DeletionError { kind: 'fs' }) on trashFile permission error", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as DeletionErrorDelta;
    expect(error.kind).toBe("fs");
  });

  test("PROP-DLN-014: NoteDeletionFailed emitted with reason 'permission'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed).toBeDefined();
    expect(failed?.reason).toBe("permission");
  });

  test("PROP-DLN-003: NoteFileDeleted NOT emitted on permission error", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const deleted = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-file-deleted",
    );
    expect(deleted).toBeUndefined();
  });

  test("PROP-DLN-003: TagInventoryUpdated NOT emitted on permission error", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._publishInternalCallCount).toBe(0);
  });

  test("NoteDeletionFailed.detail is undefined on permission error", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed?.detail).toBeUndefined();
  });
});

// ── REQ-DLN-004: Filesystem Error — lock ─────────────────────────────────

describe("REQ-DLN-004: Filesystem Error — lock", () => {
  test("PROP-DLN-014: NoteDeletionFailed emitted with reason 'lock'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "lock" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed?.reason).toBe("lock");
  });

  test("NoteDeletionFailed.detail is undefined on lock error", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "lock" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed?.detail).toBeUndefined();
  });
});

// ── REQ-DLN-013 / PROP-DLN-017: disk-full normalization ──────────────────

describe("REQ-DLN-013 / PROP-DLN-017: disk-full → 'unknown' normalization", () => {
  test("PROP-DLN-017: NoteDeletionFailed.reason === 'unknown' when FsError.kind === 'disk-full'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "disk-full" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed).toBeDefined();
    expect(failed?.reason).toBe("unknown");
  });

  test("PROP-DLN-017: NoteDeletionFailed.detail === 'disk-full' when FsError.kind === 'disk-full'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "disk-full" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed?.detail).toBe("disk-full");
  });

  test("PROP-DLN-003: updateProjectionsAfterDelete NOT called on disk-full path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "disk-full" };
    const deps = makeHappyDeps({
      noteId,
      noteTags: [makeTag("draft")],
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(makeTag("draft"), 1)]);
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    // On disk-full path, projections must NOT be updated — feed still contains noteId
    expect(result.ok).toBe(false);
    // TagInventoryUpdated must not be emitted
    expect(deps._publishInternalCallCount).toBe(0);
  });
});

// ── REQ-DLN-013 / PROP-DLN-018: unknown.detail propagation ──────────────

describe("REQ-DLN-013 / PROP-DLN-018: FsError.unknown.detail propagation", () => {
  test("PROP-DLN-018: NoteDeletionFailed.detail === FsError.detail when kind === 'unknown'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "unknown", detail: "I/O timeout" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed?.detail).toBe("I/O timeout");
  });

  test("PROP-DLN-014: NoteDeletionFailed.reason === 'unknown' when FsError.kind === 'unknown'", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "unknown", detail: "unexpected failure" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as NoteDeletionFailed | undefined;

    expect(failed?.reason).toBe("unknown");
  });
});

// ── REQ-DLN-005: fs.not-found — graceful continue ────────────────────────

describe("REQ-DLN-005: fs.not-found — graceful continue (Ok path)", () => {
  test("PROP-DLN-008: returns Ok(UpdatedProjection) when trashFile returns not-found", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "not-found" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(true);
  });

  test("PROP-DLN-008: NoteFileDeleted emitted (not NoteDeletionFailed) on not-found", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "not-found" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const deleted = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-file-deleted",
    );
    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    );
    expect(deleted).toBeDefined();
    expect(failed).toBeUndefined();
  });

  test("PROP-DLN-008: UpdatedProjection.feed does not contain noteId on not-found graceful path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "not-found" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    const result = await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const noteRefs = result.value.feed.noteRefs as NoteId[];
    expect(noteRefs.some((r) => String(r) === String(noteId))).toBe(false);
  });

  test("PROP-DLN-011: Clock.now() called exactly once on not-found graceful path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const fsError: FsError = { kind: "not-found" };
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: fsError },
    });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._clockCallCount).toBe(1);
  });
});

// ── REQ-DLN-007 / PROP-DLN-005: occurredOn threading invariant ───────────

describe("REQ-DLN-007 / PROP-DLN-005: occurredOn threading invariant", () => {
  test("DeleteNoteRequested.occurredOn === NoteFileDeleted.occurredOn === now", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const now = makeTimestamp(42000);
    const deps = makeHappyDeps({ noteId, now });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const requested = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "delete-note-requested",
    ) as { occurredOn: Timestamp } | undefined;
    const deleted = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-file-deleted",
    ) as { occurredOn: Timestamp } | undefined;

    expect(requested?.occurredOn).toEqual(now);
    expect(deleted?.occurredOn).toEqual(now);
  });

  test("NoteDeletionFailed.occurredOn === now on fs-error path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const now = makeTimestamp(77000);
    const fsError: FsError = { kind: "permission" };
    const deps = makeHappyDeps({ noteId, now, trashFileResult: { ok: false, error: fsError } });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const failed = deps._publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-deletion-failed",
    ) as { occurredOn: Timestamp } | undefined;

    expect(failed?.occurredOn).toEqual(now);
  });

  test("TagInventoryUpdated.occurredOn === now when emitted", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("draft");
    const now = makeTimestamp(99000);
    const deps = makeHappyDeps({ noteId, noteTags: [tag], now });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const tagUpdated = deps._publishInternalEvents.find(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    ) as { occurredOn: Timestamp } | undefined;

    if (tagUpdated) {
      expect(tagUpdated.occurredOn).toEqual(now);
    } else {
      // If TagInventoryUpdated was not emitted, that's also a failure we capture
      expect(tagUpdated).toBeDefined();
    }
  });
});

// ── REQ-DLN-010 / PROP-DLN-010: TagInventoryUpdated emission rule ─────────

describe("REQ-DLN-010 / PROP-DLN-010: TagInventoryUpdated emission rule", () => {
  test("TagInventoryUpdated emitted exactly once when note has tags with usageCount: 1", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("draft");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const tagUpdatedList = deps._publishInternalEvents.filter(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    );
    expect(tagUpdatedList.length).toBe(1);
    const tagUpdated = tagUpdatedList[0] as { addedTags: unknown[]; removedTags: unknown[] };
    expect(tagUpdated.addedTags.length).toBe(0);
    expect(tagUpdated.removedTags.map(String)).toEqual([String(tag)]);
  });

  test("TagInventoryUpdated emitted when note has tags with usageCount: 5 (decrement without prune)", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("shared");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 5)]); // still present after decrement
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const tagUpdatedList = deps._publishInternalEvents.filter(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    );
    expect(tagUpdatedList.length).toBe(1);
    const tagUpdated = tagUpdatedList[0] as { addedTags: unknown[]; removedTags: unknown[] };
    expect(tagUpdated.addedTags.length).toBe(0);
    expect(tagUpdated.removedTags.map(String)).toEqual([String(tag)]);
  });

  test("TagInventoryUpdated NOT emitted when note has no tags", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, noteTags: [] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    expect(deps._publishInternalCallCount).toBe(0);
  });

  test("TagInventoryUpdated.addedTags is always [] in this workflow", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("draft");
    const deps = makeHappyDeps({ noteId, noteTags: [tag] });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory([makeTagEntry(tag, 1)]);
    const confirmed = makeDeletionConfirmed(noteId);

    await deleteNote(deps, feed, inventory, null)(confirmed);

    const tagUpdated = deps._publishInternalEvents.find(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    ) as { addedTags: unknown[] } | undefined;

    expect(tagUpdated?.addedTags).toEqual([]);
  });
});

// ── PROP-DLN-011: Clock budget per path ──────────────────────────────────

describe("PROP-DLN-011: Clock budget — 0 on auth-error paths, 1 on write paths", () => {
  test("Clock.now() called 0 times on editing-in-progress path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([noteId]);
    const inventory = makeTagInventory();

    await deleteNote(deps, feed, inventory, noteId)(makeDeletionConfirmed(noteId));

    expect(deps._clockCallCount).toBe(0);
  });

  test("Clock.now() called 0 times on not-in-feed path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId });
    const feed = makeFeed([]); // not in feed

    await deleteNote(deps, feed, makeTagInventory(), null)(makeDeletionConfirmed(noteId));

    expect(deps._clockCallCount).toBe(0);
  });

  test("Clock.now() called 0 times on snapshot-missing path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({ noteId, snapshotOverride: null });
    const feed = makeFeed([noteId]); // in feed but no snapshot

    await deleteNote(deps, feed, makeTagInventory(), null)(makeDeletionConfirmed(noteId));

    expect(deps._clockCallCount).toBe(0);
  });

  test("Clock.now() called exactly 1 time on permission error path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: { kind: "permission" } },
    });
    const feed = makeFeed([noteId]);

    await deleteNote(deps, feed, makeTagInventory(), null)(makeDeletionConfirmed(noteId));

    expect(deps._clockCallCount).toBe(1);
  });

  test("Clock.now() called exactly 1 time on lock error path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: { kind: "lock" } },
    });
    const feed = makeFeed([noteId]);

    await deleteNote(deps, feed, makeTagInventory(), null)(makeDeletionConfirmed(noteId));

    expect(deps._clockCallCount).toBe(1);
  });

  test("Clock.now() called exactly 1 time on disk-full error path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: { kind: "disk-full" } },
    });
    const feed = makeFeed([noteId]);

    await deleteNote(deps, feed, makeTagInventory(), null)(makeDeletionConfirmed(noteId));

    expect(deps._clockCallCount).toBe(1);
  });

  test("Clock.now() called exactly 1 time on not-found graceful path", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = makeHappyDeps({
      noteId,
      trashFileResult: { ok: false, error: { kind: "not-found" } },
    });
    const feed = makeFeed([noteId]);

    await deleteNote(deps, feed, makeTagInventory(), null)(makeDeletionConfirmed(noteId));

    expect(deps._clockCallCount).toBe(1);
  });
});
