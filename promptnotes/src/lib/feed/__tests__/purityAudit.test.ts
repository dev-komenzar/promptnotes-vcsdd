/**
 * purityAudit.test.ts — PROP-FEED-030, PROP-FEED-031
 *
 * Tier 0 grep-based purity audit for pure core modules.
 *
 * PROP-FEED-030: grep -r "from 'svelte/store'" src/lib/feed/ → zero hits
 * PROP-FEED-031: canonical purity-audit grep pattern hits zero in pure modules:
 *   feedRowPredicates.ts, feedReducer.ts, deleteConfirmPredicates.ts
 *
 * These tests use Node.js fs + execSync to grep source files.
 * RED PHASE: these tests will FAIL because:
 *   - The files don't exist yet when tests first run, OR
 *   - The stub files might accidentally contain forbidden patterns.
 * In fact: the stubs themselves contain 'throw new Error' which is fine,
 * but we verify purity constraints are not violated.
 *
 * Note: The grep tests PASS in Red phase only if stubs are clean.
 * If the stubs happen to be clean (no forbidden API), these grep tests would PASS
 * in Red phase — that is acceptable since grep tests are structural, not behavioral.
 * The behavioral tests (feedRowPredicates, feedReducer, deleteConfirmPredicates)
 * will all FAIL because stubs throw.
 */

import { describe, test, expect } from 'bun:test';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const FEED_DIR = join(import.meta.dir, '..');
const PURE_MODULES = [
  'feedRowPredicates.ts',
  'feedReducer.ts',
  'deleteConfirmPredicates.ts',
  // ui-filter-search Phase 2a — new pure modules
  'searchPredicate.ts',
  'sortByUpdatedAt.ts',
  'computeVisible.ts',
];

// ── PROP-FEED-030: No svelte/store imports ────────────────────────────────────

describe("PROP-FEED-030: grep 'svelte/store' in src/lib/feed/ → zero hits", () => {
  test("no file in src/lib/feed/ imports from 'svelte/store'", () => {
    let result: Buffer;
    try {
      // Exclude __tests__ to avoid false positives from test file comments.
      result = execSync(
        `grep -r --include="*.ts" --include="*.svelte" --exclude-dir="__tests__" "from 'svelte/store'" "${FEED_DIR}" 2>&1`
      );
      // If grep succeeds (exit 0), it found matches → FAIL
      const output = result.toString().trim();
      expect(output).toBe('');
    } catch (err: unknown) {
      // grep exit code 1 means zero matches → PASS
      const execErr = err as { status?: number };
      if (execErr.status === 1) {
        // Zero hits — expected
        expect(true).toBe(true);
      } else {
        throw err;
      }
    }
  });
});

// ── PROP-FEED-031: Canonical purity-audit grep ────────────────────────────────

const PURITY_PATTERN = [
  'Math\\.random',
  'crypto\\.',
  'performance\\.',
  'window\\.',
  'globalThis',
  'self\\.',
  'document\\.',
  'navigator\\.',
  'requestAnimationFrame',
  'requestIdleCallback',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch\\(',
  'XMLHttpRequest',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'Date\\.now\\b',
  '\\bDate\\(',
  'new Date\\b',
  '\\$state\\b',
  '\\$effect\\b',
  '\\$derived\\b',
  'import\\.meta',
  'invoke\\(',
  '@tauri-apps/api',
].join('|');

describe('PROP-FEED-031: canonical purity-audit pattern → zero hits in pure modules', () => {
  for (const module of PURE_MODULES) {
    test(`pure module ${module} contains no forbidden APIs`, () => {
      const filePath = join(FEED_DIR, module);
      let output: string = '';
      try {
        // Grep only non-comment lines: exclude lines starting with optional whitespace + '*' or '//'
        const result = execSync(
          `grep -vE "^\\s*(\\*|//)" "${filePath}" | grep -E "${PURITY_PATTERN}" 2>&1`
        );
        output = result.toString().trim();
      } catch (err: unknown) {
        const execErr = err as { status?: number };
        if (execErr.status === 1) {
          // Zero hits — PASS
          expect(true).toBe(true);
          return;
        }
        throw err;
      }
      // If we get here, grep found matches in non-comment lines
      expect(output).toBe('');
    });
  }
});
