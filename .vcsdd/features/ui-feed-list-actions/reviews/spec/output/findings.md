# Phase 1c Spec Review — Findings

Feature: `ui-feed-list-actions`
Reviewer: vcsdd-adversary (fresh context, strict mode)
Date: 2026-05-04

Summary: 16 findings (high=5, medium=7, low=4). Overall **FAIL**.

---

## High Severity (5)

### FIND-SPEC-01 — `FeedViewState.status` field overloaded
- Severity: **high**
- Dimensions: 明確さ, 検証可能性
- Targets: REQ-FEED-006, REQ-FEED-008, FeedViewState type definition
- Evidence:
  - `behavioral-spec.md:130` writes `EditingSessionState.status ∈ {'saving','switching'}` (editing state).
  - `behavioral-spec.md:159,166` writes `FeedViewState.status === 'loading'` (loading state).
  - `verification-architecture.md:321-329` defines `FeedViewState` with `editingStatus` and `loadingStatus` and **no top-level `status`**.
- Problem: tests cannot assert against `FeedViewState.status` because the field does not exist.
- Recommended fix: rename every `FeedViewState.status` reference in behavioral-spec to the precise field (`editingStatus` or `loadingStatus`). REQ-FEED-006 line 137 must use `editingStatus`.

### FIND-SPEC-02 — `FeedAction` discriminated union undefined
- Severity: **high**
- Dimensions: 明確さ, 検証可能性
- Targets: PROP-FEED-007, REQ-FEED-017, §10 of verification-architecture
- Evidence:
  - `verification-architecture.md:40,82` references `FeedAction` and `FeedAction.kind === 'DomainSnapshotReceived'`.
  - `behavioral-spec.md:330` references `feedReducer` receiving a `NoteFileSaved` action.
  - §10 only defines `FeedCommand` and `FeedViewState`; no `FeedAction` enumeration exists.
- Problem: bridge from public domain events to reducer action kinds is unspecified. Tier 0 exhaustive switch on `FeedAction` is impossible.
- Recommended fix: add §10b enumerating the full `FeedAction` discriminated union (mirror `EditorAction` pattern from ui-editor). Reconcile every REQ EARS clause to a kind.

### FIND-SPEC-03 — PROP-FEED-019 ID collision
- Severity: **high**
- Dimensions: 検証可能性, 整合性
- Targets: PROP-FEED-019
- Evidence:
  - `verification-architecture.md:139` defines PROP-FEED-019 = DeletionFailureBanner DOM integration test.
  - `verification-architecture.md:210` (§5 Tooling Map) labels "(PROP-FEED-019)" to the IPC boundary grep audit (different obligation).
  - §6 coverage matrix only resolves one usage.
- Problem: tooling consuming the IDs sees inconsistent definitions.
- Recommended fix: re-number the IPC boundary audit (e.g., PROP-FEED-032), add it to §4 proof-obligation table and §6 coverage matrix.

### FIND-SPEC-04 — REQ-FEED-014 contradicts `delete-note` REQ-DLN-005 on `'not-found'`
- Severity: **high**
- Dimensions: 整合性
- Targets: REQ-FEED-014, PROP-FEED-008, EC-FEED-010
- Evidence:
  - `behavioral-spec.md:269-275,292`: maps `'not-found'` to "graceful — no banner". PROP-FEED-008 asserts `deletionErrorMessage('not-found') === null`.
  - `.vcsdd/features/delete-note/specs/behavioral-spec.md:455-458` (REQ-DLN-005): on `fs.not-found`, `NoteDeletionFailed` is **not emitted** at all — only `NoteFileDeleted`. The UI never receives `'not-found'` over the wire.
- Problem: UI contract prescribes behaviour for an impossible input — dead code that misleads maintainers about upstream invariant.
- Recommended fix: drop `'not-found'` from UI-side `NoteDeletionFailureReason` (preferred — type system enforces "cannot occur"), or keep defensive arm with explicit cross-reference to REQ-DLN-005 and remove EC-FEED-010 from user-observable edge case list.

### FIND-SPEC-05 — `timestampLabel` claimed pure but uses `new Date(...)`
- Severity: **high**
- Dimensions: purity boundary
- Targets: `timestampLabel`, NFR-FEED-005, PROP-FEED-031, canonical purity-audit grep
- Evidence:
  - `verification-architecture.md:39`: signature for `timestampLabel(epochMs: number): string` says "`new Date(epochMs).toLocaleString()` は pure とみなしグレーゾーン".
  - `verification-architecture.md:26`: canonical purity-audit grep pattern explicitly contains `Date\(|new Date`.
  - `behavioral-spec.md:392` (NFR-FEED-005) + PROP-FEED-031 require **zero** purity-grep hits on `feedRowPredicates.ts`.
- Problem: spec is internally self-contradictory — implementation will either fail the purity audit or pass only by tightening the grep pattern.
- Recommended fix: either (a) move `timestampLabel` to the effectful shell; or (b) tighten the canonical grep pattern (e.g., `\bnew Date\b|\bDate\.now\b`) and pin `timestampLabel` to a pattern that does not match. Update both spec and PROP simultaneously.

---

## Medium Severity (7)

### FIND-SPEC-06 — PROP-FEED-001 symmetry mistyped
- Severity: medium
- Dimensions: 検証可能性
- Targets: PROP-FEED-001, `isEditingNote`
- Evidence:
  - `verification-architecture.md:76`: claims `isEditingNote(a, b) === isEditingNote(b, a)` over `[string, string]`.
  - `verification-architecture.md:39`: signature is `isEditingNote(rowNoteId: string, editingNoteId: string | null)` — asymmetric.
- Problem: calling `isEditingNote(b, a)` where `a: string|null` does not type-check. Symmetry is only defined on the non-null subdomain, and even there the property is trivially equality-of-strings.
- Recommended fix: drop symmetry. Replace with substantive property `isEditingNote(x, null) === false ∀x` (which actually establishes safety guarantee already ascribed to PROP-FEED-002).

### FIND-SPEC-07 — PROP-FEED-007 only mirrors 3 of 7 FeedViewState fields
- Severity: medium
- Dimensions: 検証可能性
- Targets: PROP-FEED-007, FeedViewState
- Evidence:
  - `verification-architecture.md:82`: PROP-FEED-007 covers `editingStatus`, `editingNoteId`, `pendingNextNoteId` only.
  - `verification-architecture.md:321-329`: FeedViewState additionally has `visibleNoteIds`, `loadingStatus`, `activeDeleteModalNoteId`, `lastDeletionError`.
  - REQ-FEED-007 (empty state, `visibleNoteIds`), REQ-FEED-008 (`loadingStatus`), REQ-FEED-011/012 (`activeDeleteModalNoteId`), REQ-FEED-014 (`lastDeletionError`) all depend on un-proven mirroring.
- Recommended fix: extend PROP-FEED-007 (or split into PROP-FEED-007a..d) covering each remaining field. Specify which FeedAction kind drives each transition. Add property: `lastDeletionError` resets on `NoteFileDeleted`.

### FIND-SPEC-08 — REQ-FEED-001 / REQ-FEED-003 lack pure proofs
- Severity: medium
- Dimensions: 検証可能性
- Targets: REQ-FEED-001, REQ-FEED-003, §6 coverage matrix
- Evidence:
  - `verification-architecture.md:219`: coverage matrix maps REQ-FEED-001 to PROP-FEED-001, but PROP-FEED-001 is `isEditingNote` symmetry — completely unrelated to timestamp rendering.
  - `verification-architecture.md:221`: REQ-FEED-003 maps only to PROP-FEED-027 (a colour grep). No pure proof of tag iteration / order preservation.
- Recommended fix: add PROPs for `timestampLabel` determinism (idempotency over equal `epochMs`) and tag iteration (length and order preservation). Update §6 coverage matrix.

### FIND-SPEC-09 — PROP-FEED-012 conflates layers on `disk-full`
- Severity: medium
- Dimensions: 整合性
- Targets: PROP-FEED-012, NoteDeletionFailureReason
- Evidence:
  - `verification-architecture.md:132`: PROP-FEED-012 demands a UI-side exhaustive switch over `NoteDeletionFailureReason` that "`disk-full` 正規化を含む".
  - `.vcsdd/features/delete-note/specs/behavioral-spec.md:413` (REQ-DLN-013): `disk-full` is normalized to `'unknown'` by Curate orchestrator before `NoteDeletionFailed` is emitted. UI-side `NoteDeletionFailureReason` does not contain `disk-full`.
- Problem: adding `disk-full` arm to UI switch would be unreachable code TS would flag.
- Recommended fix: restate PROP-FEED-012 as: "`NoteDeletionFailureReason` exhaustive switch covers exactly `'permission' | 'lock' | 'not-found' | 'unknown'` and produces a compile error on any added variant" — drop `disk-full` mention.

### FIND-SPEC-10 — pending-switch indicator gating ignores `switching`
- Severity: medium
- Dimensions: 整合性
- Targets: REQ-FEED-009, PROP-FEED-023
- Evidence:
  - `behavioral-spec.md:173`: EARS gates indicator on `status === 'save-failed'` only.
  - `docs/domain/aggregates.md:277-279`: `pendingNextNoteId` is set throughout the entire `switching` window (`editing → switching` on `SelectPastNote(N)` sets `pendingNextNoteId=N` until `NoteFileSaved`).
  - `docs/domain/ui-fields.md:250` (UI 状態 table): `switching` row shows "切替予告".
- Recommended fix: broaden REQ-FEED-009 EARS to `status ∈ {'switching', 'save-failed'}` (or "any state where `pendingNextNoteId !== null`"); update PROP-FEED-023 accordingly.

### FIND-SPEC-11 — REQ-FEED-005 EARS contradicts its own edge case
- Severity: medium
- Dimensions: 明確さ
- Targets: REQ-FEED-005, REQ-FEED-006
- Evidence:
  - `behavioral-spec.md:111`: unconditional EARS — "WHEN ユーザーがフィード行をクリックする THEN ... `SelectPastNote` を発行".
  - `behavioral-spec.md:117-118`: edge case — "`status === 'switching' / 'saving'` の場合: ... コマンドを発行しない".
- Problem: implementer reading only EARS will dispatch unconditionally. Burying negative rule in edge case bullet is anti-pattern.
- Recommended fix: rewrite EARS as "WHEN ユーザーがフィード行をクリックする AND `editingStatus ∉ {'saving','switching'}` AND `loadingStatus === 'ready'` THEN ...". Either fold REQ-FEED-006 into REQ-FEED-005 as refinement or keep as separate negative-precondition requirement explicitly cross-referenced from REQ-FEED-005.

### FIND-SPEC-12 — `'refresh-feed'` command emission rule unbound
- Severity: medium
- Dimensions: 検証可能性
- Targets: REQ-FEED-017, REQ-FEED-018
- Evidence:
  - `behavioral-spec.md:330`: REQ-FEED-017 requires `'refresh-feed'` in `commands` when reducer receives `NoteFileSaved` — but no FeedAction kind is defined (FIND-SPEC-02).
  - REQ-FEED-018 (filter update) presumably also re-renders, but it is unclear whether it produces `'refresh-feed'`, a different command, or simply a state update.
- Recommended fix: enumerate exactly which FeedAction kinds emit `'refresh-feed'`. Add a property test asserting emission iff that set. Pin in §10.

---

## Low Severity (4)

### FIND-SPEC-13 — `timestampLabel` locale unspecified
- Severity: low
- Dimensions: 検証可能性
- Targets: `timestampLabel`
- Evidence:
  - `verification-architecture.md:39`: signature carries no locale parameter; prose mentions both `toLocaleString` (locale-default) and `Intl.DateTimeFormat`.
- Problem: output depends on OS / `LANG`; CI vs dev divergence; determinism property tests become flaky.
- Recommended fix: pin a fixed locale (`'ja-JP'` recommended) inside the function, or accept `locale: string` as second argument supplied from caller.

### FIND-SPEC-14 — Tag Pill `max-width` left to "実装定数"
- Severity: low
- Dimensions: 整合性, 検証可能性
- Targets: REQ-FEED-003, DESIGN.md §10
- Evidence:
  - `behavioral-spec.md:86`: "各 Pill は `max-width` 制限 + ellipsis (実装定数)".
  - DESIGN.md §10 token table does not enumerate a Pill max-width. PROP-FEED-027 only checks colour tokens.
- Recommended fix: nominate an explicit pixel value and add it to DESIGN.md §10 if reusable, or drop truncation requirement.

### FIND-SPEC-15 — `role="button"` permitted alongside `<button>`
- Severity: low
- Dimensions: 明確さ
- Targets: REQ-FEED-005, REQ-FEED-015
- Evidence:
  - `behavioral-spec.md:124`: acceptance allows either form.
- Problem: `role="button"` on `<div>` requires manual Enter+Space handling and frequently breaks Space-key activation. Pinning to `<button>` removes a class of a11y bugs.
- Recommended fix: replace "または" with "must use `<button>`" in REQ-FEED-005 and REQ-FEED-015.

### FIND-SPEC-16 — verification-architecture section ordering anomaly
- Severity: low
- Dimensions: 明確さ
- Targets: §1–§10
- Evidence:
  - `verification-architecture.md`: §1, §2, §3, §4, §5, §6, §7, §8, §10, §9 — §10 (`FeedCommand` / `FeedViewState`) appears before §9 (`Out-of-Scope`).
- Recommended fix: re-order or renumber sections so they appear monotonically.

---

## Routing recommendation

- **Phase 1b (verification-architecture)**: dominant fault domain
  - FIND-SPEC-02 (define `FeedAction`)
  - FIND-SPEC-03 (renumber PROP-FEED-019 collision)
  - FIND-SPEC-05 (resolve `timestampLabel` purity contradiction)
  - FIND-SPEC-06, FIND-SPEC-07, FIND-SPEC-08, FIND-SPEC-09, FIND-SPEC-12, FIND-SPEC-16
- **Phase 1a (behavioral-spec)**: smaller edits
  - FIND-SPEC-01 (rename `FeedViewState.status` → `editingStatus`/`loadingStatus`)
  - FIND-SPEC-04 (drop `'not-found'` reason or mark defensive)
  - FIND-SPEC-10 (broaden REQ-FEED-009 gating)
  - FIND-SPEC-11 (rewrite REQ-FEED-005 EARS preconditions)
  - FIND-SPEC-13, FIND-SPEC-14, FIND-SPEC-15
