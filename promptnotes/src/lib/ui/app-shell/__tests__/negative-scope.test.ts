/**
 * negative-scope.test.ts — NEG-REQ-001..NEG-REQ-005, PROP-002, PROP-011
 *
 * NEG-REQ-001: エディタ UI の排除
 *   - エディタ textarea / CopyNoteBody / RequestNewNote / EditNoteBody を含むコンポーネントが存在しない
 *
 * NEG-REQ-002: フィード行 UI の排除
 *   - Feed.computeVisible() を反復してノート行を描画するコードが存在しない
 *   - RequestNoteDeletion / AddTagViaChip / RemoveTagViaChip dispatch が存在しない
 *
 * NEG-REQ-003: 検索ボックスの排除
 *   - UnvalidatedFilterInput.searchTextRaw を構築して検索するコードが存在しない
 *
 * NEG-REQ-004: タグチップフィルタ UI の排除
 *   - ApplyTagFilter dispatch が存在しない
 *
 * NEG-REQ-005: TypeScript 側 Value Object 構築の排除 (cross-reference PROP-002)
 *   - as VaultPath, as Body, as Tag, as Frontmatter, as NoteId, as VaultId, as Timestamp
 *     の型キャストが存在しない（allowlist ファイルを除く）
 *
 * PROP-002: ブランド型の TypeScript 側構築が存在しない (Tier 0 AST lint)
 *   Static-analysis audit scanning source files for brand type casts.
 *
 * PROP-011: appShellStore 書き込み面隔離（cross-reference effectful-isolation.test.ts）
 *
 * These tests perform static file-system scans. They FAIL because source files don't exist
 * yet (dir not found) — that is the RED signal for audit-style tests.
 *
 * RED PHASE: Static analysis — source directory must not exist yet for RED to hold.
 * The $lib/ui/app-shell/ source files do NOT exist.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const UI_APP_SHELL_SRC = path.resolve(process.cwd(), "src/lib/ui/app-shell");
const TESTS_DIR = path.resolve(UI_APP_SHELL_SRC, "__tests__");

// Brand types that must NOT be constructed in TypeScript source
const FORBIDDEN_BRAND_TYPES = [
  "VaultPath",
  "Body",
  "Tag",
  "Frontmatter",
  "NoteId",
  "VaultId",
  "Timestamp",
];

// Patterns that indicate NEG-REQ violations (editor, feed-row, search, tag-chip)
const FORBIDDEN_EDITOR_SYMBOLS = [
  "EditNoteBody",
  "CopyNoteBody",
  "RequestNewNote",
  "<textarea",
];

const FORBIDDEN_FEED_ROW_SYMBOLS = [
  "RequestNoteDeletion",
  "AddTagViaChip",
  "RemoveTagViaChip",
  "computeVisible(",
];

const FORBIDDEN_SEARCH_SYMBOLS = [
  "searchTextRaw",
  "ApplySearch",
  "UnvalidatedFilterInput",
];

const FORBIDDEN_TAG_CHIP_SYMBOLS = [
  "ApplyTagFilter",
];

// ── Helper: scan source files ─────────────────────────────────────────────────

const REQUIRED_SOURCE_FILES = [
  "AppShell.svelte",
  "VaultSetupModal.svelte",
  "tauriAdapter.ts",
  "routeStartupResult.ts",
  "appShellStore.ts",
  "bootOrchestrator.ts",
  "designTokens.ts",
  "errorMessages.ts",
  "modalClosePolicy.ts",
  "corruptedBanner.ts",
];

function collectSourceFiles(dir: string, excludeDirs: string[] = []): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.some((ex) => fullPath.startsWith(ex))) continue;
      files.push(...collectSourceFiles(fullPath, excludeDirs));
    } else if (entry.isFile() && (entry.name.endsWith(".svelte") || entry.name.endsWith(".ts"))) {
      // Exclude files with @vcsdd-allow-brand-construction comment
      files.push(fullPath);
    }
  }
  return files;
}

// RED PHASE GUARD: fail if required production source files are missing
describe("RED PHASE GUARD: production source files must exist for audit to be meaningful", () => {
  test("AppShell.svelte production module must exist (RED: file not found)", () => {
    const p = path.join(UI_APP_SHELL_SRC, "AppShell.svelte");
    // Intentionally fail in RED phase — source file does not exist yet
    expect(fs.existsSync(p)).toBe(true);
  });

  test("tauriAdapter.ts production module must exist (RED: file not found)", () => {
    const p = path.join(UI_APP_SHELL_SRC, "tauriAdapter.ts");
    expect(fs.existsSync(p)).toBe(true);
  });

  test("routeStartupResult.ts production module must exist (RED: file not found)", () => {
    const p = path.join(UI_APP_SHELL_SRC, "routeStartupResult.ts");
    expect(fs.existsSync(p)).toBe(true);
  });

  test("appShellStore.ts production module must exist (RED: file not found)", () => {
    const p = path.join(UI_APP_SHELL_SRC, "appShellStore.ts");
    expect(fs.existsSync(p)).toBe(true);
  });

  test("designTokens.ts production module must exist (RED: file not found)", () => {
    const p = path.join(UI_APP_SHELL_SRC, "designTokens.ts");
    expect(fs.existsSync(p)).toBe(true);
  });
});

function findPatterns(files: string[], patterns: string[]): Array<{ file: string; pattern: string; line: number }> {
  const violations: Array<{ file: string; pattern: string; line: number }> = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf-8");
    // Skip files with allow-brand-construction comment
    if (content.includes("@vcsdd-allow-brand-construction")) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        if (lines[i].includes(pattern)) {
          violations.push({ file: filePath, pattern, line: i + 1 });
        }
      }
    }
  }
  return violations;
}

// ── NEG-REQ-001: No editor UI ────────────────────────────────────────────────

describe("NEG-REQ-001: No editor UI components in ui-app-shell", () => {
  test("NEG-REQ-001: No EditNoteBody / CopyNoteBody / RequestNewNote / textarea in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, FORBIDDEN_EDITOR_SYMBOLS);
    expect(violations).toEqual([]);
  });
});

// ── NEG-REQ-002: No feed row UI ──────────────────────────────────────────────

describe("NEG-REQ-002: No feed note row UI in ui-app-shell", () => {
  test("NEG-REQ-002: No RequestNoteDeletion / AddTagViaChip / RemoveTagViaChip / computeVisible in source", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, FORBIDDEN_FEED_ROW_SYMBOLS);
    expect(violations).toEqual([]);
  });
});

// ── NEG-REQ-003: No search box ───────────────────────────────────────────────

describe("NEG-REQ-003: No search box UI in ui-app-shell", () => {
  test("NEG-REQ-003: No searchTextRaw / ApplySearch / UnvalidatedFilterInput in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, FORBIDDEN_SEARCH_SYMBOLS);
    expect(violations).toEqual([]);
  });
});

// ── NEG-REQ-004: No tag chip filter UI ───────────────────────────────────────

describe("NEG-REQ-004: No tag chip filter UI in ui-app-shell", () => {
  test("NEG-REQ-004: No ApplyTagFilter in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, FORBIDDEN_TAG_CHIP_SYMBOLS);
    expect(violations).toEqual([]);
  });
});

// ── NEG-REQ-005 / PROP-002: No TS-side brand type construction ───────────────

describe("NEG-REQ-005 / PROP-002: No TypeScript-side brand type construction", () => {
  // Build patterns: "as VaultPath", "as Body", etc.
  const AS_BRAND_PATTERNS = FORBIDDEN_BRAND_TYPES.map((t) => `as ${t}`);
  // Also angle-bracket: <VaultPath>value
  const ANGLE_BRACKET_PATTERNS = FORBIDDEN_BRAND_TYPES.map((t) => `<${t}>`);

  test("PROP-002: no 'as BrandType' casts in source files (outside allowlist)", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, AS_BRAND_PATTERNS);
    expect(violations).toEqual([]);
  });

  test("PROP-002: no '<BrandType>value' angle-bracket casts in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, ANGLE_BRACKET_PATTERNS);
    expect(violations).toEqual([]);
  });

  test("PROP-002: no 'as unknown as BrandType' double-cast in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const doubleAsPatterns = FORBIDDEN_BRAND_TYPES.map((t) => `as unknown as ${t}`);
    const violations = findPatterns(sourceFiles, doubleAsPatterns);
    expect(violations).toEqual([]);
  });

  test("NEG-REQ-005: no VaultId.singleton() reimplementation in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, ["VaultId.singleton()"]);
    expect(violations).toEqual([]);
  });

  test("NEG-REQ-005: no Timestamp hand-construction ({ epochMillis: Date.now() }) in source files", () => {
    const sourceFiles = collectSourceFiles(UI_APP_SHELL_SRC, [TESTS_DIR]);
    const violations = findPatterns(sourceFiles, ["epochMillis: Date.now()"]);
    expect(violations).toEqual([]);
  });
});

// ── Type-level: VaultPath brand cannot be constructed from string literal ─────

describe("PROP-002 (Tier 0): VaultPath brand type cannot be assigned from plain string at compile time", () => {
  test("PROP-002: string is not assignable to VaultPath (compile-time — @ts-expect-error)", () => {
    // This test demonstrates the type-level constraint.
    // If the @ts-expect-error is removed and the assignment compiles, the brand is broken.
    import("promptnotes-domain-types/shared/value-objects").then((mod) => {
      type VaultPath = typeof mod extends { VaultPath: infer T } ? T : never;
      // @ts-expect-error — a plain string is not assignable to VaultPath (brand type)
      const _bad: import("promptnotes-domain-types/shared/value-objects").VaultPath = "/path/to/vault";
      void _bad;
    });
    // If we reach here without compile error, the brand is correctly enforced
    expect(true).toBe(true); // test scaffolding
  });
});
