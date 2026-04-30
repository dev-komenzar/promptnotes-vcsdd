/**
 * step4-update-projections.test.ts — Step 4: updateProjections tests
 *
 * REQ-011: updateProjections refreshes Feed and TagInventory
 * REQ-012: TagInventoryUpdated emitted on tag delta
 *
 * PROP-012: TagInventoryUpdated iff tag delta exists
 * PROP-013: TagInventoryUpdated NOT emitted when null previousFrontmatter + no tags
 */

import { describe, test, expect } from "bun:test";
import type { Frontmatter, Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";

// Red phase: this import will fail
import {
  updateProjections,
  type UpdateProjectionsDeps,
} from "$lib/domain/capture-auto-save/update-projections";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeFrontmatter(overrides: Partial<{
  tags: Tag[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}> = {}): Frontmatter {
  return {
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? makeTimestamp(1000),
    updatedAt: overrides.updatedAt ?? makeTimestamp(2000),
  } as unknown as Frontmatter;
}

function makeNoteFileSaved(overrides: Partial<{
  frontmatter: Frontmatter;
  previousFrontmatter: Frontmatter | null;
}> = {}): NoteFileSaved {
  return {
    kind: "note-file-saved",
    noteId: "2026-04-30-120000-000" as any,
    body: "body" as any,
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
    previousFrontmatter: overrides.previousFrontmatter ?? null,
    occurredOn: makeTimestamp(3000),
  } as NoteFileSaved;
}

type EmittedEvent = { kind: string; [key: string]: unknown };

function makeDeps(emitted: EmittedEvent[] = []): UpdateProjectionsDeps {
  return {
    refreshSort: () => {},
    applyTagDelta: (_prev: Frontmatter | null, _next: Frontmatter) => {
      // Return whether tags changed (simplified for test setup)
      const prevTags = _prev?.tags ?? [];
      const nextTags = _next.tags ?? [];
      return JSON.stringify(prevTags) !== JSON.stringify(nextTags);
    },
    publish: (e: any) => emitted.push(e),
  };
}

// ── REQ-011: updateProjections refreshes Feed and TagInventory ──────────

describe("REQ-011: updateProjections refreshes Feed and TagInventory", () => {
  test("produces IndexedNote on success", () => {
    const saved = makeNoteFileSaved();
    const result = updateProjections(makeDeps())(saved);
    expect(result).toBeDefined();
  });

  test("no file I/O occurs (in-memory only)", () => {
    // This is a structural test: updateProjections should not call any fs ports
    const saved = makeNoteFileSaved();
    const deps = makeDeps();
    // If updateProjections tries to do file I/O, it would need an fs port
    // which is not in UpdateProjectionsDeps
    const result = updateProjections(deps)(saved);
    expect(result).toBeDefined();
  });
});

// ── REQ-012: TagInventoryUpdated emitted on tag delta ───────────────────

describe("REQ-012: TagInventoryUpdated emitted on tag delta", () => {
  // PROP-012: emitted iff tag delta exists
  test("PROP-012: tags changed → TagInventoryUpdated emitted", () => {
    const emitted: EmittedEvent[] = [];
    const prevFm = makeFrontmatter({ tags: [makeTag("old")] });
    const nextFm = makeFrontmatter({ tags: [makeTag("new")] });
    const saved = makeNoteFileSaved({
      frontmatter: nextFm,
      previousFrontmatter: prevFm,
    });

    updateProjections(makeDeps(emitted))(saved);

    const tagUpdated = emitted.filter((e) => e.kind === "tag-inventory-updated");
    expect(tagUpdated.length).toBe(1);
  });

  test("no tag change → TagInventoryUpdated NOT emitted", () => {
    const emitted: EmittedEvent[] = [];
    const fm = makeFrontmatter({ tags: [makeTag("same")] });
    const saved = makeNoteFileSaved({
      frontmatter: fm,
      previousFrontmatter: fm,
    });

    updateProjections(makeDeps(emitted))(saved);

    const tagUpdated = emitted.filter((e) => e.kind === "tag-inventory-updated");
    expect(tagUpdated.length).toBe(0);
  });

  test("previousFrontmatter null + new note with tags → TagInventoryUpdated emitted", () => {
    const emitted: EmittedEvent[] = [];
    const nextFm = makeFrontmatter({ tags: [makeTag("new-tag")] });
    const saved = makeNoteFileSaved({
      frontmatter: nextFm,
      previousFrontmatter: null,
    });

    updateProjections(makeDeps(emitted))(saved);

    const tagUpdated = emitted.filter((e) => e.kind === "tag-inventory-updated");
    expect(tagUpdated.length).toBe(1);
  });

  // PROP-013: null previousFrontmatter + no tags → NOT emitted
  test("PROP-013: previousFrontmatter null + no tags → TagInventoryUpdated NOT emitted", () => {
    const emitted: EmittedEvent[] = [];
    const nextFm = makeFrontmatter({ tags: [] });
    const saved = makeNoteFileSaved({
      frontmatter: nextFm,
      previousFrontmatter: null,
    });

    updateProjections(makeDeps(emitted))(saved);

    const tagUpdated = emitted.filter((e) => e.kind === "tag-inventory-updated");
    expect(tagUpdated.length).toBe(0);
  });
});
