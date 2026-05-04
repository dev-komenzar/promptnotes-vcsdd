# Phase 1c Spec Re-Review — Findings (iter-2)

Feature: `ui-feed-list-actions`
Reviewer: vcsdd-adversary (fresh context, strict mode, iter-2)
Date: 2026-05-04

Summary: 5 new findings (high=1, medium=3, low=1). Overall **FAIL**.

Iter-1 findings: 15/16 resolved, 1 partial (FIND-SPEC-12 → re-emerged as FIND-SPEC-2-02).

---

## High Severity (1)

### FIND-SPEC-2-01 — `FeedDomainSnapshot` type referenced but never defined
- Severity: **high**
- Dimensions: 明確さ, 検証可能性
- Targets: `FeedAction.DomainSnapshotReceived`, PROP-FEED-007a/b/d
- Evidence:
  - `verification-architecture.md:355`: `| { kind: 'DomainSnapshotReceived'; snapshot: FeedDomainSnapshot }` declares the field type.
  - `verification-architecture.md:86,87,89`: PROP-FEED-007a/b/d reduce against `S.{status, currentNoteId, pendingNextNoteId, visibleNoteIds, activeDeleteModalNoteId}` — implies a structural shape.
  - No `type FeedDomainSnapshot = …` definition anywhere in the file.
- Problem: Phase 2 implementer cannot write the reducer signature. fast-check has no arbitrary to drive PROP-FEED-007a/b/d. The snapshot must compose `EditingSessionState` (Capture) + `Feed` projection (Curate); structural decision is unmade.
- Recommended fix: Add explicit type to §9b composing both aggregates AND a `cause` discriminator naming the upstream event:
  ```typescript
  type FeedDomainSnapshot = {
    readonly editing: { status; currentNoteId; pendingNextNoteId };
    readonly feed:    { visibleNoteIds; filterApplied };
    readonly delete:  { activeDeleteModalNoteId; lastDeletionError };
    readonly cause:
      | { kind: 'NoteFileSaved';      savedNoteId: string }
      | { kind: 'NoteFileDeleted';    deletedNoteId: string }
      | { kind: 'NoteDeletionFailed'; failedNoteId: string }
      | { kind: 'EditingStateChanged' }
      | { kind: 'InitialLoad' };
  };
  ```

---

## Medium Severity (3)

### FIND-SPEC-2-02 — PROP-FEED-035 "iff" wording is contradictory and incompatible with REQ-FEED-017
- Severity: medium
- Dimensions: 検証可能性, 整合性
- Targets: PROP-FEED-035, REQ-FEED-017, §9b 排出条件
- Evidence:
  - `verification-architecture.md:165`: `'refresh-feed' iff action.kind ∈ {'DomainSnapshotReceived'} かつ新規 noteId が visibleNoteIds に含まれる更新。フィルタ更新 (FilterApplied, FilterCleared) でも { kind: 'refresh-feed' } を emit する。`
  - `verification-architecture.md:382-384`: §9b lists same disjunction.
  - `behavioral-spec.md:330` (REQ-FEED-017): refresh required on `NoteFileSaved` (does not add new noteId).
- Problem: Two-sided iff cannot also have an "additionally" appendix. The `NoteFileSaved` case is excluded by "新規 noteId が visibleNoteIds に含まれる更新", contradicting REQ-FEED-017. Property is not encodable.
- Recommended fix: Restate as a non-iff biconditional:
  > `'refresh-feed' ∈ commands` ⇔ `action.kind ∈ {'FilterApplied','FilterCleared'}` OR (`action.kind === 'DomainSnapshotReceived'` AND `action.snapshot.cause.kind ∈ {'NoteFileSaved','NoteFileDeleted'}`).

### FIND-SPEC-2-03 — PROP-FEED-007d cannot detect "delete-success" without a cause discriminator
- Severity: medium
- Dimensions: 検証可能性
- Targets: PROP-FEED-007d, REQ-FEED-014
- Evidence:
  - `verification-architecture.md:89`: "snapshot が `NoteFileDeleted` トリガー (削除成功) のとき, `lastDeletionError === null`".
  - `verification-architecture.md:355`: `snapshot: FeedDomainSnapshot` — no field discriminates the upstream event.
- Problem: Reducer has no observable signal to distinguish a delete-success snapshot from a save-success snapshot. Property is unverifiable.
- Recommended fix: After FIND-SPEC-2-01 adds `cause`, restate PROP-FEED-007d:
  > If `action = { kind: 'DomainSnapshotReceived', snapshot: S }` and `S.cause.kind === 'NoteFileDeleted'`, then `feedReducer(s, action).state.lastDeletionError === null`.

### FIND-SPEC-2-04 — PROP-FEED-013 omits the `loadingStatus !== 'ready'` precondition
- Severity: medium
- Dimensions: 明確さ, 整合性
- Targets: PROP-FEED-013, REQ-FEED-006
- Evidence:
  - `behavioral-spec.md:132` (REQ-FEED-006 EARS): `editingStatus ∈ {'saving','switching'}` **OR** `loadingStatus !== 'ready'`.
  - `verification-architecture.md:143`: PROP-FEED-013 only mentions `editingStatus ∈ {'saving','switching'}` 時は 0 回 — no `loadingStatus` clause.
- Problem: An implementation that dispatches while `loadingStatus === 'loading'` passes PROP-FEED-013 but violates REQ-FEED-006. Integration property is weaker than the requirement.
- Recommended fix: Extend acceptance to: "0 回 when `editingStatus ∈ {'saving','switching'}` OR `loadingStatus !== 'ready'`".

---

## Low Severity (1)

### FIND-SPEC-2-05 — `NoteDeletionFailed.detail` propagation is silently dropped at the UI layer
- Severity: low
- Dimensions: 整合性
- Targets: REQ-FEED-014 banner messaging table
- Evidence:
  - `behavioral-spec.md:278-283`: banner table uses only `'permission'/'lock'/'unknown'`; `'unknown'` → "削除に失敗しました" with no diagnostic suffix.
  - `.vcsdd/features/delete-note/specs/behavioral-spec.md:413`: REQ-DLN-013 maps `disk-full → 'unknown'` BUT propagates `detail = 'disk-full'`.
  - `delete-note REQ-DLN-004` propagates `detail` for unknown errors as well.
- Problem: UI throws away diagnostic detail. Disk-full surfaces as a generic "削除に失敗しました" with no hint. Contract gap with `delete-note`.
- Recommended fix: Either append `detail` to the banner ("削除に失敗しました（{detail}）" when `detail !== undefined`), or explicitly state in REQ-FEED-014 that `detail` is intentionally suppressed with cross-ref to REQ-DLN-013.

---

## Iter-1 → Iter-2 Resolution Status

| ID | Iter-1 Sev | Status |
|----|-----------|--------|
| FIND-SPEC-01 | high | 解決済み |
| FIND-SPEC-02 | high | 解決済み |
| FIND-SPEC-03 | high | 解決済み |
| FIND-SPEC-04 | high | 解決済み |
| FIND-SPEC-05 | high | 解決済み |
| FIND-SPEC-06 | medium | 解決済み |
| FIND-SPEC-07 | medium | 解決済み |
| FIND-SPEC-08 | medium | 解決済み |
| FIND-SPEC-09 | medium | 解決済み |
| FIND-SPEC-10 | medium | 解決済み |
| FIND-SPEC-11 | medium | 解決済み |
| FIND-SPEC-12 | medium | 部分的（FIND-SPEC-2-02 として再発） |
| FIND-SPEC-13 | low | 解決済み |
| FIND-SPEC-14 | low | 解決済み |
| FIND-SPEC-15 | low | 解決済み |
| FIND-SPEC-16 | low | 解決済み |

---

## Routing recommendation

All 5 findings cluster in `verification-architecture.md` §4 and §9b. FIND-SPEC-2-05 is the only behavioral-spec edit (one line). Route back to **Phase 1b**.
