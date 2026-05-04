# FIND-001: Closed EditorAction enumeration omits NoteBodyEdited / SaveSuccess / SaveFailed but pass thresholds still test them

**Severity**: major
**Category**: requirement_mismatch
**Dimension**: spec_fidelity
**Location**: `.vcsdd/features/ui-editor/contracts/sprint-1.md` lines 86-99 (§2 EditorAction variant table), lines 10, 40, 45, 109-110, 161, 167, 168 (CRIT pass thresholds and editorReducer description that reference the missing kinds)

## Issue

The iter-1 remediation of FIND-003 added a closed enumeration of the `EditorAction` variant set in §2 lines 88-99. The contract claims this union is **closed** at line 86:

> "The `EditorAction` discriminated union is **closed** — the reducer must be **total** over the cross-product `EditorAction.kind × EditingSessionStatus`. The exhaustive switch is enforced at compile time by `tsc --strict --noUncheckedIndexedAccess` (CRIT-010)."

The 9 enumerated variant kinds are: `'EditNoteBody'`, `'BlurEvent'`, `'IdleTimerFired'`, `'DomainSnapshotReceived'`, `'RetryClicked'`, `'DiscardClicked'`, `'CancelClicked'`, `'CopyClicked'`, `'NewNoteClicked'`.

However, the rest of the contract continues to reference action kinds that are **not in this closed enumeration**:

1. **CRIT-001 frontmatter passThreshold (line 10)**:
   > "editorReducer.test.ts SaveSuccess/SaveFailed/NoteBodyEdited assertions pass 100%"

   `SaveSuccess`, `SaveFailed`, and `NoteBodyEdited` are not in the §2 enumeration. The §2 table lists `'EditNoteBody'` (imperative) — not `'NoteBodyEdited'` (past-tense). `SaveSuccess` and `SaveFailed` are completely absent.

2. **CRIT-007 frontmatter passThreshold (line 40)**:
   > "isDirty transition table assertions (editing+NoteBodyEdited→true, saving+NoteFileSaved→false, saving+NoteSaveFailed→true retained) pass 100%"

   `NoteBodyEdited`, `NoteFileSaved`, and `NoteSaveFailed` are referenced as action kinds the reducer must handle. None appear in the enumeration.

3. **CRIT-008 frontmatter description (line 45)**:
   > "after SaveSuccess, editorReducer emits {kind:'cancel-idle-timer'} in commands"

   `SaveSuccess` is not an enumerated `EditorAction.kind`.

4. **§2 editorReducer description (lines 109-110)**:
   > "isDirty transitions: editing + NoteBodyEdited → isDirty=true; saving + NoteFileSaved → isDirty=false; saving + NoteSaveFailed → isDirty=true retained ... commands for SaveSuccess must include {kind:'cancel-idle-timer'}"

   These are the contract's own canonical transition rules — referencing actions not enumerated.

5. **§5 Pass Criteria table (lines 161, 167, 168)**: same `SaveSuccess`/`SaveFailed`/`NoteBodyEdited` references in the binary pass thresholds for CRIT-001, CRIT-007, and CRIT-008.

## Cross-check against behavioral-spec.md

The behavioral spec uses the past-tense event-style names consistently:

- `behavioral-spec.md §3.1 line 62`: "via the pure `editorReducer` processing a `NoteBodyEdited` action"
- `behavioral-spec.md §3.1 line 70`: "`isDirty` is `true` after the `NoteBodyEdited` action is processed by `editorReducer`"
- `behavioral-spec.md §3.1 line 77`: "the pure `editorReducer` processes a `SaveSuccess` action"
- `behavioral-spec.md §3.1 line 80`: "`EditorViewState.isDirty === false` after `SaveSuccess` is processed"
- `behavioral-spec.md §3.1 line 82`: "`EditorViewState.isDirty` remains `true` when `SaveFailed` action is processed"
- `behavioral-spec.md §3.4a line 230`: "The `editorReducer` also handles locally-observed action shapes (e.g., `NoteBodyEdited` for optimistic `isDirty=true`)"

The spec is unambiguous: the action kinds are `NoteBodyEdited`, `SaveSuccess`, `SaveFailed`. The contract's table renames the input-text action to `'EditNoteBody'` and entirely omits the save-result actions.

## Why this is incoherent (not just cosmetic)

Either:
- (a) The `EditorAction` union is genuinely closed at the 9 enumerated variants. Then the binary pass thresholds at CRIT-001/CRIT-007/CRIT-008 are **unsatisfiable**: a test cannot construct an action with `kind === 'SaveSuccess'` (or `'SaveFailed'` or `'NoteBodyEdited'`) because such variants do not exist in the union the reducer accepts. `tsc --strict` would reject the test. The contract's binary criteria therefore cannot be evaluated.
- (b) The enumeration is incomplete and the union is not actually closed. Then CRIT-007's reducer-totality property test (and the iter-1 FIND-003 remediation that motivated the closure) is unsound: the property covers only 9 variants while the actual production union has more, leaving variants untested.

Either reading yields a contract that does not bind a buildable, testable, gradable specification. CRIT-010's `tsc --noEmit --strict --noUncheckedIndexedAccess` exit-0 requirement deepens the incoherence: the compiler will refuse to type-check tests that pattern-match on missing variants, blocking Phase 2 Red even if the Builder writes the asserted tests.

## Cross-check against IdleTimerFired

The §2 table includes `'IdleTimerFired'` with payload `{ nowMs: number }` and origin "Impure shell signal". This is a fine addition — but it does not stand in for `SaveSuccess`/`SaveFailed`. `IdleTimerFired` is dispatched by the timer shell to ask the reducer "should I fire a save command now?", whereas `SaveSuccess` and `SaveFailed` arrive after the Tauri save round-trip completes. They are distinct event sources and distinct reducer-input contracts; the spec treats them as distinct (see §3.1 line 75-82 and §3.4a line 224-237).

The reducer cannot derive `isDirty === false` after a successful save without an action representing that fact. `DomainSnapshotReceived { snapshot }` mirrors the snapshot fields but does not, by itself, satisfy the binary pass thresholds at CRIT-001 (which assert specific `SaveSuccess` and `SaveFailed` action handling) or at CRIT-008 (which asserts a `{kind:'cancel-idle-timer'}` command on `SaveSuccess`).

## Required Remediation

Pick one path and apply it consistently across §2, §5, and CRIT-001/007/008:

1. **Extend the enumeration** to add the missing action kinds — at minimum `'NoteBodyEdited'` (replacing or in addition to `'EditNoteBody'`), `'SaveSuccess'`, `'SaveFailed'` — with payloads (e.g., `'SaveFailed'` carrying the `SaveError` payload required for `bannerMessageFor`). Re-state the closure claim against the larger set.

2. **Or rewrite the pass thresholds** to express the same intent purely in terms of the 9 enumerated kinds: e.g., CRIT-008 must be re-expressed in terms of a `'DomainSnapshotReceived'` snapshot whose `status` transitions from `saving` to `editing` with `isDirty=false`, and the reducer's response to that snapshot is asserted to include `{kind:'cancel-idle-timer'}`. Same for CRIT-001's `isDirty` transitions.

Until one of these paths lands, CRIT-001, CRIT-007, and CRIT-008 carry binary pass thresholds that are either unsatisfiable (path-a closure honored) or unsound (closure not actually closed), and the iter-1 FIND-003 remediation has not converged.
