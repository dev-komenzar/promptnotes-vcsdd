/**
 * sprint-5.gates.test.ts — Tier 0/5 source-grep / filesystem gates (bun:test)
 *
 * Sprint 5 of ui-feed-list-actions (in-place editing migration).
 *
 * Coverage (delegates to scripts/sprint-5-grep-audit.sh):
 *   PROP-FEED-S5-001 — +page.svelte forbidden identifier grep
 *   PROP-FEED-S5-002 (grep) — height: 100vh in +page.svelte
 *   PROP-FEED-S5-003 — listen('editing_session_state_changed') exactly 1 in editingSessionChannel.ts
 *   PROP-FEED-S5-004 — editorStateChannel absent from production
 *   PROP-FEED-S5-012 — editingSessionChannel handler is async-free
 *   PROP-FEED-S5-013 — sprint-4-baseline emit lines unchanged
 *   PROP-FEED-S5-014 — EditorPane forbidden identifiers absent from production
 *   PROP-FEED-S5-015 — src/lib/editor/ does not exist
 *   PROP-FEED-S5-017 — createBlockEditorAdapter wire mapping
 *   PROP-FEED-S5-021 — editingSessionChannel INBOUND only
 *
 * RED PHASE: editingSessionChannel.ts and createBlockEditorAdapter.ts do not exist
 * yet, so PROP-FEED-S5-003 / S5-012 / S5-017 / S5-021 are expected to FAIL.
 */

import { describe, test, expect } from 'bun:test';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dir, '../../../..');
const AUDIT_SCRIPT = path.join(PROJECT_ROOT, 'scripts/sprint-5-grep-audit.sh');

function runAudit(): { exitCode: number; output: string } {
  try {
    const output = execSync(`bash ${AUDIT_SCRIPT}`, { encoding: 'utf-8' });
    return { exitCode: 0, output };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    const stdout = err.stdout?.toString('utf-8') ?? '';
    const stderr = err.stderr?.toString('utf-8') ?? '';
    return { exitCode: err.status ?? 1, output: stdout + stderr };
  }
}

describe('Sprint 5 gates: grep + filesystem audit', () => {
  test('PROP-FEED-S5-001..021 (audit script exit 0)', () => {
    const { exitCode, output } = runAudit();
    if (exitCode !== 0) {
      console.error(output);
    }
    expect(exitCode).toBe(0);
  });

  test('PROP-FEED-S5-001: +page.svelte has no forbidden identifiers', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-001/);
  });

  test('PROP-FEED-S5-002 (grep): +page.svelte declares height: 100vh', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-002 \(grep\)/);
  });

  test('PROP-FEED-S5-003: editing_session_state_changed listener exactly 1 in editingSessionChannel.ts', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-003/);
  });

  test('PROP-FEED-S5-004: no editorStateChannel reference in production code', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-004/);
  });

  test('PROP-FEED-S5-012: editingSessionChannel handler is async-free', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-012/);
  });

  test('PROP-FEED-S5-013: sprint-4-baseline emit lines unchanged', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-013/);
  });

  test('PROP-FEED-S5-014: no EditorPane forbidden identifiers in production', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-014/);
  });

  test('PROP-FEED-S5-015: src/lib/editor/ does not exist', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-015/);
  });

  test('PROP-FEED-S5-017: createBlockEditorAdapter wire mapping (16 invokes + command set + issuedAt)', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-017/);
  });

  test('PROP-FEED-S5-021: editingSessionChannel.ts is INBOUND only', () => {
    const { output } = runAudit();
    expect(output).toMatch(/\[PASS\] PROP-FEED-S5-021/);
  });
});
