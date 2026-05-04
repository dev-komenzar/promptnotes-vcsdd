---
id: FIND-024
severity: minor
dimension: verification_readiness
category: requirement_mismatch
targets:
  - "verification-architecture.md §2 debounceSchedule.ts row (line 42)"
  - "behavioral-spec.md §12 Debounce Contract (line 794)"
introduced_in: iteration-2
---

## Observation

The pure `computeNextFireAt` signature is documented in two places that disagree on whether `nowMs` is part of the parameter object.

`verification-architecture.md §2` (line 42):

> `computeNextFireAt({ lastEditAt: number, lastSaveAt: number, debounceMs: number, nowMs: number }): { shouldFire: boolean, fireAt: number | null }`. ... `nowMs` is supplied by the caller (never calls `Date.now()` internally).

`behavioral-spec.md §12 Debounce Contract` (line 794):

> `debounceSchedule.computeNextFireAt({ lastEditAt: number, lastSaveAt: number, debounceMs: number }): { shouldFire: boolean, fireAt: number | null }`
> - `shouldFire === true` iff `lastEditAt + debounceMs <= now` (where `now` is supplied by the caller) AND no save has occurred since the last edit.

The behavioral-spec parameter list omits `nowMs` from the destructured object, but the comment "(where `now` is supplied by the caller)" implies it must be a parameter. The verification-architecture entry includes `nowMs` explicitly. Phase 2 will read both files; the function signature is contradicted between them.

`shell pattern` in §12 line 805 reinforces the verification-architecture reading: "The shell computes `{ fireAt } = debounceSchedule.computeNextFireAt({ lastEditAt: now, lastSaveAt, debounceMs: IDLE_SAVE_DEBOUNCE_MS })`" — the call site passes `lastEditAt: now`, but `nowMs` is not destructured into the call-site object. The destructured field name `now` does not match either spec's parameter list.

## Why it fails

A pure function signature must be unambiguous. Strict mode requires a single, unique signature for any function referenced by both specs. Phase 2 currently has three plausible readings:

1. The function takes `{ lastEditAt, lastSaveAt, debounceMs, nowMs }` (verification-architecture).
2. The function takes `{ lastEditAt, lastSaveAt, debounceMs }` and `now` is some other source (behavioral-spec).
3. The function takes `{ lastEditAt, lastSaveAt, debounceMs }` and `lastEditAt` is the same as `now` (the §12 shell pattern at line 805 sets `lastEditAt: now`, suggesting fusion — but then how is the *threshold check* done?).

PROP-EDIT-003 (line 163) asserts: "for any sequence ... where the last element satisfies `lastEdit + debounceMs <= now`", and `computeNextFireAt returns { shouldFire: true, fireAt: tn + debounceMs }`. This implies `now` is a separate input. PROP-EDIT-004 has the same dependency.

The discrepancy is small but real, and writing the Red-phase test for PROP-EDIT-003 requires picking one signature.

## Concrete remediation

Update `behavioral-spec.md §12` (line 794) to match the verification-architecture entry:

```
debounceSchedule.computeNextFireAt({
  lastEditAt: number,
  lastSaveAt: number,
  debounceMs: number,
  nowMs: number
}): { shouldFire: boolean, fireAt: number | null }

- shouldFire === true iff lastEditAt + debounceMs <= nowMs AND no save has occurred since the last edit.
```

Then update the §12 shell pattern (line 805) to use the four-field object:

```
const { fireAt } = debounceSchedule.computeNextFireAt({
  lastEditAt,
  lastSaveAt,
  debounceMs: IDLE_SAVE_DEBOUNCE_MS,
  nowMs: clock.now()
});
```

`clock.now()` is the impure shell's clock (e.g., `Date.now()` wrapped). The reducer/predicate tier never calls it.

Also, while editing, mention the property-test signature `shouldFireIdleSave(editTimestamps, lastSaveTimestamp, debounceMs, nowMs)` (verification-architecture.md §2 line 42) explicitly in §12, since the behavioral-spec only describes `computeNextFireAt`. PROP-EDIT-003 references both functions; both must be enumerated in §12.
