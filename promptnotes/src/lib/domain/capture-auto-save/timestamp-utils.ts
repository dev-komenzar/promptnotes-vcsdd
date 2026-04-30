// capture-auto-save/timestamp-utils.ts
// Utility to work with opaque Timestamp branded type.
// This module is the single point where the internal representation is accessed.

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";

/**
 * Extract epoch millis from an opaque Timestamp.
 * This is the only location in the capture-auto-save module that
 * accesses the internal structure of Timestamp.
 */
export function toEpochMillis(ts: Timestamp): number {
  return (ts as unknown as { epochMillis: number }).epochMillis;
}

/** Compare two timestamps. Returns true if a < b. */
export function isBefore(a: Timestamp, b: Timestamp): boolean {
  return toEpochMillis(a) < toEpochMillis(b);
}
