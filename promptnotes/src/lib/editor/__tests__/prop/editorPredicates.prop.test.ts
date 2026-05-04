/**
 * editorPredicates.prop.test.ts — Tier 2 property tests (bun:test + fast-check)
 *
 * Coverage: PROP-EDIT-005 (banner exhaustiveness), PROP-EDIT-006 (canCopy parity)
 * REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006, REQ-EDIT-015, REQ-EDIT-016
 *
 * RED PHASE: stubs throw — all fc.assert calls will produce FAIL.
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import type { SaveError, FsError, SaveValidationError } from '$lib/editor/types';
import {
  canCopy,
  isEmptyAfterTrim,
  bannerMessageFor,
} from '$lib/editor/editorPredicates';

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** All 5 EditingSessionStatus values as a constant pool. */
const arbStatus = fc.constantFrom(
  'idle' as const,
  'editing' as const,
  'saving' as const,
  'switching' as const,
  'save-failed' as const
);

/** Arbitrary body string (unicode allowed, may be empty). */
const arbBody = fc.string();

/** FsError variants exhaustively. */
const arbFsReason = fc.constantFrom<FsError>(
  { kind: 'permission' },
  { kind: 'disk-full' },
  { kind: 'lock' },
  { kind: 'unknown' }
);

/** SaveValidationError variants exhaustively. */
const arbValidationReason = fc.constantFrom<SaveValidationError>(
  { kind: 'invariant-violated' },
  { kind: 'empty-body-on-idle' }
);

/** fs SaveError with any FsError reason. */
const arbFsError: fc.Arbitrary<SaveError> = arbFsReason.map(reason => ({
  kind: 'fs' as const,
  reason,
}));

/** validation SaveError with any SaveValidationError reason. */
const arbValidationError: fc.Arbitrary<SaveError> = arbValidationReason.map(reason => ({
  kind: 'validation' as const,
  reason,
}));

/** Any SaveError variant. */
const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(arbFsError, arbValidationError);

// ── PROP-EDIT-005: Banner exhaustiveness ──────────────────────────────────────

describe('PROP-EDIT-005 (fast-check): bannerMessageFor exhaustiveness and totality', () => {
  test('PROP-EDIT-005a: bannerMessageFor(fs error) returns non-empty string for all FsError variants (≥200 runs)', () => {
    fc.assert(
      fc.property(arbFsError, (error) => {
        const result = bannerMessageFor(error);
        return typeof result === 'string' && result.length > 0;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-005b: bannerMessageFor(validation error) returns null for all SaveValidationError variants (≥200 runs)', () => {
    fc.assert(
      fc.property(arbValidationError, (error) => {
        const result = bannerMessageFor(error);
        return result === null;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-005c: bannerMessageFor never returns undefined for any SaveError (≥200 runs)', () => {
    fc.assert(
      fc.property(arbSaveError, (error) => {
        const result = bannerMessageFor(error);
        return result !== undefined;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-005d: bannerMessageFor never throws for any SaveError (≥200 runs)', () => {
    fc.assert(
      fc.property(arbSaveError, (error) => {
        let threw = false;
        try {
          bannerMessageFor(error);
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 200 }
    );
  });
});

// ── PROP-EDIT-006: canCopy parity ─────────────────────────────────────────────

describe('PROP-EDIT-006 (fast-check): canCopy copy-enable parity', () => {
  test('PROP-EDIT-006a: canCopy is false for idle regardless of body (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, (body) => {
        return canCopy(body, 'idle') === false;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-006b: canCopy is false for switching regardless of body (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, (body) => {
        return canCopy(body, 'switching') === false;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-006c: canCopy is false for save-failed regardless of body (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, (body) => {
        return canCopy(body, 'save-failed') === false;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-006d: canCopy for editing equals !isEmptyAfterTrim(body) (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, (body) => {
        return canCopy(body, 'editing') === !isEmptyAfterTrim(body);
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-006e: canCopy for saving equals !isEmptyAfterTrim(body) (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, (body) => {
        return canCopy(body, 'saving') === !isEmptyAfterTrim(body);
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-EDIT-006f: canCopy result is always boolean (never undefined/null) for any status and body (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, arbStatus, (body, status) => {
        const result = canCopy(body, status);
        return typeof result === 'boolean';
      }),
      { numRuns: 200 }
    );
  });
});
