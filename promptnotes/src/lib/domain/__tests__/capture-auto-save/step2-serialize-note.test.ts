/**
 * step2-serialize-note.test.ts — Step 2: serializeNote tests
 *
 * REQ-006: serializeNote produces Obsidian-compatible markdown
 *
 * PROP-001: serializeNote is pure (referential transparency)
 * PROP-002: Output matches Obsidian format
 * PROP-016: serializeNote has no deps parameter
 */

import { describe, test, expect } from "bun:test";
import { fc } from "@fast-check/vitest";
import type { Body, Frontmatter, NoteId, Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

// Red phase: this import will fail
import { serializeNote } from "$lib/domain/capture-auto-save/serialize-note";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
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
    updatedAt: overrides.updatedAt ?? makeTimestamp(1000),
  } as unknown as Frontmatter;
}

function makeValidatedSaveRequest(overrides: Partial<{
  body: Body;
  frontmatter: Frontmatter;
}> = {}): ValidatedSaveRequest {
  return {
    kind: "ValidatedSaveRequest",
    noteId: makeNoteId("2026-04-30-120000-000"),
    body: overrides.body ?? makeBody("Hello world"),
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
    previousFrontmatter: null,
    trigger: "idle" as const,
    requestedAt: makeTimestamp(2000),
  } as ValidatedSaveRequest;
}

// ── REQ-006: serializeNote produces Obsidian-compatible markdown ─────────

describe("REQ-006: serializeNote produces Obsidian-compatible markdown", () => {
  // PROP-002: output matches Obsidian format
  test("PROP-002: output starts with --- and contains body after second ---", () => {
    const request = makeValidatedSaveRequest({ body: makeBody("My note body") });

    const result = serializeNote(request);

    // Must start with "---\n"
    expect(result.startsWith("---\n")).toBe(true);
    // Must contain a second "---\n" separator
    const secondSeparator = result.indexOf("---\n", 4);
    expect(secondSeparator).toBeGreaterThan(3);
    // Body must appear after the second separator
    const bodyStart = secondSeparator + 4;
    expect(result.slice(bodyStart)).toContain("My note body");
  });

  test("YAML section contains tags, createdAt, updatedAt", () => {
    const fm = makeFrontmatter({
      tags: [makeTag("test"), makeTag("note")],
      createdAt: makeTimestamp(1000),
      updatedAt: makeTimestamp(2000),
    });
    const request = makeValidatedSaveRequest({ frontmatter: fm });

    const result = serializeNote(request);

    // Extract YAML section between the two --- delimiters
    const parts = result.split("---\n");
    const yamlSection = parts[1]; // index 0 is empty (before first ---), index 1 is YAML
    expect(yamlSection).toBeDefined();
    expect(yamlSection).toContain("tags");
    expect(yamlSection).toContain("createdAt");
    expect(yamlSection).toContain("updatedAt");
  });

  test("body is raw (no transformation)", () => {
    const rawBody = "# Heading\n\n- list item\n- **bold**";
    const request = makeValidatedSaveRequest({ body: makeBody(rawBody) });

    const result = serializeNote(request);

    // Body appears after second --- separator, unchanged
    const parts = result.split("---\n");
    const bodySection = parts.slice(2).join("---\n"); // rejoin in case body contains ---
    expect(bodySection).toBe(rawBody);
  });

  test("empty body produces valid markdown (--- yaml --- with empty body)", () => {
    const request = makeValidatedSaveRequest({ body: makeBody("") });

    const result = serializeNote(request);

    expect(result.startsWith("---\n")).toBe(true);
    const parts = result.split("---\n");
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  // PROP-001: serializeNote is pure (referential transparency)
  test("PROP-001: same input always produces identical output", () => {
    const request = makeValidatedSaveRequest();

    const result1 = serializeNote(request);
    const result2 = serializeNote(request);

    expect(result1).toBe(result2);
  });

  test("step never fails (no error return)", () => {
    // serializeNote returns a string, not a Result — it cannot fail
    const request = makeValidatedSaveRequest();
    const result = serializeNote(request);
    expect(typeof result).toBe("string");
  });
});

// ── PROP-016: serializeNote has no deps parameter ───────────────────────

describe("PROP-016: serializeNote has zero CaptureDeps port calls", () => {
  test("serializeNote accepts only ValidatedSaveRequest (no deps)", () => {
    // Type-level assertion: serializeNote has exactly 1 parameter
    expect(serializeNote.length).toBeLessThanOrEqual(1);
  });
});
