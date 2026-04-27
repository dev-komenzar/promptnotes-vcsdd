# Code ↔ Domain Model Mapping

Phase 10 (types) で `docs/domain/*.md` から自動翻訳された型定義。
マークダウン更新後は `/ddd types --regenerate` で再生成する。

## 言語境界

`.ddd-session.json` の `decisions.languageBoundary` に従う：

| Bounded Context | 実装言語 | コードの場所 |
|----------------|---------|-----------|
| Vault Context | Rust | `rust/src/vault/` |
| Capture Context | TypeScript | `ts/src/capture/` |
| Curate Context | TypeScript | `ts/src/curate/` |
| Shared Kernel | Rust が真実、TS は ts-rs 生成相当を手書きミラー | `rust/src/{value_objects,snapshots,errors,events}.rs` ↔ `ts/src/shared/*.ts` |

> ts-rs 連携は実プロジェクトで導入する想定。Phase 10 では型構造が一致することのみ担保し、自動生成は未実施。

## 検証

| 言語 | コマンド | 結果 |
|------|---------|------|
| Rust | `cd rust && cargo check` | ✅ warning なし |
| TypeScript | `cd ts && tsc --noEmit -p .` | ✅ strict / exactOptionalPropertyTypes 通過 |

## ディレクトリ構造

```
docs/domain/code/
├── README.md                 (このファイル)
├── rust/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── result.rs                ── DomainResult alias
│       ├── value_objects.rs         ── Shared Kernel: NoteId/Tag/Body/Frontmatter/Timestamp/VaultPath/VaultId
│       ├── snapshots.rs             ── NoteFileSnapshot / CorruptedFile / HydrationFailureReason
│       ├── errors.rs                ── FsError / Workflow ごとのエラー OR 型
│       ├── events.rs                ── Public Domain Events 12 種 + 全集約 enum
│       └── vault/
│           ├── mod.rs
│           ├── aggregate.rs         ── Vault Aggregate (状態機械)
│           ├── ports.rs             ── Settings/FileSystem/FrontmatterParser/Serializer/Clock/IdAllocator
│           ├── stages.rs            ── AppStartup / Save / Delete の Vault 側中間型
│           └── workflows.rs         ── Workflow 1, 2 後段, 5 後段, 9 の関数型
└── ts/
    ├── tsconfig.json
    ├── package.json
    └── src/
        ├── util/
        │   ├── result.ts            ── Result<Ok,Err>
        │   └── branded.ts           ── Brand<T,K>
        ├── shared/                  ── Rust 真実のミラー（ts-rs 生成相当）
        │   ├── value-objects.ts
        │   ├── snapshots.ts
        │   ├── errors.ts
        │   ├── events.ts
        │   └── note.ts              ── Note Aggregate 操作の型シグネチャ（Shared Kernel）
        ├── capture/
        │   ├── states.ts            ── EditingSessionState 状態機械 OR 型 + 遷移関数
        │   ├── stages.ts            ── DirtyEditingSession / ValidatedSaveRequest / FlushedCurrentSession など
        │   ├── commands.ts          ── CaptureCommand 判別ユニオン
        │   ├── internal-events.ts   ── Capture 内 Application Events 12 種
        │   ├── ports.ts             ── ClockNow/AllocateNoteId/ClipboardWrite/EventBusPublish
        │   └── workflows.ts         ── Workflow 2 前段 / 3 / 6 / 8 の関数型
        └── curate/
            ├── aggregates.ts        ── Feed Aggregate + FilterCriteria/SearchQuery/SortOrder
            ├── read-models.ts       ── TagInventory / TagEntry
            ├── stages.ts            ── HydratedFeed / TagChipCommand / AuthorizedDeletion など
            ├── commands.ts          ── CurateCommand 判別ユニオン
            ├── internal-events.ts   ── Curate 内 Application Events 19 種
            ├── ports.ts             ── ClockNow/HydrateNote/GetNoteSnapshot/EventBusPublish
            └── workflows.ts         ── Workflow 1 後段 / 4 / 5 / 7 / projections 更新の関数型
```

## 対応表

### Shared Kernel (Rust 真実 ↔ TS ミラー)

| 型 | Rust | TS | 由来 |
|----|------|----|------|
| `NoteId` | `value_objects::NoteId` | `shared/value-objects.ts` `NoteId` | glossary.md §0 / aggregates.md §1 |
| `Timestamp` | `value_objects::Timestamp` | `shared/value-objects.ts` `Timestamp` | glossary.md §0 |
| `Tag` | `value_objects::Tag` | `shared/value-objects.ts` `Tag` | glossary.md §0 / aggregates.md §1 |
| `Body` | `value_objects::Body` | `shared/value-objects.ts` `Body` | glossary.md §0 |
| `Frontmatter` | `value_objects::Frontmatter` | `shared/value-objects.ts` `Frontmatter` | glossary.md §0 / aggregates.md §1 |
| `FrontmatterPatch` | `value_objects::FrontmatterPatch` | `shared/value-objects.ts` `FrontmatterPatch` | aggregates.md §1 editFrontmatter |
| `VaultPath` | `value_objects::VaultPath` | `shared/value-objects.ts` `VaultPath` | glossary.md §3 |
| `VaultId` | `value_objects::VaultId` | `shared/value-objects.ts` `VaultId` | aggregates.md §4 |
| `NoteFileSnapshot` | `snapshots::NoteFileSnapshot` | `shared/snapshots.ts` `NoteFileSnapshot` | glossary.md §3 / domain-events.md `VaultScanned` |
| `CorruptedFile` | `snapshots::CorruptedFile` | `shared/snapshots.ts` `CorruptedFile` | domain-events.md `VaultScanned.corruptedFiles` |
| `HydrationFailureReason` | `snapshots::HydrationFailureReason` | `shared/snapshots.ts` `HydrationFailureReason` | glossary.md §3 |
| `FsError` | `errors::FsError` | `shared/errors.ts` `FsError` | workflows.md エラーカタログ統合 |
| `AppStartupError` | `errors::AppStartupError` | `shared/errors.ts` `AppStartupError` | workflows.md Workflow 1 |
| `SaveError` | `errors::SaveError` | `shared/errors.ts` `SaveError` | workflows.md Workflow 2 |
| `SwitchError` | `errors::SwitchError` | `shared/errors.ts` `SwitchError` | workflows.md Workflow 3 |
| `DeletionError` | `errors::DeletionError` | `shared/errors.ts` `DeletionError` | workflows.md Workflow 5 |
| `Note` | （Capture/Curate が直接構築しない） | `shared/note.ts` `Note` + `NoteOps` | aggregates.md §1 |

### Public Domain Events (12 種)

すべて Rust `events::PublicDomainEvent` enum と TS `shared/events.ts` `PublicDomainEvent` 判別ユニオンに同期する。

| Event | 由来 | 発行 Context |
|-------|------|------------|
| `VaultDirectoryConfigured` | domain-events.md | Vault |
| `VaultDirectoryNotConfigured` | domain-events.md | Vault |
| `VaultScanned` | domain-events.md | Vault |
| `NoteFileSaved` | domain-events.md | Vault |
| `NoteSaveFailed` | domain-events.md | Vault |
| `NoteFileDeleted` | domain-events.md | Vault |
| `NoteDeletionFailed` | domain-events.md | Vault |
| `NoteHydrationFailed` | domain-events.md | Vault |
| `SaveNoteRequested` | domain-events.md (Carrying Command) | Capture / Curate |
| `EmptyNoteDiscarded` | domain-events.md | Capture |
| `PastNoteSelected` | domain-events.md | Curate |
| `DeleteNoteRequested` | domain-events.md (Carrying Command) | Curate |

### Vault Context (Rust)

| 型 / 関数 | ファイル | 由来 |
|----------|--------|------|
| `Vault` / `VaultStatus` | `vault/aggregate.rs` | aggregates.md §4 |
| `configure` / `begin_scan` / `complete_scan` / `allocate_note_id` | `vault/aggregate.rs` | aggregates.md §4 公開操作 |
| `SettingsPort` / `FileSystemPort` / `FrontmatterParserPort` / `FrontmatterSerializerPort` / `ClockPort` / `NoteIdAllocatorPort` | `vault/ports.rs` | workflows.md §依存（ポート）一覧 |
| `RawAppLaunch` / `ConfiguredVault` / `ScannedVault` | `vault/stages.rs` | workflows.md Workflow 1 ステージ |
| `SerializedMarkdown` / `PersistedNote` | `vault/stages.rs` | workflows.md Workflow 2 ステージ（Vault 側） |
| `AuthorizedDeletion` / `TrashedFile` | `vault/stages.rs` | workflows.md Workflow 5 ステージ |
| `app_startup_vault_phase` | `vault/workflows.rs` | workflows.md Workflow 1 |
| `configure_vault` | `vault/workflows.rs` | workflows.md Workflow 9 |
| `save_note` | `vault/workflows.rs` | workflows.md Workflow 2 後段 |
| `trash_note` | `vault/workflows.rs` | workflows.md Workflow 5 後段 |

### Capture Context (TypeScript)

| 型 / 関数型 | ファイル | 由来 |
|----------|--------|------|
| `EditingSessionState` (`Idle`/`Editing`/`Saving`/`Switching`/`SaveFailed`) | `capture/states.ts` | aggregates.md §CaptureSession EditingSessionState の遷移 |
| `EditingSessionTransitions` | `capture/states.ts` | aggregates.md §CaptureSession 遷移表 |
| `DirtyEditingSession` / `ValidatedSaveRequest` | `capture/stages.ts` | workflows.md Workflow 2 ステージ |
| `PastNoteSelection` / `CurrentSessionDecision` / `FlushedCurrentSession` / `NewSession` | `capture/stages.ts` | workflows.md Workflow 3 ステージ |
| `ClipboardText` | `capture/stages.ts` | workflows.md Workflow 6 |
| `SaveFailedStage` / `UserDecision` / `ResolvedState` | `capture/stages.ts` | workflows.md Workflow 8 |
| `CaptureCommand` 判別ユニオン | `capture/commands.ts` | event-storming.md Capture 側 Command |
| `CaptureInternalEvent` 12 種 | `capture/internal-events.ts` | domain-events.md §Internal / Capture 内 |
| `CaptureDeps` (`ClockNow`/`AllocateNoteId`/`ClipboardWrite`/`EventBusPublish`) | `capture/ports.ts` | workflows.md §依存（ポート）一覧 |
| `PrepareSaveRequest` / `DispatchSaveRequest` / `CaptureAutoSave` | `capture/workflows.ts` | workflows.md Workflow 2 |
| `ClassifyCurrentSession` / `FlushCurrentSession` / `StartNewSession` / `EditPastNoteStart` | `capture/workflows.ts` | workflows.md Workflow 3 |
| `CopyBody` | `capture/workflows.ts` | workflows.md Workflow 6 |
| `HandleSaveFailure` | `capture/workflows.ts` | workflows.md Workflow 8 |
| `BuildSaveNoteRequested` / `EmitSaveAndTransition` | `capture/workflows.ts` | workflows.md Workflow 2 横断 |

### Curate Context (TypeScript)

| 型 / 関数型 | ファイル | 由来 |
|----------|--------|------|
| `Feed` | `curate/aggregates.ts` | aggregates.md §2 |
| `FilterCriteria` / `SearchQuery` / `SortOrder` | `curate/aggregates.ts` | aggregates.md §2 / glossary.md §2 |
| `FeedOps` | `curate/aggregates.ts` | aggregates.md §2 公開操作 |
| `TagInventory` / `TagEntry` / `TagInventoryOps` | `curate/read-models.ts` | aggregates.md §3 |
| `HydratedFeed` / `InitialUIState` | `curate/stages.ts` | workflows.md Workflow 1 ステージ |
| `TagChipCommand` / `MutatedNote` / `IndexedNote` | `curate/stages.ts` | workflows.md Workflow 4 ステージ |
| `DeletionConfirmed` / `AuthorizedDeletion` / `UpdatedProjection` | `curate/stages.ts` | workflows.md Workflow 5 ステージ |
| `UnvalidatedFilterInput` / `AppliedFilter` / `VisibleNoteIds` | `curate/stages.ts` | workflows.md Workflow 7 ステージ |
| `HydratedNote` | `curate/stages.ts` | glossary.md §3 Hydration |
| `CurateCommand` 判別ユニオン | `curate/commands.ts` | event-storming.md Curate 側 Command |
| `CurateInternalEvent` 19 種 | `curate/internal-events.ts` | domain-events.md §Internal / Curate 内 |
| `CurateDeps` (`ClockNow`/`HydrateNote`/`GetNoteSnapshot`/`EventBusPublish`) | `curate/ports.ts` | workflows.md §依存（ポート）一覧 |
| `HydrateFeed` / `InitializeCaptureSession` | `curate/workflows.ts` | workflows.md Workflow 1 後段 |
| `LoadCurrentNote` / `ApplyTagOperation` / `BuildTagChipSaveRequest` / `TagChipUpdate` | `curate/workflows.ts` | workflows.md Workflow 4 |
| `AuthorizeDeletion` / `DeleteNote` / `BuildDeleteNoteRequested` | `curate/workflows.ts` | workflows.md Workflow 5 |
| `ParseFilterInput` / `ApplyFilterOrSearch` | `curate/workflows.ts` | workflows.md Workflow 7 |
| `UpdateProjectionsAfterSave` / `UpdateProjectionsAfterDelete` | `curate/workflows.ts` | workflows.md §共通パターンの識別 1 |

## 設計判断ログ

### Smart Constructor の場所

`Note` / `Frontmatter` / `Tag` / `NoteId` などの不変条件付き型は **Rust 側でしか構築できない** 設計とした。
TypeScript からは ts-rs 経由で受け取った値を `Brand<T,K>` で型ナローイングするのみ。
これにより「TypeScript 側で正規化を忘れて不整合タグが生まれる」可能性を排除する。

→ Capture/Curate が新しい Note を作る場合は **Vault Context (Rust) 経由**：
- 新規ノート: `Vault::allocate_note_id` + Rust 側 `Note::create` → snapshot として TS へ
- タグ追加: TS で `Tag` を構築できないので Rust 側ヘルパ `try_new_tag` を経由

> 実装フェーズで Tauri command として `try_new_tag(raw: String) -> Result<Tag, TagError>` を公開する想定。

### 状態機械を OR 型で表現

`EditingSessionState` (Capture) と `VaultStatus` (Vault) は判別可能ユニオンで「保有データの違い」を型に出した。
- `SwitchingState` だけが `pendingNextNoteId: NoteId`（非 null）を持つ
- `Unconfigured` Vault には `path` フィールド自体が存在しない

これにより「`Unconfigured` の `Vault` に対して `save_note` を呼ぶ」コードはコンパイルエラーになる。

### Result vs Exception

DMMF 原則どおり：
- ドメインの失敗はすべて `DomainResult<T, E>` (Rust) / `Result<T, E>` (TS)
- 例外は genuinely unrecoverable な場合のみ（fs の OS-level panic など）
- Vault からは `NoteFileSaved | NoteSaveFailed` の Public Event として失敗を通知

### ポート (依存) の表現

DMMF: 「依存は関数型でモジュール境界に明示。DI コンテナは前提にしない」。
- Rust: `trait` で表現、impl は実プロジェクトの `src-tauri/` 側で注入
- TS: 関数型 alias の集合 `CaptureDeps` / `CurateDeps`、引数で渡す

## 未翻訳の要素 / 差し戻し提案

| 要素 | 差し戻し先 | 内容 |
|------|----------|------|
| `Settings` 永続化の VO 化 | aggregates.md | `Settings.load` / `Settings.save` ポートに依存しているが、Vault Aggregate との関係が未明示。VO `SettingsRepository` として切り出すか検討。workflows.md §フィードバック にも記載。 |
| Atomic Write のユビキタス言語 | bounded-contexts.md / glossary.md | `FileSystem.writeFileAtomic` の原子性要件が glossary に未掲載。 |
| pendingNextNoteId のキューイング戦略 | aggregates.md | MVP は「最後のみ採用」で進めたが、複数 switch 要求の処理規則が glossary に未掲載。`SwitchingState.pendingNextNoteId` を単一 NoteId とする現状が確定方針。 |
| Projection Update の用語化 | aggregates.md / glossary.md | CaptureAutoSave / TagChipUpdate / DeleteNote 共通の updateProjections ステップ用に "Projection Update" を新設するか検討。 |
| EventBus 仕様 | context-map.md | `publish` の関数型 alias で抽象化済みだが、in-process EventEmitter の保証セマンティクス（同期/非同期、購読順序）が未確定。 |
| `MessagePort` / IPC 境界の型 | context-map.md | Tauri command の引数型として shared 型を使うが、IPC シリアライゼーション方針（serde + ts-rs Tag 表現）は実装フェーズで decision。 |
| Search の正規表現/曖昧検索仕様 | glossary.md / aggregates.md | `SearchQuery.text` の文字列扱い（部分一致/正規表現/あいまい）が openQuestions に残る。MVP は部分一致前提で型化したが、決定後に SearchQuery の subtype を増やすか検討。 |
| Filter 複数条件の AND/OR 拡張 | aggregates.md | `FilterCriteria` は現状 `tags` と `frontmatterFields` のみ。openQuestions の「複数条件の組み合わせ」が拡張時に型変更を要する可能性。 |
| Auto-save debounce 値 | （実装定数として） | workflows.md は ~2s 想定だが、定数 `IDLE_SAVE_DEBOUNCE_MS` は型ではなく config として実装フェーズで定義。 |

## 次フェーズの入口

Phase 11 (`/ddd simulate`) では：
- 本ファイルで定義した型シグネチャを使った **型レベル workflow 検証**
- UI に必要な入力フィールドの **shared/value-objects から自動列挙**
を行い、`code/simulations/*.ts` と `ui-fields.md` を生成する。
