/**
 * PROP-005: Failure path I/O budget.
 *   clipboardWrite = 1, clockNow = 0, emitInternal = 0.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { copyBody, type CopyBodyPorts } from "$lib/domain/copy-body/pipeline";
import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import { arbStateAndNote } from "./_arbitraries";

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);

const fsErrors: FsError[] = [
  { kind: "permission" },
  { kind: "disk-full" },
  { kind: "lock" },
  { kind: "not-found" },
  { kind: "unknown", detail: "x" },
];

function arbFsError(): fc.Arbitrary<FsError> {
  return fc.constantFrom(...fsErrors);
}

describe("PROP-005: failure-path I/O budget", () => {
  test("∀ (state, note, fsError): clipboardWrite=1, clockNow=0, emitInternal=0", () => {
    fc.assert(
      fc.property(arbStateAndNote(), arbFsError(), ({ state, note }, fsError) => {
        let clipboardCalls = 0;
        let clockCalls = 0;
        let internalCalls = 0;

        const ports: CopyBodyPorts = {
          clockNow: () => {
            clockCalls += 1;
            return ts(0);
          },
          clipboardWrite: (_text: string): Result<void, FsError> => {
            clipboardCalls += 1;
            return { ok: false, error: fsError };
          },
          getCurrentNote: () => note,
          bodyForClipboard: (n: Note) => n.body as unknown as string,
          emitInternal: () => {
            internalCalls += 1;
          },
        };

        const result = copyBody(ports)(state);
        expect(result.ok).toBe(false);

        return clipboardCalls === 1 && clockCalls === 0 && internalCalls === 0;
      }),
      { numRuns: 200, seed: 2 },
    );
  });
});
