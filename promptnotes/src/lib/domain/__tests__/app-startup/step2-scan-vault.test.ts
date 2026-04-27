/**
 * step2-scan-vault.test.ts — Step 2: scanVault tests
 *
 * REQ-002: Scans vault, accumulates per-file results
 * REQ-007: list-failed terminates the workflow
 * REQ-016: Per-file readFile failure → read-kind ScanFileFailure
 *
 * PROP-008: list-failed terminates before Steps 3 and 4
 * PROP-009: per-file readFile failure accumulates CorruptedFile (read kind), workflow continues
 * PROP-010: zero-byte file → hydrate kind, missing-field
 * PROP-011: empty vault (0 .md files) → empty Feed, proceeds to Step 4
 * PROP-012: all-corrupted vault succeeds, empty Feed
 * PROP-018: total output invariant: snapshots.length + corruptedFiles.length = input count
 * PROP-020: permission-denied readFile → failure {kind:'read', fsError:{kind:'permission'}}
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import type { CorruptedFile, NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { ScannedVault } from "$lib/domain/app-startup/stages";

// The implementation does NOT exist yet. This import will fail in Red phase.
import {
  scanVault,
  type ScanVaultPorts,
} from "$lib/domain/app-startup/scan-vault";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeVaultPath(raw: string): VaultPath {
  return raw as unknown as VaultPath;
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

function makeListMarkdownFail(detail: string) {
  return (_path: VaultPath) => ({
    ok: false as const,
    error: { kind: "list-failed" as const, detail },
  });
}

function makeReadFile(responses: Record<string, { ok: boolean; value?: string; error?: FsError }>) {
  return (filePath: string) => {
    const r = responses[filePath];
    if (!r) return { ok: true as const, value: "" };
    if (r.ok) return { ok: true as const, value: r.value ?? "" };
    return { ok: false as const, error: r.error! };
  };
}

function makeParserAlwaysSucceed(noteIdFor: (path: string) => string) {
  return (raw: string) => {
    if (!raw.trim()) {
      return { ok: false as const, error: "missing-field" as const };
    }
    return {
      ok: true as const,
      value: {
        // Parser returns the snapshot data needed to build NoteFileSnapshot
        body: "Body text",
        fm: {
          tags: [],
          createdAt: { epochMillis: 1714298400000 } as any,
          updatedAt: { epochMillis: 1714298400000 } as any,
        } as any,
      },
    };
  };
}

function makeParserAlwaysFail(reason: "yaml-parse" | "missing-field" | "invalid-value") {
  return (_raw: string) => ({ ok: false as const, error: reason });
}

// ── REQ-007 / PROP-008 ────────────────────────────────────────────────────

describe("REQ-007 / PROP-008: listMarkdown failure terminates workflow", () => {
  test("list-failed produces scan error with detail", async () => {
    // REQ-007 AC: AppStartupError.kind==='scan', reason.kind==='list-failed'
    const vaultPath = makeVaultPath("/home/user/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdownFail("EPERM: operation not permitted"),
      readFile: makeReadFile({}),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("scan");
      if (result.error.kind === "scan") {
        expect(result.error.reason.kind).toBe("list-failed");
        expect(result.error.reason.detail).toBe("EPERM: operation not permitted");
      }
    }
  });

  test("PROP-008: Steps 3 and 4 are not executed after list-failed", async () => {
    // REQ-007 AC: Steps 3 and 4 are not executed.
    // We verify readFile is never called (proxy for steps not executing).
    let readFileCalled = false;
    const vaultPath = makeVaultPath("/home/user/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdownFail("disk error"),
      readFile: (_path) => {
        readFileCalled = true;
        return { ok: true, value: "" };
      },
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    await scanVault(vaultPath, ports);

    expect(readFileCalled).toBe(false);
  });
});

// ── REQ-002 / PROP-011 ────────────────────────────────────────────────────

describe("REQ-002 / PROP-011: empty vault → empty ScannedVault", () => {
  test("0 .md files → snapshots=[], corruptedFiles=[], workflow continues", async () => {
    // REQ-002 edge case: empty vault still produces a valid ScannedVault.
    const vaultPath = makeVaultPath("/home/user/empty-vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown([]),
      readFile: makeReadFile({}),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("ScannedVault");
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(0);
    }
  });
});

// ── REQ-002 (total invariant) / PROP-018 ─────────────────────────────────

describe("REQ-002 / PROP-018: total output invariant (snapshots + corruptedFiles = input)", () => {
  test("3 files: 2 succeed + 1 readFile fails → total=3", async () => {
    // REQ-002 AC: total files = snapshots.length + corruptedFiles.length
    const vaultPath = makeVaultPath("/home/user/vault");
    const files = ["/vault/a.md", "/vault/b.md", "/vault/c.md"];

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(files),
      readFile: makeReadFile({
        "/vault/a.md": { ok: true, value: makeValidMarkdownContent("a") },
        "/vault/b.md": { ok: true, value: makeValidMarkdownContent("b") },
        "/vault/c.md": { ok: false, error: { kind: "lock" } },
      }),
      parseNote: makeParserAlwaysSucceed((p) => p),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const total = result.value.snapshots.length + result.value.corruptedFiles.length;
      expect(total).toBe(3);
      expect(result.value.corruptedFiles).toHaveLength(1);
    }
  });

  test("PROP-018 property: snapshots.length + corruptedFiles.length === input count", () => {
    // Tier 1 property: invariant holds for arbitrary file counts and failure patterns.
    // fast-check: generate N files, each either succeeding or failing readFile.
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            path: fc.string({ minLength: 1, maxLength: 30 }).map((s) => `/vault/${s}.md`),
            succeeds: fc.boolean(),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        async (fileSpecs) => {
          // Deduplicate paths to avoid collision in test setup
          const seen = new Set<string>();
          const uniqueSpecs = fileSpecs.filter((s) => {
            if (seen.has(s.path)) return false;
            seen.add(s.path);
            return true;
          });

          const files = uniqueSpecs.map((s) => s.path);
          const readFileResponses: Record<string, { ok: boolean; value?: string; error?: FsError }> = {};
          for (const spec of uniqueSpecs) {
            if (spec.succeeds) {
              readFileResponses[spec.path] = {
                ok: true,
                value: makeValidMarkdownContent(spec.path),
              };
            } else {
              readFileResponses[spec.path] = {
                ok: false,
                error: { kind: "permission" },
              };
            }
          }

          const vaultPath = makeVaultPath("/vault");
          const ports: ScanVaultPorts = {
            listMarkdown: makeListMarkdown(files),
            readFile: makeReadFile(readFileResponses),
            parseNote: makeParserAlwaysSucceed((p) => p),
          };

          const result = await scanVault(vaultPath, ports);
          if (!result.ok) {
            // list-failed would only happen if listMarkdown errored, but here it succeeds
            return false;
          }
          const total = result.value.snapshots.length + result.value.corruptedFiles.length;
          return total === uniqueSpecs.length;
        }
      )
    );
  });
});

// ── REQ-016 / PROP-009 / PROP-020 ────────────────────────────────────────

describe("REQ-016 / PROP-009 / PROP-020: per-file readFile failure → read-kind CorruptedFile", () => {
  test("PROP-020: permission-denied readFile → failure {kind:'read', fsError:{kind:'permission'}}", async () => {
    // REQ-016 AC: CorruptedFile.failure.kind === 'read' for OS-level failures.
    const vaultPath = makeVaultPath("/vault");
    const files = ["/vault/locked.md", "/vault/ok.md"];

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(files),
      readFile: makeReadFile({
        "/vault/locked.md": { ok: false, error: { kind: "permission" } },
        "/vault/ok.md": { ok: true, value: makeValidMarkdownContent() },
      }),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.corruptedFiles).toHaveLength(1);
      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.filePath).toBe("/vault/locked.md");
      // PROP-020: must be 'read' kind, not 'hydrate'
      expect(corrupted.failure.kind).toBe("read");
      if (corrupted.failure.kind === "read") {
        expect(corrupted.failure.fsError.kind).toBe("permission");
      }
    }
  });

  test("lock failure produces read kind CorruptedFile", async () => {
    // REQ-016 edge case: file locked by another process
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/note.md"]),
      readFile: makeReadFile({
        "/vault/note.md": { ok: false, error: { kind: "lock" } },
      }),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("read");
      if (corrupted.failure.kind === "read") {
        expect(corrupted.failure.fsError.kind).toBe("lock");
      }
    }
  });

  test("not-found failure (file disappeared) produces read kind CorruptedFile", async () => {
    // REQ-016 edge case: file disappeared between listMarkdown and readFile
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/ghost.md"]),
      readFile: makeReadFile({
        "/vault/ghost.md": { ok: false, error: { kind: "not-found" } },
      }),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("read");
      if (corrupted.failure.kind === "read") {
        expect(corrupted.failure.fsError.kind).toBe("not-found");
      }
    }
  });

  test("unknown OS error produces read kind with detail", async () => {
    // REQ-016 edge case: unknown OS error
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/note.md"]),
      readFile: makeReadFile({
        "/vault/note.md": { ok: false, error: { kind: "unknown", detail: "I/O error" } },
      }),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("read");
      if (corrupted.failure.kind === "read") {
        expect(corrupted.failure.fsError.kind).toBe("unknown");
      }
    }
  });

  test("PROP-009: remaining files are processed normally after one failure", async () => {
    // REQ-016 AC: The remaining files are not affected; workflow continues.
    const vaultPath = makeVaultPath("/vault");
    const files = ["/vault/fail.md", "/vault/ok1.md", "/vault/ok2.md"];

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(files),
      readFile: makeReadFile({
        "/vault/fail.md": { ok: false, error: { kind: "permission" } },
        "/vault/ok1.md": { ok: true, value: makeValidMarkdownContent("ok1") },
        "/vault/ok2.md": { ok: true, value: makeValidMarkdownContent("ok2") },
      }),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshots).toHaveLength(2);
      expect(result.value.corruptedFiles).toHaveLength(1);
      expect(result.value.corruptedFiles[0].filePath).toBe("/vault/fail.md");
    }
  });
});

// ── REQ-002 / PROP-010: zero-byte file ────────────────────────────────────

describe("REQ-002 / PROP-010: zero-byte file → hydrate kind, missing-field", () => {
  test("empty string from readFile → failure {kind:'hydrate', reason:'missing-field'}", async () => {
    // REQ-002 edge case: zero-byte file readFile succeeds (returns ""),
    // parser cannot find required fields → missing-field.
    // Source: aggregates.md §1 Frontmatter — tags, createdAt, updatedAt required.
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/empty.md"]),
      readFile: makeReadFile({
        "/vault/empty.md": { ok: true, value: "" }, // zero-byte
      }),
      // Parser receives "" and fails with missing-field
      parseNote: (_raw: string) => {
        if (!_raw.trim()) {
          return { ok: false, error: "missing-field" as const };
        }
        return { ok: true, value: { body: "x", fm: {} as any } };
      },
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(1);
      const corrupted = result.value.corruptedFiles[0];
      // PROP-010: must be 'hydrate' kind (not 'read') since readFile succeeded
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        expect(corrupted.failure.reason).toBe("missing-field");
      }
    }
  });
});

// ── REQ-002 yaml-parse and invalid-value ─────────────────────────────────

describe("REQ-002: parser failures produce hydrate-kind CorruptedFiles", () => {
  test("yaml-parse parser failure → hydrate kind with yaml-parse reason", async () => {
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/bad.md"]),
      readFile: makeReadFile({
        "/vault/bad.md": { ok: true, value: "not valid yaml: [[[" },
      }),
      parseNote: makeParserAlwaysFail("yaml-parse"),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        expect(corrupted.failure.reason).toBe("yaml-parse");
      }
    }
  });

  test("invalid-value parser failure → hydrate kind with invalid-value reason", async () => {
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/badtag.md"]),
      readFile: makeReadFile({
        "/vault/badtag.md": {
          ok: true,
          value: "---\ntags: [\"\"]\ncreatedAt: 2026\nupdatedAt: 2026\n---\nbody",
        },
      }),
      parseNote: makeParserAlwaysFail("invalid-value"),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const corrupted = result.value.corruptedFiles[0];
      expect(corrupted.failure.kind).toBe("hydrate");
      if (corrupted.failure.kind === "hydrate") {
        expect(corrupted.failure.reason).toBe("invalid-value");
      }
    }
  });
});

// ── REQ-009 / PROP-012: all-corrupted vault ───────────────────────────────

describe("REQ-009 / PROP-012: all-corrupted vault → empty snapshots, workflow continues", () => {
  test("every file corrupted → snapshots=[], corruptedFiles.length===total", async () => {
    // REQ-009 AC / REQ-002 edge case: every file is corrupted.
    const vaultPath = makeVaultPath("/vault");
    const files = ["/vault/a.md", "/vault/b.md"];

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(files),
      readFile: makeReadFile({
        "/vault/a.md": { ok: false, error: { kind: "permission" } },
        "/vault/b.md": { ok: false, error: { kind: "lock" } },
      }),
      parseNote: makeParserAlwaysSucceed(() => ""),
    };

    const result = await scanVault(vaultPath, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshots).toHaveLength(0);
      expect(result.value.corruptedFiles).toHaveLength(2);
    }
  });

  test("PROP-012: workflow returns Ok even when all files are corrupted", async () => {
    // REQ-009 AC: Workflow does NOT fail on per-file errors.
    const vaultPath = makeVaultPath("/vault");

    const ports: ScanVaultPorts = {
      listMarkdown: makeListMarkdown(["/vault/bad.md"]),
      readFile: makeReadFile({
        "/vault/bad.md": { ok: true, value: "" },
      }),
      parseNote: makeParserAlwaysFail("missing-field"),
    };

    const result = await scanVault(vaultPath, ports);

    // Must be Ok (not Err) because per-file errors do not terminate the workflow
    expect(result.ok).toBe(true);
  });
});
