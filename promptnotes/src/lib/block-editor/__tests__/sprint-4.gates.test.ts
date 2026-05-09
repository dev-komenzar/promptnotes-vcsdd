/**
 * sprint-4.gates.test.ts — Tier 5 source-grep gates (bun:test)
 *
 * Sprint 4 of ui-block-editor (Phase 2c).
 *
 * Coverage:
 *   PROP-BE-040 / REQ-BE-027 — no legacy EditorPane type residual in src/lib/block-editor/
 *   PROP-BE-041 / NFR-BE-001 — pure modules contain no forbidden API
 *   PROP-BE-042            — old src/lib/editor/ directory does not exist
 *   PROP-BE-043 / REQ-BE-022 — `2000` literal forbidden outside debounceSchedule.ts
 *   PROP-BE-044 / NFR-BE-007 — Phase 2c rename: no `REQ-EDIT` / `PROP-EDIT` IDs in source
 *   PROP-BE-045            — PROP-BE ID continuity in spec files
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const PROJECT_ROOT = path.resolve(import.meta.dir, '../../../..');
const BLOCK_EDITOR_DIR = path.join(PROJECT_ROOT, 'src/lib/block-editor');
const VCSDD_FEATURE_DIR = path.resolve(
  PROJECT_ROOT,
  '../.vcsdd/features/ui-block-editor',
);

function grepLines(args: string[]): string[] {
  try {
    const out = execSync(['grep', ...args].join(' '), { encoding: 'utf-8' });
    return out.split('\n').filter((l) => l.length > 0);
  } catch (e) {
    // grep returns exit code 1 when no match — treat as zero hits
    const stdout = (e as { stdout?: Buffer }).stdout?.toString('utf-8') ?? '';
    return stdout.split('\n').filter((l) => l.length > 0);
  }
}

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-040 / REQ-BE-027: no legacy EditorPane types residual
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-040 / REQ-BE-027: no legacy EditorPane type residual', () => {
  test('production source has no legacy EditorPane type identifiers (excluding tests + comments)', () => {
    // PROP-BE-040 / REQ-BE-027 spec wording: legacy identifiers must not appear in
    // *production* source. Test files may reference them as fixture / regex literal
    // strings (legitimate); we exclude __tests__/ to avoid those false positives.
    const lines = grepLines([
      '-rnE',
      `'\\b(EditorIpcAdapter|EditorViewState|EditorAction|EditorCommand|EditingSessionStateDto|EditingSessionStatus|subscribeToState)\\b'`,
      BLOCK_EDITOR_DIR,
      `--include='*.ts'`,
      `--include='*.svelte'`,
      `--exclude-dir=__tests__`,
    ]);
    // Multi-file grep `-rn` output: `<file>:<lineNo>:<content>`. Strip two prefixes.
    const violations = lines.filter((l) => {
      const idx = l.indexOf(':', l.indexOf(':') + 1);
      const content = idx >= 0 ? l.slice(idx + 1).trimStart() : l;
      return !(content.startsWith('//') || content.startsWith('*') || content.startsWith('/*'));
    });
    expect(violations).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-041 / NFR-BE-001: pure modules contain no forbidden API
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-041 / NFR-BE-001: pure modules forbidden API zero', () => {
  test('blockPredicates.ts has no forbidden API (excluding doc comments)', () => {
    const file = path.join(BLOCK_EDITOR_DIR, 'blockPredicates.ts');
    const lines = grepLines([
      '-nE',
      `'Math\\.random|crypto\\.|performance\\.|window\\.|globalThis|self\\.|document\\.|navigator\\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\\.now\\b|\\bDate\\(|new Date\\b|\\$state\\b|\\$effect\\b|\\$derived\\b|import\\.meta|invoke\\(|@tauri-apps/api'`,
      file,
    ]);
    // Single-file grep `-n` output: `<lineNo>:<content>`. Strip one prefix.
    const violations = lines.filter((l) => {
      const idx = l.indexOf(':');
      const real = idx >= 0 ? l.slice(idx + 1).trimStart() : l;
      return !(real.startsWith('//') || real.startsWith('*') || real.startsWith('/*'));
    });
    expect(violations).toEqual([]);
  });

  test('debounceSchedule.ts has no forbidden API (excluding doc comments)', () => {
    const file = path.join(BLOCK_EDITOR_DIR, 'debounceSchedule.ts');
    const lines = grepLines([
      '-nE',
      `'Math\\.random|crypto\\.|performance\\.|window\\.|globalThis|self\\.|document\\.|navigator\\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\\.now\\b|\\bDate\\(|new Date\\b|\\$state\\b|\\$effect\\b|\\$derived\\b|import\\.meta|invoke\\(|@tauri-apps/api'`,
      file,
    ]);
    // Single-file grep `-n` output: `<lineNo>:<content>`. Strip one prefix.
    const violations = lines.filter((l) => {
      const idx = l.indexOf(':');
      const real = idx >= 0 ? l.slice(idx + 1).trimStart() : l;
      return !(real.startsWith('//') || real.startsWith('*') || real.startsWith('/*'));
    });
    expect(violations).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-042: old src/lib/editor/ directory absence
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-042: legacy editor/ dir is absent', () => {
  test('src/lib/editor/ does not exist', () => {
    const legacyDir = path.join(PROJECT_ROOT, 'src/lib/editor');
    expect(fs.existsSync(legacyDir)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-043 / REQ-BE-022: 2000 literal forbidden outside debounceSchedule.ts
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-043 / REQ-BE-022: `2000` literal forbidden outside debounceSchedule.ts (production source)', () => {
  test('grep `\\b2000\\b` in src/lib/block-editor/*.ts and *.svelte (excluding tests + debounceSchedule.ts) → 0 hits', () => {
    const lines = grepLines([
      '-rnE',
      `'\\b2000\\b'`,
      BLOCK_EDITOR_DIR,
      `--include='*.ts'`,
      `--include='*.svelte'`,
      `--exclude-dir=__tests__`,
    ]);
    const violations = lines.filter((l) => !l.includes('debounceSchedule.ts'));
    expect(violations).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-044 / NFR-BE-007: REQ-EDIT / PROP-EDIT IDs absent post Phase 2c
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-044 / NFR-BE-007: legacy REQ-EDIT / PROP-EDIT IDs renamed', () => {
  test('blockPredicates.ts and debounceSchedule.ts have no REQ-EDIT- or PROP-EDIT- references', () => {
    const lines = grepLines([
      '-nE',
      `'\\b(REQ-EDIT|PROP-EDIT|EC-EDIT)-[0-9]+\\b'`,
      path.join(BLOCK_EDITOR_DIR, 'blockPredicates.ts'),
      path.join(BLOCK_EDITOR_DIR, 'debounceSchedule.ts'),
    ]);
    expect(lines).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-045: PROP-BE ID continuity in spec files
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-045: PROP-BE ID continuity in spec files', () => {
  test('catalog uses contiguous IDs (no gaps)', () => {
    const specDir = path.join(VCSDD_FEATURE_DIR, 'specs');
    const files = ['behavioral-spec.md', 'verification-architecture.md'];
    const ids = new Set<number>();
    for (const f of files) {
      const text = fs.readFileSync(path.join(specDir, f), 'utf-8');
      for (const m of text.matchAll(/PROP-BE-(\d+)/g)) {
        ids.add(Number(m[1]));
      }
    }
    const sorted = Array.from(ids).sort((a, b) => a - b);
    expect(sorted.length).toBeGreaterThan(0);
    // Allow declared catalog to skip-numbered entries within explicitly
    // documented range. Per spec rev2, the canonical catalog is 001..047.
    // So we assert that 1..47 are all present.
    const missing: number[] = [];
    for (let i = 1; i <= 47; i++) {
      if (!ids.has(i)) missing.push(i);
    }
    expect(missing).toEqual([]);
  });
});
