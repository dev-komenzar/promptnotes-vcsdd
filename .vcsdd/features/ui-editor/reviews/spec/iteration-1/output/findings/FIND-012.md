---
id: FIND-012
severity: major
dimension: verification_readiness
targets: ["verification-architecture.md §2 debounceSchedule.ts row", "verification-architecture.md PROP-EDIT-003", "behavioral-spec.md §3.2 REQ-EDIT-004"]
---

## Observation

`verification-architecture.md §2` line 30 declares `debounceSchedule.ts` exports `shouldFireIdleSave(editTimestamps: readonly number[], lastSaveTimestamp: number, debounceMs: number, nowMs: number): boolean` — i.e., a stateless query model. PROP-EDIT-003 (line 113) tests this query.

But `behavioral-spec.md §3.2 REQ-EDIT-004` (line 99) describes a stateful `setTimeout` schedule: "the system shall (re)start a debounce timer of exactly `IDLE_SAVE_DEBOUNCE_MS` milliseconds. If no further `EditNoteBody` dispatch occurs before the timer fires, the system shall fire `TriggerIdleSave`...". The actual fire mechanism is `setTimeout` in the impure shell.

There is no spec linking the two. Specifically:
- How does the impure shell consult `shouldFireIdleSave`? Each tick? Each input event? Each `setTimeout` callback?
- `nowMs` is a parameter of the pure function, but the shell's `setTimeout` callback fires at an OS-driven moment. Who supplies `nowMs`? `Date.now()`? A clock port?
- `editTimestamps: readonly number[]` — does the pure model require the shell to retain the entire history of edits? Or only the last? §3 Tier 1 (line 62) says "boundary inputs (exactly at debounce threshold, one millisecond before, one after)" — suggesting last-edit-only. The signature suggests array.

PROP-EDIT-004 (line 114) similarly references "last-blur timestamp `tb`" without explaining where that timestamp comes from.

## Why it fails

The pure schedule model is decoupled from the impure shell with no contract describing how they connect. A Phase 2 implementation could (a) drop the pure model entirely and use raw `setTimeout`/`clearTimeout`, satisfying all integration tests but not the property tests; or (b) keep the pure model and forward through it, satisfying property tests but at runtime cost. Strict mode requires the bridge contract to be stated.

## Concrete remediation

In `verification-architecture.md §2`, add a bullet under `debounceSchedule.ts`:
> The shell pattern: on each `EditNoteBody` action, the shell calls `cancelIdleSave(handle)` (if any) and `scheduleIdleSave(nextFireAt(lastEditTimestamp, IDLE_SAVE_DEBOUNCE_MS) - clock.now(), callback)`. The shell stores only `lastEditTimestamp` (a single `$state` number), not the full edit history. `editTimestamps` parameter accepts a sequence ONLY for property-test enumeration; the runtime caller supplies a 1-element array.

Then either simplify `shouldFireIdleSave` to accept a single `lastEditTimestamp: number` (matching the actual shell usage), or add a second pure helper `lastEditOnly(editTimestamps): number` so the property test still has a coherent surface. Update PROP-EDIT-003 and PROP-EDIT-004 statements accordingly.
