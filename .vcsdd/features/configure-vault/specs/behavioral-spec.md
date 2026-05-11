---
coherence:
  node_id: "req:configure-vault"
  type: req
  name: "configure-vault 行動仕様"
  depends_on:
    - id: "design:workflows"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
    - id: "design:ui-fields"
      relation: derives_from
    - id: "governance:domain-events"
      relation: depends_on
  modules:
    - "configure-vault"
  source_files:
    - "promptnotes/src/lib/domain/configure-vault/pipeline.ts"
    - "promptnotes/src/lib/domain/configure-vault/validate-and-transition.ts"
    - "promptnotes/src/lib/domain/configure-vault/map-stat-dir-result.ts"
    - "promptnotes/src/lib/domain/configure-vault/map-settings-save-error.ts"
    - "promptnotes/src-tauri/src/lib.rs"
  conventions:
    - targets:
        - "file:promptnotes/src/lib/domain/configure-vault/pipeline.ts"
        - "file:promptnotes/src/lib/domain/configure-vault/validate-and-transition.ts"
        - "file:promptnotes/src/lib/domain/configure-vault/map-stat-dir-result.ts"
        - "file:promptnotes/src/lib/domain/configure-vault/map-settings-save-error.ts"
        - "file:promptnotes/src-tauri/src/lib.rs"
        - "module:configure-vault"
      reason: "Behavioral spec must be reviewed when declared source files or modules change (GAP-4 PN-6xl)"
---

# Behavioral Specification: ConfigureVault

**Feature**: `configure-vault`
**Phase**: 1a
**Revision**: 1
**Source of truth**:
- `docs/domain/workflows.md` Workflow 9 (ConfigureVault)
- `docs/domain/event-storming.md` row `ConfigureVaultDirectory` → `VaultDirectoryConfigured`
- `docs/domain/domain-events.md` `VaultDirectoryConfigured` (vaultId, path, occurredOn)
- `docs/domain/ui-fields.md` §"画面 2: Vault 設定誘導モーダル"
- `docs/domain/validation.md` シナリオ 1 / モデルマッピング
- `docs/domain/code/ts/src/shared/value-objects.ts` (`VaultPath`, `VaultId`, `Timestamp`, `VaultPathError`)
- `docs/domain/code/ts/src/shared/errors.ts` (`FsError`, `VaultConfigError`)
- `docs/domain/code/ts/src/shared/events.ts` (`VaultDirectoryConfigured` member of `PublicDomainEvent`)
- `docs/domain/code/rust/src/vault/aggregate.rs` (`Vault::configure` — pure state-machine transition)
- `docs/domain/code/rust/src/vault/workflows.rs` (`configure_vault` deps: settings, file_system, clock)
- `docs/domain/code/rust/src/vault/ports.rs` (`SettingsPort`, `FileSystemPort`, `ClockPort`)
- `promptnotes/src/lib/domain/app-startup/load-vault-config.ts` (nearest-neighbor: same statDir + clockNow pattern)
**Scope**: ConfigureVault pipeline only. The pipeline starts when the OS folder picker returns a raw path string inside the "Vault 設定誘導モーダル" and ends when `VaultDirectoryConfigured` is emitted (success) or a `VaultConfigError` is returned (failure). Excludes: button rendering, OS dialog invocation (UI concern), the subsequent `ScanVault` step (AppStartup Step 2 — explicitly out of scope), and any `VaultPath` smart-constructor validation that happens at the Tauri command boundary before this pipeline receives its input.

---

## Pipeline Overview

```
UserSelectedPath → ValidatedPath → PersistedConfig
```

Stages:

| Stage | Guarantee |
|-------|-----------|
| `UserSelectedPath` | Raw OS path string that has already passed the `VaultPath` smart-constructor at the Tauri command boundary; the pipeline receives an already-branded `VaultPath` |
| `ValidatedPath` | `statDir` confirmed the path names an existing, accessible directory |
| `PersistedConfig` | Settings store updated; `Vault` aggregate transitioned to `Ready`; `VaultDirectoryConfigured` emitted |

The pipeline is **Effectful-leaning with a pure core**: `Vault.configure` (the state-machine transition) is pure and property-testable. The three I/O boundaries are `FileSystem.statDir`, `Settings.save`, and `Clock.now` (for event timestamp).

---

## Requirements

### REQ-001: Happy Path — configureVault emits VaultDirectoryConfigured on success

**EARS**: WHEN `configureVault` is invoked with a `VaultPath` AND `FileSystem.statDir(path)` returns `Ok(true)` AND `Settings.save(path)` succeeds THEN the system SHALL return `Ok(VaultDirectoryConfigured { kind: "vault-directory-configured", vaultId, path, occurredOn })` and emit exactly one `VaultDirectoryConfigured` event on the public domain event bus.

**Source**: `workflows.md` Workflow 9, `domain-events.md` `VaultDirectoryConfigured`, `events.ts` `PublicDomainEvent` union.

**Acceptance Criteria**:
- Return value is `{ ok: true, value: VaultDirectoryConfigured }`.
- `VaultDirectoryConfigured.kind === "vault-directory-configured"`.
- `VaultDirectoryConfigured.path === input VaultPath`.
- `VaultDirectoryConfigured.vaultId` is the singleton Vault ID.
- `VaultDirectoryConfigured.occurredOn` is a `Timestamp` derived from `Clock.now()` (see REQ-010).
- The event is emitted on the `EventBus.publish` port exactly once.
- `Vault` aggregate status transitions to `Ready { path }`.

---

### REQ-002: statDir returns Ok(false) — path-not-found error

**EARS**: WHEN `FileSystem.statDir(path)` returns `Ok(false)` THEN the system SHALL return `Err({ kind: "path-not-found", path })` and SHALL NOT invoke `Settings.save` and SHALL NOT emit `VaultDirectoryConfigured`.

**Source**: `errors.ts` `VaultConfigError`; `ui-fields.md` error row `path-not-found`; `load-vault-config.ts` lines 77–88 (Ok(false) collapses to path-not-found).

**Acceptance Criteria**:
- Return value is `{ ok: false, error: { kind: "path-not-found", path: <string> } }`.
- `Settings.save` is invoked zero times.
- `VaultDirectoryConfigured` is not emitted.
- `Clock.now` is invoked zero times (timestamp only acquired on success path).

---

### REQ-003: statDir returns Err(not-found) — path-not-found error

**EARS**: WHEN `FileSystem.statDir(path)` returns `Err({ kind: "not-found" })` THEN the system SHALL return `Err({ kind: "path-not-found", path })` (same error variant as REQ-002) and SHALL NOT invoke `Settings.save` and SHALL NOT emit `VaultDirectoryConfigured`.

**Source**: `errors.ts` `VaultConfigError`; the `not-found` FsError from `statDir` semantically means "path does not name a directory" — it maps to `path-not-found` per the collapse rule applied in `load-vault-config.ts`.

**Rationale**: `Ok(false)` (path is not a directory) and `Err(not-found)` (path does not exist at all) are both user-recoverable by choosing a different folder, hence both map to the same UI-visible `path-not-found` variant.

**Acceptance Criteria**:
- Return value is `{ ok: false, error: { kind: "path-not-found", path: <string> } }`.
- `Settings.save` is invoked zero times.
- `VaultDirectoryConfigured` is not emitted.
- `Clock.now` is invoked zero times.

---

### REQ-004: statDir returns Err(permission) — permission-denied error

**EARS**: WHEN `FileSystem.statDir(path)` returns `Err({ kind: "permission" })` THEN the system SHALL return `Err({ kind: "permission-denied", path })` and SHALL NOT invoke `Settings.save` and SHALL NOT emit `VaultDirectoryConfigured`.

**Source**: `errors.ts` `VaultConfigError`; `ui-fields.md` error row `permission-denied`; `load-vault-config.ts` lines 89–91 (only `permission` gets distinct treatment).

**Acceptance Criteria**:
- Return value is `{ ok: false, error: { kind: "permission-denied", path: <string> } }`.
- `Settings.save` is invoked zero times.
- `VaultDirectoryConfigured` is not emitted.
- `Clock.now` is invoked zero times.

---

### REQ-005: statDir returns other FsError — collapses to path-not-found

**EARS**: WHEN `FileSystem.statDir(path)` returns `Err(FsError)` where `FsError.kind` is `"disk-full"`, `"lock"`, or `"unknown"` THEN the system SHALL return `Err({ kind: "path-not-found", path })` (same collapse rule as REQ-003) and SHALL NOT invoke `Settings.save` and SHALL NOT emit `VaultDirectoryConfigured`.

**Source**: `load-vault-config.ts` lines 88–92 (only `permission` is distinct; every other error variant collapses to path-not-found). This is consistent with the AppStartup precedent.

**Acceptance Criteria**:
- Return value is `{ ok: false, error: { kind: "path-not-found", path: <string> } }`.
- `Settings.save` invoked zero times for all three collapsed variants.
- `VaultDirectoryConfigured` is not emitted.

---

### REQ-006: Settings.save fails with permission error

**EARS**: WHEN `FileSystem.statDir(path)` returns `Ok(true)` AND `Settings.save(path)` returns `Err({ kind: "permission" })` THEN the system SHALL return `Err({ kind: "permission-denied", path })` and SHALL NOT emit `VaultDirectoryConfigured` and SHALL NOT invoke `Clock.now`.

**Source**: `ports.rs` `SettingsPort.save` returns `DomainResult<(), FsError>`; `VaultConfigError` maps settings-write `permission` to `permission-denied`.

**Rationale**: `Settings.save` failure after a successful `statDir` means the settings store itself is inaccessible (e.g., the preferences file is read-only). The error surface from the user's perspective is identical to a directory permission error — it prevents the vault from being usable — and maps to the same `permission-denied` variant.

**Acceptance Criteria**:
- Return value is `{ ok: false, error: { kind: "permission-denied", path: <string> } }`.
- `VaultDirectoryConfigured` is not emitted.
- `Clock.now` is invoked zero times.
- `Settings.save` was invoked exactly once (it was the failing call; confirm that `statDir` was called before it — ordering constraint per REQ-009).

---

### REQ-007: Settings.save fails with disk-full or other FsError

**EARS**: WHEN `Settings.save(path)` returns `Err(FsError)` where `FsError.kind` is `"disk-full"`, `"lock"`, or `"unknown"` THEN the system SHALL return `Err({ kind: "path-not-found", path })` (mapped from a generic settings-write failure) and SHALL NOT emit `VaultDirectoryConfigured`.

**Source**: `errors.ts` `VaultConfigError` union has only three variants (`unconfigured`, `path-not-found`, `permission-denied`). Non-permission settings failures are surfaced as `path-not-found` (the closest available error code for "vault cannot be reached") to keep the UI error catalog simple.

**Note**: This mapping is a pragmatic decision: the `VaultConfigError` type does not include a `settings-write-failed` variant in the MVP domain model. Phase 1c review should confirm this mapping or request a new error variant.

**Acceptance Criteria**:
- Return value is `{ ok: false, error: { kind: "path-not-found", path: <string> } }`.
- `VaultDirectoryConfigured` is not emitted.
- `Clock.now` is invoked zero times.

---

### REQ-008: Vault aggregate state transition is pure

**EARS**: WHEN `validateAndTransitionVault(vaultId, path, now)` is called with a `VaultPath`, `VaultId`, and `Timestamp` THEN the system SHALL return a `Vault` aggregate in `Ready { path }` status deterministically without calling any ports.

**Source**: `aggregate.rs` `Vault::configure(vault, path, now) -> DomainResult<Vault, FsError>` — the docstring states "ここでは状態遷移の純粋関数だけを表現する"; the existence check is via the `FileSystem.statDir` port, which is called separately in the workflow (REQ-001).

**Rationale**: The `Vault.configure` state-machine transition is the pure core of this feature. It is property-testable in isolation, separately from the I/O ports. The TypeScript equivalent mirrors this: `validateAndTransitionVault(vaultId, path, now)` is a pure function that accepts already-validated inputs.

**Idempotency / repeatability**: Calling `validateAndTransitionVault` on a `Vault` that is already `Ready` transitions it back to `Ready` with the new path. Calling on `Unconfigured` transitions to `Ready`. Both are valid. `Scanning` is excluded by the caller (see edge cases).

**Acceptance Criteria**:
- `validateAndTransitionVault(vaultId, path, now)` is pure: no ports, no `Date.now()`, no I/O.
- Same inputs always produce structurally identical output.
- The returned vault has `status.kind === "Ready"` and `status.path === path`.
- The function is total (defined for `Unconfigured` and `Ready` inputs; `Scanning` is a caller precondition violation).

---

### REQ-009: Port call ordering — statDir before Settings.save

**EARS**: WHEN the `configureVault` pipeline executes THEN `FileSystem.statDir` SHALL be invoked before `Settings.save`. `Settings.save` SHALL NOT be invoked if `statDir` did not return `Ok(true)`.

**Source**: `workflows.md` Workflow 9 step order: `FileSystem.statDir → Settings.save(path) → Vault.configure(path)`.

**Rationale**: Writing settings before confirming the directory exists would persist an invalid path, corrupting the application state on the next launch.

**Acceptance Criteria**:
- Spy instrumentation confirms `statDir` is called before `Settings.save` on every path.
- `Settings.save` is called zero times when `statDir` does not return `Ok(true)` (REQ-002, REQ-003, REQ-004, REQ-005).
- `Settings.save` is called exactly once when `statDir` returns `Ok(true)` (success path and Settings-failure paths).

---

### REQ-010: Clock.now discipline — at-most-once on success path only

**EARS**: WHEN `configureVault` executes THEN `Clock.now()` SHALL be invoked at most once per invocation and SHALL be invoked only on the success path (after `Settings.save` returns `Ok`). On any failure path, `Clock.now()` SHALL NOT be invoked.

**Source**: `domain-events.md` `VaultDirectoryConfigured.occurredOn: Timestamp`; `ports.rs` `ClockPort.now()`; `load-vault-config.ts` clock discipline pattern.

**Acceptance Criteria**:
- On success: `Clock.now()` is called exactly once; its return value is `VaultDirectoryConfigured.occurredOn`.
- On `statDir` failure (any variant): `Clock.now()` is called zero times.
- On `Settings.save` failure: `Clock.now()` is called zero times.
- `Clock.now()` is never called before the pipeline determines success (i.e., it is acquired lazily, after `Settings.save` succeeds).

---

### REQ-011: VaultDirectoryConfigured is a Public Domain Event

**EARS**: WHEN `configureVault` succeeds THEN the system SHALL emit `VaultDirectoryConfigured` as a member of the `PublicDomainEvent` union via the `EventBus.publish` port.

**Source**: `events.ts` line 139 — `VaultDirectoryConfigured` is explicitly listed in `PublicDomainEvent`; `domain-events.md` Consumer column: "Capture, Curate".

**Acceptance Criteria**:
- `VaultDirectoryConfigured` is a member of `PublicDomainEvent` (TypeScript type assertion).
- The event is emitted via `EventBus.publish` (the public domain event bus port), NOT via an internal event callback.
- On any failure, `EventBus.publish` is invoked zero times.

---

### REQ-012: No mutation of input VaultPath or Vault aggregate on failure

**EARS**: WHEN `configureVault` returns an error THEN the `Vault` aggregate SHALL remain in its pre-call state (`Unconfigured`) and the `Settings` store SHALL NOT have been mutated (since `Settings.save` is not called when `statDir` fails, and the in-memory `Vault` is only mutated after `Settings.save` succeeds).

**Source**: `workflows.md` Workflow 9 failure semantics; `aggregate.rs` `Vault.configure` is a pure function that returns a new `Vault` — it does not mutate in place.

**Acceptance Criteria**:
- The `Vault` aggregate reference passed to the pipeline is structurally unchanged after a failure return.
- `Settings.save` is not called on `statDir` failure (REQ-009 guarantees this).
- On `Settings.save` failure, `validateAndTransitionVault` is NOT called (the aggregate is not mutated before persistence succeeds).

---

### REQ-013: Non-functional — I/O budget per path

**EARS**: WHEN `configureVault` executes a single invocation THEN the I/O budget SHALL be:

| Path | `statDir` | `Settings.save` | `Clock.now` | `EventBus.publish` |
|------|----------:|----------------:|------------:|-------------------:|
| Success | exactly 1 | exactly 1 | exactly 1 | exactly 1 |
| statDir Ok(false) / Err(not-found) / Err(other) | exactly 1 | 0 | 0 | 0 |
| statDir Err(permission) | exactly 1 | 0 | 0 | 0 |
| Settings.save Err(\*) | exactly 1 | exactly 1 | 0 | 0 |

**Source**: Synthesis of REQ-001 through REQ-010.

**Acceptance Criteria** (verified via spy assertions in Phase 2a tests, property-test in Phase 5 PROP-005):
- The counts above hold for every input within each path.
- No retry / backoff is performed inside the pipeline.

---

### REQ-014: Pipeline function shape — configureVault

**EARS**: WHEN the ConfigureVault pipeline is invoked THEN it SHALL conform to a flat-ports function signature mirroring the `loadVaultConfig` nearest-neighbor pattern.

**Source**: `workflows.rs` `configure_vault(deps, user_selected_path) -> DomainResult<VaultDirectoryConfigured, FsError>`; `load-vault-config.ts` pattern.

**Practical TypeScript shape**:

```ts
export type ConfigureVaultPorts = {
  readonly statDir: (path: string) => Result<boolean, FsError>;
  readonly settingsSave: (path: VaultPath) => Result<void, FsError>;
  readonly clockNow: () => Timestamp;
  readonly emit: (event: VaultDirectoryConfigured) => void;
  readonly vaultId: VaultId;
};

export function configureVault(
  ports: ConfigureVaultPorts,
  userSelectedPath: VaultPath,
): Result<VaultDirectoryConfigured, VaultConfigError>;
```

**Acceptance Criteria**:
- The function is **synchronous** (returns `Result`, not `Promise<Result>`). The Tauri command boundary handles async; the domain pipeline itself is synchronous.
- The function accepts an already-branded `VaultPath` (smart-constructor validation happened at the Tauri command boundary — the pipeline does not re-validate format).
- `configureVault` is the sole exported function from `configure-vault/pipeline.ts`; `validateAndTransitionVault` is exported from `configure-vault/validate-and-transition.ts` for unit-testability. Error mapping is split across `configure-vault/map-stat-dir-result.ts` and `configure-vault/map-settings-save-error.ts` (two files, not a single `error-mapping.ts`).

---

## Purity Boundary Candidates (Preview for Phase 1b)

| Sub-step | Classification | Rationale |
|----------|----------------|-----------|
| `FileSystem.statDir(path)` | **Effectful shell** | Read I/O — OS filesystem call |
| `Settings.save(path)` | **Effectful shell** | Write I/O — settings persistence |
| `validateAndTransitionVault(vaultId, path, now)` | **Pure core** | `(VaultId, VaultPath, Timestamp) → Vault`; deterministic; no ports; property-test target |
| `mapStatDirError(fsError)` | **Pure core** | `FsError → VaultConfigError`; total, no ports |
| `mapSettingsSaveError(fsError)` | **Pure core** | `FsError → VaultConfigError`; total, no ports |
| `Clock.now()` | **Effectful (purity-violating)** | OS time read; gated to success path |
| `EventBus.publish(VaultDirectoryConfigured)` | **Effectful shell** | Public domain event bus; success path only |

---

## Error Catalog (consolidated)

```ts
// Pipeline error surface (VaultConfigError subset)
type VaultConfigError =
  | { kind: 'path-not-found'; path: string }       // statDir Ok(false), Err(not-found), Err(disk-full|lock|unknown), or Settings.save Err(disk-full|lock|unknown)
  | { kind: 'permission-denied'; path: string }    // statDir Err(permission) or Settings.save Err(permission)
  // 'unconfigured' is NOT produced by ConfigureVault (it is produced by AppStartup when no path is stored)

type FsError =
  | { kind: 'permission'; path?: string }
  | { kind: 'disk-full' }
  | { kind: 'lock'; path?: string }
  | { kind: 'not-found'; path?: string }
  | { kind: 'unknown'; detail: string }
```

FsError → VaultConfigError mapping:

| `statDir` result | Pipeline error |
|------------------|---------------|
| `Ok(true)` | — (success, no error) |
| `Ok(false)` | `path-not-found` |
| `Err({ kind: 'not-found' })` | `path-not-found` |
| `Err({ kind: 'permission' })` | `permission-denied` |
| `Err({ kind: 'disk-full' \| 'lock' \| 'unknown' })` | `path-not-found` |

| `Settings.save` result | Pipeline error |
|------------------------|---------------|
| `Ok(void)` | — (success, proceed) |
| `Err({ kind: 'permission' })` | `permission-denied` |
| `Err({ kind: 'disk-full' \| 'lock' \| 'unknown' })` | `path-not-found` |

UI mapping (from `ui-fields.md`):

| Error | Message |
|-------|---------|
| `path-not-found` | 「設定したフォルダが見つかりません。再設定するか、フォルダを復元してください」 |
| `permission-denied` | 「フォルダへのアクセス権限がありません」 |

---

## Event Catalog (consolidated)

| Event | Type | Condition | Channel |
|-------|------|-----------|---------|
| `VaultDirectoryConfigured` | **Public Domain Event** | success path only | `EventBus.publish` |

No internal application events are emitted by ConfigureVault.

---

## Edge Case Catalog

| Edge Case | Category | Expected Behavior |
|-----------|----------|------------------|
| Empty path (`""`) | Out-of-scope (pre-pipeline) | Rejected at Tauri command boundary by `VaultPath` smart-constructor (`VaultPathError.kind === "empty"`). Pipeline never receives it. |
| Non-absolute path (`"relative/path"`) | Out-of-scope (pre-pipeline) | Rejected at Tauri command boundary by smart-constructor (`VaultPathError.kind === "not-absolute"`). Pipeline never receives it. |
| Trailing slash in path (`"/home/user/notes/"`) | Pre-pipeline normalization | The OS folder picker may or may not strip trailing slashes. The `VaultPath` smart-constructor accepts the path as-is; `statDir` receives the raw branded string. This is implementation-level; the spec accepts whatever the picker returns. |
| Symlink to directory | Handled by statDir port | `statDir` returns `Ok(true)` if the symlink target is an accessible directory. The pipeline proceeds normally (symlink resolution is the port's responsibility). |
| Directory exists but is not readable (permission denied on stat) | REQ-004 | `statDir` returns `Err({ kind: "permission" })` → `permission-denied` error. |
| Directory does not exist (stat confirms absence) | REQ-003 | `statDir` returns `Err({ kind: "not-found" })` → `path-not-found` error. |
| Directory path valid but settings store unwritable | REQ-006 | `statDir` Ok(true), `Settings.save` Err(permission) → `permission-denied` error. `VaultDirectoryConfigured` not emitted. |
| Disk full during settings save | REQ-007 | `Settings.save` Err(disk-full) → `path-not-found` error (no distinct error variant in MVP). |
| Race between stat and save (TOCTOU) | Document-and-accept | A directory that exists at `statDir` time may be deleted or renamed before `Settings.save`. Lean mode accepts this gap: the next AppStartup will surface the missing directory via its `loadVaultConfig` step. |
| Repeat configure on already-Ready vault | REQ-008 | `validateAndTransitionVault` with an existing `Ready` vault transitions it to `Ready` with the new path. The full pipeline re-runs `statDir` and `Settings.save`; on success a new `VaultDirectoryConfigured` is emitted. Overwriting settings is idempotent. |
| Configure while vault is Scanning | Pre-condition violation | `Scanning` → `Ready` via `configure` is not defined in the aggregate. The pipeline should never be invoked when `VaultStatus === Scanning`. This is a caller invariant; behavior under violation is undefined. Document in JSDoc; no runtime guard in lean mode. |
| `Clock.now()` returns a timestamp earlier than previous `VaultDirectoryConfigured.occurredOn` | Accepted | The pipeline does not enforce monotonicity of `occurredOn`. Clock non-monotonicity (e.g., NTP adjustment) is an infrastructure concern. |

---

## Out-of-Scope Clarifications

- **VaultPath smart-constructor validation** (empty, non-absolute): handled at the Tauri command boundary, not inside this pipeline. The pipeline receives a branded `VaultPath` and trusts it is structurally valid.
- **ScanVault step** (AppStartup Step 2): `workflows.md` notes "失敗後：AppStartup の Step 2 (scanVault) に続く". The ConfigureVault pipeline terminates after emitting `VaultDirectoryConfigured`. Continuation into `scanVault` is the caller's (application layer's) responsibility and is out of scope for this feature.
- **AppStartup `loadVaultConfig`**: This pipeline stores the vault path; `loadVaultConfig` (a separate pipeline) reads it back on the next startup. They share the `Settings` port but are independent workflows.
- **UI modal dismissal**: The modal closes on success (consumer of `VaultDirectoryConfigured` at the UI layer); the pipeline does not control UI state.
