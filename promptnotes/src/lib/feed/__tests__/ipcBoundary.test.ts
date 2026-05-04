/**
 * ipcBoundary.test.ts — PROP-FEED-032
 *
 * Tier 0 grep-based IPC boundary audit.
 *
 * PROP-FEED-032:
 *   - grep "listen" tauriFeedAdapter.ts → zero hits (OUTBOUND only)
 *   - grep "invoke" feedStateChannel.ts → zero hits (INBOUND only)
 *
 * RED PHASE: these tests verify structural properties.
 * The stubs were written to be clean, so these may PASS in Red phase.
 * That is acceptable — structural audit tests are not behavioral.
 */

import { describe, test, expect } from 'bun:test';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const FEED_DIR = join(import.meta.dir, '..');

// ── PROP-FEED-032: IPC boundary separation ───────────────────────────────────

describe('PROP-FEED-032: IPC boundary audit', () => {
  test('tauriFeedAdapter.ts does NOT contain "listen" (OUTBOUND only)', () => {
    const filePath = join(FEED_DIR, 'tauriFeedAdapter.ts');
    let output: string = '';
    try {
      const result = execSync(`grep -n "listen" "${filePath}" 2>&1`);
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
    // If grep succeeded, it found 'listen' — fail
    expect(output).toBe('');
  });

  test('feedStateChannel.ts does NOT contain "invoke" (INBOUND only)', () => {
    const filePath = join(FEED_DIR, 'feedStateChannel.ts');
    let output: string = '';
    try {
      const result = execSync(`grep -n "invoke" "${filePath}" 2>&1`);
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
    // If grep succeeded, it found 'invoke' — fail
    expect(output).toBe('');
  });

  test('pure modules do NOT import @tauri-apps/api (PROP-FEED-031 partial)', () => {
    const pureModules = ['feedRowPredicates.ts', 'feedReducer.ts', 'deleteConfirmPredicates.ts'];
    for (const module of pureModules) {
      const filePath = join(FEED_DIR, module);
      let output: string = '';
      try {
        const result = execSync(`grep -n "@tauri-apps/api" "${filePath}" 2>&1`);
        output = result.toString().trim();
      } catch (err: unknown) {
        const execErr = err as { status?: number };
        if (execErr.status === 1) {
          continue;
        }
        throw err;
      }
      expect(output).toBe('');
    }
  });
});
