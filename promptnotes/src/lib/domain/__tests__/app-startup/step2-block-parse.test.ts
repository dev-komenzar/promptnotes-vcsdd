/**
 * step2-block-parse.test.ts — Step 2: parseMarkdownToBlocks failure routing tests
 *
 * REQ-017: parseMarkdownToBlocks failure → hydrate-kind ScanFileFailure reason='block-parse'
 * REQ-002 (rev7): Step 2 per-file loop calls parseMarkdownToBlocks directly (NOT via HydrateNote)
 *
 * PROP-026: Per-file parseMarkdownToBlocks failure → failure:{kind:'hydrate',reason:'block-parse'}
 *           NOT 'unknown', NOT 'invalid-value', NOT 'yaml-parse'; workflow continues.
 * PROP-029: parseMarkdownToBlocks Ok([]) → failure:{kind:'hydrate',reason:'block-parse'}
 *           (NOT 'invalid-value', NOT auto-padded, NOT silently dropped).
 *
 * Red phase: these tests exercise scanVault's (non-existent) parseMarkdownToBlocks
 * integration. Current scanVault has no parseMarkdownToBlocks port and no block-parse
 * failure routing — all assertions involving the new port or block-parse reason will FAIL.
 */

import { describe, test, expect } from "bun:test";
import type { CorruptedFile, NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { VaultPath, Tag, Body, Frontmatter, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { Block } from "promptnotes-domain-types/shared/note";

import {
  scanVault,
  type ScanVaultPorts,
} from "$lib/domain/app-startup/scan-vault";
import type { BlockParseError } from "$lib/domain/capture-auto-save/parse-markdown-to-blocks";
import type { Result } from "promptnotes-domain-types/util/result";

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

function makeValidMarkdownContent(id: string = "2026-04-28-120000-000"): string {
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

function makeParserAlwaysSucceed() {
  return (_raw: string) => ({
    ok: true as const,
    value: {
      body: makeBody("Body text for note"),
      fm: makeFrontmatter(),
    },
  });
}

/** A parseMarkdownToBlocks stub that always returns Err(unterminated-code-fence). */
function makeBlockParserAlwaysFail(
  kind: "unterminated-code-fence" | "malformed-structure" = "unterminated-code-fence"
): (markdown: string) => Result<ReadonlyArray<Block>, BlockParseError> {
  return (_markdown: string) => ({
    ok: false as const,
    error:
      kind === "unterminated-code-fence"
        ? { kind: "unterminated-code-fence" as const, line: 3 }
        : { kind: "malformed-structure" as const, line: 5, detail: "unexpected token" },
  });
}

/** A parseMarkdownToBlocks stub that succeeds for most files but fails for one. */
function makeBlockParserFailsFor(
  failPath: string,
  error: BlockParseError
): (markdown: string) => Result<ReadonlyArray<Block>, BlockParseError> {
  // We need to track which file is being processed; but parseMarkdownToBlocks only receives markdown.
  // In the test, we encode the failure via the body content: bodies containing "FAIL_BLOCK_PARSE"
  // trigger the error.
  return (markdown: string) => {
    if (markdown.includes("FAIL_BLOCK_PARSE")) {
      return { ok: false as const, error };
    }
    return {
      ok: true as const,
      value: [
        {
          id: "block-0" as unknown as import("promptnotes-domain-types/shared/value-objects").BlockId,
          type: "paragraph" as import("promptnotes-domain-types/shared/value-objects").BlockType,
          content: markdown as unknown as import("promptnotes-domain-types/shared/value-objects").BlockContent,
        } as unknown as Block,
      ] as ReadonlyArray<Block>,
    };
  };
}

/** A parseMarkdownToBlocks stub that returns Ok([]) for bodies containing "EMPTY_BLOCKS". */
function makeBlockParserReturnsEmptyFor(): (
  markdown: string
) => Result<ReadonlyArray<Block>, BlockParseError> {
  return (markdown: string) => {
    if (markdown.includes("EMPTY_BLOCKS")) {
      return { ok: true as const, value: [] as ReadonlyArray<Block> };
    }
    return {
      ok: true as const,
      value: [
        {
          id: "block-0" as unknown as import("promptnotes-domain-types/shared/value-objects").BlockId,
          type: "paragraph" as import("promptnotes-domain-types/shared/value-objects").BlockType,
          content: markdown as unknown as import("promptnotes-domain-types/shared/value-objects").BlockContent,
        } as unknown as Block,
      ] as ReadonlyArray<Block>,
    };
  };
}

// ── REQ-017 / PROP-026: BlockParseError variants → CorruptedFile reason='block-parse' ──

describe("REQ-017 / PROP-026 — parseMarkdownToBlocks failure → CorruptedFile reason='block-parse'", () => {
  // NOTE: These tests require ScanVaultPorts to accept a `parseMarkdownToBlocks` field AND
  // for scanVault to call it during its per-file loop. The current implementation has neither.
  // These tests will FAIL in the Red phase.

  test("PROP-026 — unterminated-code-fence error → failure:{kind:'hydrate',reason:'block-parse'}", async () => {
    // REQ-017 AC: CorruptedFile.failure.kind === 'hydrate' and .reason === 'block-parse'
    // for all parseMarkdownToBlocks failures.
    const vaultPath = makeVaultPath("/vault");
    const bodyWithFail = makeBody("FAIL_BLOCK_PARSE unterminated fence");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          // Body contains the marker so the block-parser stub triggers failure
          body: bodyWithFail,
          fm: makeFrontmatter(),
        },
      }),
      // REQ-002 (rev7): scanVault MUST accept parseMarkdownToBlocks in its ports.
      // This field does NOT exist on ScanVaultPorts in the current impl — type error expected.
      parseMarkdownToBlocks: makeBlockParserFailsFor("/vault/2026-04-28-120000-001.md", {
        kind: "unterminated-code-fence",
        line: 3,
      }),
    } as unknown as ScanVaultPorts; // cast because field doesn't exist yet

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // PROP-026: the file must be a CorruptedFile with reason='block-parse', not in snapshots.
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.filePath).toBe("/vault/2026-04-28-120000-001.md");
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        // Must be 'block-parse', NOT 'unknown', NOT 'invalid-value', NOT 'yaml-parse'
        expect(corrupted.failure.reason).toBe("block-parse");
      }
    }
  });

  test("PROP-026 — malformed-structure error → failure:{kind:'hydrate',reason:'block-parse'}", async () => {
    // REQ-017 AC: Both BlockParseError variants fold to reason='block-parse'.
    // The app-startup layer does NOT distinguish unterminated-code-fence from malformed-structure.
    const vaultPath = makeVaultPath("/vault");
    const bodyWithFail = makeBody("FAIL_BLOCK_PARSE malformed structure");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-002.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-002.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-002"),
        },
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: bodyWithFail,
          fm: makeFrontmatter(),
        },
      }),
      parseMarkdownToBlocks: makeBlockParserFailsFor("/vault/2026-04-28-120000-002.md", {
        kind: "malformed-structure",
        line: 5,
        detail: "unexpected token at line 5",
      }),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        // PROP-026: both BlockParseError variants → 'block-parse' (not variant-specific)
        expect(corrupted.failure.reason).toBe("block-parse");
      }
    }
  });

  test("PROP-026 — frontmatter-ok but block-parse-fail → reason='block-parse' (not 'yaml-parse')", async () => {
    // REQ-017 AC: A file whose frontmatter parses fine but whose body is structurally broken
    // yields 'block-parse', not 'yaml-parse'. The failure path is distinct.
    const vaultPath = makeVaultPath("/vault");
    const bodyWithFail = makeBody("FAIL_BLOCK_PARSE");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-003.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-003.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-003"),
        },
      }),
      // Parser succeeds (frontmatter is fine)
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: bodyWithFail,
          fm: makeFrontmatter(),
        },
      }),
      // Block parser fails — this is a block-level, NOT frontmatter-level failure
      parseMarkdownToBlocks: makeBlockParserAlwaysFail("unterminated-code-fence"),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        // MUST be 'block-parse', not 'yaml-parse' — the frontmatter succeeded
        expect(corrupted.failure.reason).toBe("block-parse");
        expect(corrupted.failure.reason).not.toBe("yaml-parse");
        expect(corrupted.failure.reason).not.toBe("unknown");
        expect(corrupted.failure.reason).not.toBe("invalid-value");
      }
    }
  });

  test("PROP-026 — block-parse failure on one file; remaining files still processed", async () => {
    // REQ-017 AC: The surrounding scanVault workflow continues processing remaining files.
    const vaultPath = makeVaultPath("/vault");

    const bodyWithFail = makeBody("FAIL_BLOCK_PARSE");
    const bodyOk = makeBody("Normal body text");

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
      // Parser returns: file 002 has body that triggers block-parse failure; others are fine
      parseNote: (raw: string) => {
        const isFail = raw.includes("2026-04-28-120000-002");
        if (isFail) {
          return {
            ok: true as const,
            value: {
              body: bodyWithFail,
              fm: makeFrontmatter(),
            },
          };
        }
        return {
          ok: true as const,
          value: {
            body: bodyOk,
            fm: makeFrontmatter(),
          },
        };
      },
      parseMarkdownToBlocks: makeBlockParserFailsFor("/vault/2026-04-28-120000-002.md", {
        kind: "unterminated-code-fence",
        line: 3,
      }),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // 2 files succeed, 1 corrupted with block-parse
      expect(result.value.snapshots).toHaveLength(2);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.filePath).toBe("/vault/2026-04-28-120000-002.md");
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        expect(corrupted.failure.reason).toBe("block-parse");
      }
    }
  });

  test("PROP-026 — total invariant preserved when block-parse fails on N files", async () => {
    // REQ-002 AC: total files = snapshots.length + corruptedFiles.length (no silent drops)
    const vaultPath = makeVaultPath("/vault");

    const files = [
      "/vault/2026-04-28-120000-001.md",
      "/vault/2026-04-28-120000-002.md",
    ];

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(files),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
        "/vault/2026-04-28-120000-002.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-002"),
        },
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("FAIL_BLOCK_PARSE"),
          fm: makeFrontmatter(),
        },
      }),
      // Both files fail block parsing
      parseMarkdownToBlocks: makeBlockParserAlwaysFail("unterminated-code-fence"),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const total = result.value.snapshots.length + result.value.corruptedFiles.length;
      expect(total).toBe(2);
      expect(result.value.corruptedFiles).toHaveLength(2);
      for (const cf of result.value.corruptedFiles) {
        expect(cf.failure.kind).toBe("hydrate");
        if (cf.failure.kind === "hydrate") {
          expect(cf.failure.reason).toBe("block-parse");
        }
      }
    }
  });
});

// ── PROP-029 (Q4): parseMarkdownToBlocks Ok([]) → reason='block-parse' ───────

describe("PROP-029 (Q4) — parseMarkdownToBlocks Ok([]) → CorruptedFile reason='block-parse'", () => {
  // Note: aggregates.md §1.5 invariant 6 requires blocks.length >= 1.
  // An empty Block[] cannot become a valid Note aggregate.
  // These tests will FAIL because scanVault currently has no parseMarkdownToBlocks call
  // and no Ok([]) check.

  test("PROP-029 — body producing Ok([]) → failure:{kind:'hydrate',reason:'block-parse'}", async () => {
    // REQ-017 AC: parseMarkdownToBlocks(snapshot.body) returning Ok([])
    // produces CorruptedFile.failure.reason === 'block-parse'
    // NOT 'invalid-value', NOT auto-padded, NOT silently dropped.
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
      }),
      // Parser succeeds — body is whitespace-only / empty
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("EMPTY_BLOCKS"),
          fm: makeFrontmatter(),
        },
      }),
      // Block parser returns Ok([]) — empty block array
      parseMarkdownToBlocks: makeBlockParserReturnsEmptyFor(),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // PROP-029: Ok([]) must be treated as block-parse failure, NOT auto-padded
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        // Must be 'block-parse', NOT 'invalid-value'
        expect(corrupted.failure.reason).toBe("block-parse");
        expect(corrupted.failure.reason).not.toBe("invalid-value");
      }
    }
  });

  test("PROP-029 — Ok([]) not silently dropped: total invariant preserved", async () => {
    // REQ-002 AC: total files = snapshots.length + corruptedFiles.length
    // An Ok([]) result must not silently disappear from both lists.
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("EMPTY_BLOCKS"),
          fm: makeFrontmatter(),
        },
      }),
      parseMarkdownToBlocks: makeBlockParserReturnsEmptyFor(),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const total = result.value.snapshots.length + result.value.corruptedFiles.length;
      // Total must be 1 — the file must appear in exactly one list
      expect(total).toBe(1);
    }
  });

  test("PROP-029 — Ok([]) is not auto-padded: resulting snapshot must not have blocks.length > 0", async () => {
    // Rejected alternative from REQ-017: auto-pad to a single empty paragraph.
    // The scan layer must NOT auto-pad — it must classify as CorruptedFile.
    // This test verifies the file does NOT appear in snapshots (auto-padding would put it there).
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("EMPTY_BLOCKS"),
          fm: makeFrontmatter(),
        },
      }),
      parseMarkdownToBlocks: makeBlockParserReturnsEmptyFor(),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Auto-padding would add the file to snapshots — must NOT happen
      expect(result.value.snapshots).toHaveLength(0);
    }
  });
});

// ── PROP-029 (Q5=A reachability) — real parser + whitespace-only body → block-parse ──

describe("PROP-029 (Q5=A reachable) — whitespace-only body produces Ok([]) from real parser, folded to reason='block-parse'", () => {
  // PROP-029 / Q4=A: parseMarkdownToBlocks(snapshot.body) returning Ok([]) folds to
  // CorruptedFile.failure: { kind: 'hydrate', reason: 'block-parse' }.
  // Q5=A (rev8): this is the ONLY way Ok([]) is produced — whitespace-only body.
  //
  // This test uses the REAL parseMarkdownToBlocks (not a stub) to confirm the
  // end-to-end path: real whitespace-only body → real parser → Ok([]) → block-parse.
  //
  // Red phase: the current parseMarkdownToBlocks emits paragraph('') for '\n\n\n',
  // so it does NOT return Ok([]) — scanVault would receive a non-empty Block[], and
  // the file would land in snapshots rather than corruptedFiles. FAIL expected.

  test("PROP-029 (Q5=A reachable) — snapshot with body='\\n\\n\\n' → real parser Ok([]) → CorruptedFile reason='block-parse'", async () => {
    // Uses the REAL parseMarkdownToBlocks (imported at the top of the test environment
    // via the scanVault ports mechanism — we inject it explicitly here).
    // The real parser MUST return Ok([]) for whitespace-only body (rev8 contract).
    // scanVault MUST then route Ok([]) → reason='block-parse'.
    const { parseMarkdownToBlocks: realParser } = await import(
      "$lib/domain/capture-auto-save/parse-markdown-to-blocks"
    );

    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-099.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-099.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-099"),
        },
      }),
      // Parser returns body that is whitespace-only: '\n\n\n'
      // The real parseMarkdownToBlocks MUST return Ok([]) for this (rev8).
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("\n\n\n"),
          fm: makeFrontmatter(),
        },
      }),
      // Inject the real parser — NOT a stub. This verifies the real parser + Step 2 integration.
      parseMarkdownToBlocks: realParser,
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // PROP-029: whitespace-only body → real parser returns Ok([]) → block-parse
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.filePath).toBe("/vault/2026-04-28-120000-099.md");
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        expect(corrupted.failure.reason).toBe("block-parse");
      }
    }
  });

  test("PROP-029 (Q5=A reachable) — snapshot with body='   ' (spaces only) → real parser Ok([]) → block-parse", async () => {
    // Spaces-only body: another whitespace-only variant → Ok([]) → block-parse.
    const { parseMarkdownToBlocks: realParser } = await import(
      "$lib/domain/capture-auto-save/parse-markdown-to-blocks"
    );

    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-098.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-098.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-098"),
        },
      }),
      parseNote: (_raw: string) => ({
        ok: true as const,
        value: {
          body: makeBody("   "),
          fm: makeFrontmatter(),
        },
      }),
      parseMarkdownToBlocks: realParser,
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(1);

      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        expect(corrupted.failure.reason).toBe("block-parse");
      }
    }
  });
});

// ── REQ-002 rev7: HydrateNote NOT invoked in Step 2 ─────────────────────────

describe("REQ-002 (rev7) — HydrateNote NOT invoked in Step 2; ScannedVault.snapshots is NoteFileSnapshot[]", () => {
  // REQ-002 rev7 AC: ScannedVault.snapshots[i] is a NoteFileSnapshot (NOT a Note aggregate).
  // This test confirms that scanVault does NOT call hydrateNote anywhere in Step 2.

  test("REQ-002 (rev7): ScanVaultPorts must NOT have a hydrateNote field", () => {
    // The rev7 contract: HydrateNote is NOT a port of Step 2.
    // scanVault accepts parseMarkdownToBlocks (pure, for validation) but NOT hydrateNote.
    // This is a structural contract test — if ScanVaultPorts gains hydrateNote, the spec is violated.

    // Create a ports object that lacks hydrateNote and verify scanVault doesn't need it
    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown([]),
      readFile: makeReadFile({}),
      parseNote: makeParserAlwaysSucceed(),
      // parseMarkdownToBlocks would be here after rev7 fix
      // hydrateNote: must NOT be required by ScanVaultPorts
    };

    // If scanVault tries to call hydrateNote from ports, it will throw (field doesn't exist).
    // If ports required hydrateNote (via type), this test wouldn't compile.
    // Either way, the absence of hydrateNote in the port is the spec-derived constraint.
    expect("hydrateNote" in ports).toBe(false);
  });

  test("REQ-002 (rev7): ScannedVault.snapshots are NoteFileSnapshot values, not Note aggregates", async () => {
    // NoteFileSnapshot has: noteId, body, frontmatter, filePath, fileMtime.
    // Note aggregate has: id, blocks, frontmatter.
    // snapshots[i] must have 'body' (string field), NOT 'blocks' (Block[] field).
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/2026-04-28-120000-001.md"]),
      readFile: makeReadFile({
        "/vault/2026-04-28-120000-001.md": {
          ok: true,
          value: makeValidMarkdownContent("2026-04-28-120000-001"),
        },
      }),
      parseNote: makeParserAlwaysSucceed(),
      parseMarkdownToBlocks: (markdown: string) => ({
        ok: true as const,
        value: [
          {
            id: "block-0" as unknown as import("promptnotes-domain-types/shared/value-objects").BlockId,
            type: "paragraph" as import("promptnotes-domain-types/shared/value-objects").BlockType,
            content: markdown as unknown as import("promptnotes-domain-types/shared/value-objects").BlockContent,
          } as unknown as Block,
        ] as ReadonlyArray<Block>,
      }),
    } as unknown as ScanVaultPorts;

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const snapshots = result.value.snapshots;
      expect(snapshots).toHaveLength(1);
      const snap = snapshots[0];

      // NoteFileSnapshot shape — must have 'body' and 'frontmatter'
      expect("body" in snap).toBe(true);
      expect("frontmatter" in snap).toBe(true);
      expect("filePath" in snap).toBe(true);

      // Note aggregate shape — must NOT have 'blocks'
      // (the validated Block[] from Step 2 is discarded — REQ-002 rev7)
      expect("blocks" in snap).toBe(false);
    }
  });
});
