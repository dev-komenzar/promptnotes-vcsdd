/**
 * step2-hydration-unknown-fallback.test.ts — Step 2: 'unknown' defensive fallback
 *
 * REQ-018: HydrationFailureReason 'unknown' is a defensive fallback for non-categorisable
 *          hydration failures (parser exceptions, unrecognised Result.Err variants).
 *
 * PROP-028: 'unknown' is produced ONLY by the defensive fallback path;
 *           no static REQ-002/REQ-017 producer ever yields 'unknown'.
 *           Reachable via uncategorisable parser/VO errors and exceptions;
 *           remaining files still process; workflow continues to Step 3.
 *
 * Red phase: The current scanVault implementation has no try-catch defensive fallback
 * for parser exceptions, and no handling of unrecognised Result.Err variants.
 * These tests will FAIL because the defensive 'unknown' path doesn't exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { CorruptedFile } from "promptnotes-domain-types/shared/snapshots";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { VaultPath, Tag, Body, Frontmatter, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";

import {
  scanVault,
  type ScanVaultPorts,
} from "$lib/domain/app-startup/scan-vault";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeVaultPath(raw: string): VaultPath {
  return raw as unknown as VaultPath;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeFrontmatter(): Frontmatter {
  return {
    tags: [] as readonly Tag[],
    createdAt: { epochMillis: 1714298400000 } as unknown as Timestamp,
    updatedAt: { epochMillis: 1714298400000 } as unknown as Timestamp,
  } as unknown as Frontmatter;
}

function makeValidMarkdownContent(id: string): string {
  return `---
tags: []
createdAt: "2026-04-28T12:00:00.000Z"
updatedAt: "2026-04-28T12:00:00.000Z"
---
Body text for note ${id}
`;
}

function makeListMarkdown(files: string[]) {
  return (_path: VaultPath) => ({ ok: true as const, value: files });
}

function makeReadFile(responses: Record<string, { ok: boolean; value?: string; error?: FsError }>) {
  return (filePath: string) => {
    const r = responses[filePath];
    if (!r) return { ok: true as const, value: "" };
    if (r.ok) return { ok: true as const, value: r.value ?? "" };
    return { ok: false as const, error: r.error! };
  };
}

// ── REQ-018 / PROP-028: 'unknown' defensive fallback ─────────────────────────

describe("REQ-018 / PROP-028 — 'unknown' HydrationFailureReason as defensive fallback", () => {
  // These tests verify that scanVault wraps parser exceptions in a try-catch
  // and routes them to failure:{kind:'hydrate',reason:'unknown',detail:<message>}.
  // The current implementation has no try-catch in the per-file loop.
  // These tests WILL FAIL in Red phase.

  test("PROP-028 — FrontmatterParser.parse throwing synchronously → failure:{kind:'hydrate',reason:'unknown'}", async () => {
    // REQ-018 AC: 'FrontmatterParser.parse throws synchronously (library bug):
    // the exception is caught, the file accumulates failure:{kind:'hydrate',reason:'unknown',detail:<error.message>}
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
      }),
      // Parser throws synchronously — this simulates a library bug
      parseNote: (_raw: string) => {
        throw new Error("Unexpected parser crash: internal YAML AST error");
      },
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // PROP-028: exception must be caught and classified as 'unknown' (not propagated)
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.filePath).toBe("/vault/2026-04-28-120000-001.md");
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        // Must be 'unknown' — not 'yaml-parse', not 'block-parse', etc.
        expect(corrupted.failure.reason).toBe("unknown");
      }
      // REQ-018 AC: detail carries human-readable error summary
      expect(corrupted.detail).toBeDefined();
      expect(typeof corrupted.detail).toBe("string");
      expect((corrupted.detail as string).length).toBeGreaterThan(0);
    }
  });

  test("PROP-028 — parseNote returns Err with unrecognised future variant → failure:{kind:'hydrate',reason:'unknown'}", async () => {
    // REQ-018 AC: A future HydrationFailureReason variant added to shared/snapshots.ts
    // without spec update falls into the 'unknown' path until the spec catches up.
    // We simulate this by having the parser return a Result.Err with an unrecognised kind.
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-002.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-002.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-002"),
        },
      }),
      // Returns a future/unrecognised error variant — not statically reachable
      parseNote: (_raw: string) => ({
        ok: false as const,
        error: "unrecognized-future-variant" as unknown as HydrationFailureReason,
      }),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        // PROP-028: unrecognised error variant must fold to 'unknown'
        expect(corrupted.failure.reason).toBe("unknown");
      }
    }
  });

  test("PROP-028 — remaining files process normally after 'unknown' exception on one file", async () => {
    // REQ-018 AC: 'remaining files in the vault still process and the workflow continues to Step 3'
    const vaultPath = makeVaultPath("/vault");

    let parseCallCount = 0;
    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown([
        "/vault/2026-04-28-120000-001.md",
        "/vault/2026-04-28-120000-002.md",
        "/vault/2026-04-28-120000-003.md",
      ]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
        "/vault/2026-04-28-120000-002.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-002"),
        },
        "/vault/2026-04-28-120000-003.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-003"),
        },
      }),
      // First call throws; subsequent calls succeed
      parseNote: (_raw: string) => {
        parseCallCount++;
        if (parseCallCount === 1) {
          throw new Error("First file parser crash");
        }
        return {
          ok: true as const,
          value: {
            body: makeBody("Normal body"),
            fm: makeFrontmatter(),
          },
        };
      },
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 2 files succeed, 1 corrupted with 'unknown'
      expect(result.value.snapshots).toHaveLength(2);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        expect(corrupted.failure.reason).toBe("unknown");
      }
      // Total invariant preserved
      const total = result.value.snapshots.length + result.value.corruptedFiles.length;
      expect(total).toBe(3);
    }
  });

  test("PROP-028 — 'unknown' is NEVER produced by FileSystem.readFile failure (must be 'read' kind)", async () => {
    // REQ-018 AC: 'unknown' is NEVER produced by a FileSystem.readFile failure.
    // Read failures use failure:{kind:'read', fsError:{...}} instead.
    // This test verifies the negative: that 'unknown' HydrationFailureReason
    // is not confused with read-level unknown errors.
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        // OS-level 'unknown' error — this is a READ failure, NOT a hydration failure
        "/vault/2026-04-28-120000-001.md": {
          ok: false,
          error: { kind: "unknown", detail: "Unknown OS error" },
        },
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("body"),
          fm: makeFrontmatter(),
        },
      }),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.corruptedFiles).toHaveLength(1);
      const corrupted = result.value.corruptedFiles[0];

      // Must be 'read' kind — NOT 'hydrate' with reason:'unknown'
      expect(corrupted.failure.kind).toBe("read");
      if (corrupted.failure.kind === "read") {
        // The fsError.kind is 'unknown', but the ScanFileFailure.kind is 'read'
        expect(corrupted.failure.fsError.kind).toBe("unknown");
      }
      // Must NOT be 'hydrate' kind — even though the fsError variant is 'unknown'
      expect(corrupted.failure.kind).not.toBe("hydrate");
    }
  });

  test("PROP-028 — 'unknown' reason has detail field with human-readable error message", async () => {
    // REQ-018 AC: CorruptedFile.detail is set to a human-readable summary of the unexpected error.
    const vaultPath = makeVaultPath("/vault");
    const errorMessage = "Fatal parser error: AST traversal stack overflow";

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
      }),
      parseNote: (_raw: string) => {
        throw new Error(errorMessage);
      },
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const corrupted = result.value.corruptedFiles[0];
      // detail must contain the error message (or a superset)
      expect(corrupted.detail).toBeDefined();
      // The detail should mention the error in some form
      expect(corrupted.detail).toContain(errorMessage);
    }
  });
});
