/**
 * body-for-clipboard.test.ts — unit tests for the pure bodyForClipboard helper.
 *
 * REQ-002: Returns body only — frontmatter excluded.
 * Covers PROP-001 (purity), PROP-002 (body identity), PROP-003 (frontmatter exclusion)
 * at unit-test granularity (the property-based versions live in __verify__/).
 */

import { describe, test, expect } from "bun:test";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
import type { Body, Frontmatter, NoteId, Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const body = (s: string): Body => s as unknown as Body;
const tag = (s: string): Tag => s as unknown as Tag;

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? id("2026-04-30-120000-000"),
    body: overrides.body ?? body("hello world"),
    frontmatter:
      overrides.frontmatter ??
      ({
        tags: [],
        createdAt: ts(1000),
        updatedAt: ts(2000),
      } as unknown as Frontmatter),
  };
}

describe("bodyForClipboard (REQ-002)", () => {
  test("returns the raw body string verbatim", () => {
    const note = makeNote({ body: body("Some content here.") });
    expect(bodyForClipboard(note)).toBe("Some content here.");
  });

  test("does not include frontmatter delimiters", () => {
    const note = makeNote({ body: body("plain") });
    const result = bodyForClipboard(note);
    expect(result).not.toContain("---");
  });

  test("does not include frontmatter keys (tags / createdAt / updatedAt)", () => {
    const note = makeNote({
      body: body("hello"),
      frontmatter: {
        tags: [tag("x"), tag("y")],
        createdAt: ts(1),
        updatedAt: ts(2),
      } as unknown as Frontmatter,
    });
    const result = bodyForClipboard(note);
    expect(result).not.toContain("tags:");
    expect(result).not.toContain("createdAt:");
    expect(result).not.toContain("updatedAt:");
  });

  test("empty body produces empty string (REQ-007)", () => {
    expect(bodyForClipboard(makeNote({ body: body("") }))).toBe("");
  });

  test("whitespace-only body is preserved exactly (REQ-007)", () => {
    expect(bodyForClipboard(makeNote({ body: body("   \n\t") }))).toBe("   \n\t");
  });

  test("multi-line body is preserved including newlines", () => {
    expect(bodyForClipboard(makeNote({ body: body("line1\nline2\nline3") }))).toBe(
      "line1\nline2\nline3",
    );
  });

  test("unicode body is preserved", () => {
    expect(bodyForClipboard(makeNote({ body: body("こんにちは🌸") }))).toBe("こんにちは🌸");
  });

  test("is referentially transparent (same input → same output)", () => {
    const note = makeNote({ body: body("stable") });
    expect(bodyForClipboard(note)).toBe(bodyForClipboard(note));
  });
});
