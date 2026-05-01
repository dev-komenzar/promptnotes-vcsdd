/**
 * PROP-TCU-021: occurredOn threading invariant.
 *
 * Tier 2 — example-based test asserting all four occurredOn values equal `now`.
 * Required: false
 *
 * Invariant: now === SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn
 *            === TagInventoryUpdated.occurredOn by construction.
 *
 * The Vault write port echoes SaveNoteRequested.occurredOn back as NoteFileSaved.occurredOn.
 * updateProjectionsAfterSave sources now from event.occurredOn without a second Clock call.
 *
 * Covers: REQ-TCU-010, REQ-TCU-012
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
import type { NoteFileSaved, SaveNoteRequested } from "promptnotes-domain-types/shared/events";
import type { CurateInternalEvent, TagInventoryUpdated } from "promptnotes-domain-types/curate/internal-events";
import type { TagChipCommand } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { NoteFileSnapshot, HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
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
    createdAt: makeTimestamp(1000),
    updatedAt: makeTimestamp(2000),
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

// ── PROP-TCU-021 ─────────────────────────────────────────────────────────

describe("PROP-TCU-021: occurredOn threading invariant", () => {
  test("SaveNoteRequested.occurredOn === now (fixed clock)", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("svelte");
    const fixedNow = makeTimestamp(42000);

    const savedRequests: unknown[] = [];
    const snapshot = makeSnapshot(noteId);
    const note = makeNote(noteId, []);

    const deps: TagChipUpdateDeps = {
      clockNow: () => fixedNow,
      getNoteSnapshot: (id: NoteId) => (id === noteId ? snapshot : null),
      hydrateNote: (): Result<Note, HydrationFailureReason> => ({ ok: true, value: note }),
      publish: () => {},
      publishInternal: () => {},
      writeMarkdown: async (req: unknown): Promise<Result<NoteFileSaved, any>> => {
        savedRequests.push(req);
        const r = req as SaveNoteRequested;
        return {
          ok: true,
          value: {
            kind: "note-file-saved",
            noteId: r.noteId,
            body: r.body,
            frontmatter: r.frontmatter,
            previousFrontmatter: r.previousFrontmatter,
            occurredOn: r.occurredOn, // echo the request's occurredOn
          } as NoteFileSaved,
        };
      },
      getAllSnapshots: () => [snapshot],
    };

    const command: TagChipCommand = { kind: "add", noteId, tag };
    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    const req = savedRequests[0] as SaveNoteRequested | undefined;
    expect(req).toBeDefined();
    if (req) {
      expect(req.occurredOn).toEqual(fixedNow);
    }
  });

  test("NoteFileSaved.occurredOn echoes SaveNoteRequested.occurredOn === now", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("svelte");
    const fixedNow = makeTimestamp(55555);

    const publishedEvents: unknown[] = [];
    const snapshot = makeSnapshot(noteId);
    const note = makeNote(noteId, []);

    const deps: TagChipUpdateDeps = {
      clockNow: () => fixedNow,
      getNoteSnapshot: (id: NoteId) => (id === noteId ? snapshot : null),
      hydrateNote: (): Result<Note, HydrationFailureReason> => ({ ok: true, value: note }),
      publish: (e: unknown) => publishedEvents.push(e),
      publishInternal: () => {},
      writeMarkdown: async (req: unknown): Promise<Result<NoteFileSaved, any>> => {
        const r = req as SaveNoteRequested;
        return {
          ok: true,
          value: {
            kind: "note-file-saved",
            noteId: r.noteId,
            body: r.body,
            frontmatter: r.frontmatter,
            previousFrontmatter: r.previousFrontmatter,
            occurredOn: r.occurredOn, // echo
          } as NoteFileSaved,
        };
      },
      getAllSnapshots: () => [snapshot],
    };

    const command: TagChipCommand = { kind: "add", noteId, tag };
    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    const saved = publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-file-saved",
    ) as NoteFileSaved | undefined;

    expect(saved).toBeDefined();
    if (saved) {
      expect(saved.occurredOn).toEqual(fixedNow);
    }
  });

  test("TagInventoryUpdated.occurredOn === NoteFileSaved.occurredOn === now", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("svelte");
    const fixedNow = makeTimestamp(77777);

    const publishInternalEvents: unknown[] = [];
    const snapshot = makeSnapshot(noteId);
    const note = makeNote(noteId, []);

    const deps: TagChipUpdateDeps = {
      clockNow: () => fixedNow,
      getNoteSnapshot: (id: NoteId) => (id === noteId ? snapshot : null),
      hydrateNote: (): Result<Note, HydrationFailureReason> => ({ ok: true, value: note }),
      publish: () => {},
      publishInternal: (e: unknown) => publishInternalEvents.push(e),
      writeMarkdown: async (req: unknown): Promise<Result<NoteFileSaved, any>> => {
        const r = req as SaveNoteRequested;
        return {
          ok: true,
          value: {
            kind: "note-file-saved",
            noteId: r.noteId,
            body: r.body,
            frontmatter: r.frontmatter,
            previousFrontmatter: r.previousFrontmatter,
            occurredOn: r.occurredOn, // echo
          } as NoteFileSaved,
        };
      },
      getAllSnapshots: () => [snapshot],
    };

    const command: TagChipCommand = { kind: "add", noteId, tag };
    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    const tagUpdated = publishInternalEvents.find(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    ) as { occurredOn: Timestamp } | undefined;

    expect(tagUpdated).toBeDefined();
    if (tagUpdated) {
      expect(tagUpdated.occurredOn).toEqual(fixedNow);
    }
  });

  test("all three occurredOn values equal the same fixed now", async () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const tag = makeTag("svelte");
    const fixedNow = makeTimestamp(99999);

    const savedRequests: unknown[] = [];
    const publishedEvents: unknown[] = [];
    const publishInternalEvents: unknown[] = [];
    const snapshot = makeSnapshot(noteId);
    const note = makeNote(noteId, []);

    const deps: TagChipUpdateDeps = {
      clockNow: () => fixedNow,
      getNoteSnapshot: (id: NoteId) => (id === noteId ? snapshot : null),
      hydrateNote: (): Result<Note, HydrationFailureReason> => ({ ok: true, value: note }),
      publish: (e: unknown) => publishedEvents.push(e),
      publishInternal: (e: unknown) => publishInternalEvents.push(e),
      writeMarkdown: async (req: unknown): Promise<Result<NoteFileSaved, any>> => {
        savedRequests.push(req);
        const r = req as SaveNoteRequested;
        return {
          ok: true,
          value: {
            kind: "note-file-saved",
            noteId: r.noteId,
            body: r.body,
            frontmatter: r.frontmatter,
            previousFrontmatter: r.previousFrontmatter,
            occurredOn: r.occurredOn, // echo
          } as NoteFileSaved,
        };
      },
      getAllSnapshots: () => [snapshot],
    };

    const command: TagChipCommand = { kind: "add", noteId, tag };
    await tagChipUpdate(deps, makeFeed([noteId]), makeInventory())(command);

    const req = savedRequests[0] as SaveNoteRequested | undefined;
    const saved = publishedEvents.find(
      (e) => (e as { kind: string }).kind === "note-file-saved",
    ) as NoteFileSaved | undefined;
    const tagUpdated = publishInternalEvents.find(
      (e) => (e as { kind: string }).kind === "tag-inventory-updated",
    ) as { occurredOn: Timestamp } | undefined;

    // All four should equal fixedNow
    if (req) expect(req.occurredOn).toEqual(fixedNow);
    if (saved) expect(saved.occurredOn).toEqual(fixedNow);
    if (tagUpdated) expect(tagUpdated.occurredOn).toEqual(fixedNow);
  });
});
