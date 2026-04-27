# promptnotes

AI を使う人向けのプロンプト下書きジャーナル。書くときは摩擦ゼロ、振り返るときは frontmatter で整理。Markdown で保存し Obsidian と共存。

ドメイン設計は [docs/domain/](docs/domain/) に DDD 11 フェーズで記録（Phase 9 まで完了）。

## Tech stack

| 領域 | 技術 |
|------|------|
| Shell | Tauri |
| Frontend | Svelte（バニラ、SvelteKit なし）+ Vite |
| Backend | Rust |
| 共有型 | Rust 定義 → ts-rs で `.ts` 自動生成 |
| 環境管理 | Nix flake + direnv |

## Bounded Context と言語境界

| Context | 言語 | 主な責務 |
|---------|------|---------|
| Capture | TypeScript（Svelte UI） | 編集セッションのライフサイクル |
| Curate | TypeScript（Svelte UI） | フィード・フィルタ・検索・タグチップ操作 |
| Vault | Rust | fs I/O・frontmatter parse・OS ゴミ箱・allocateNoteId |

## 開発環境セットアップ

### 前提

- [Nix](https://nixos.org/) が flakes 有効でインストール済み
- [direnv](https://direnv.net/) インストール済み

```sh
# プロジェクトディレクトリで
direnv allow
```

これで `flake.nix` の devShell に入り、以下が自動で利用可能になります：

- Rust toolchain（rustc / cargo / rustfmt / clippy / rust-analyzer）
- Node.js 22 + pnpm
- TypeScript CLI（tsc）
- （Linux のみ）Tauri 用システム依存（webkitgtk, gtk3, libsoup 等）

### 動作確認

```sh
rustc --version
node --version
pnpm --version
tsc --version
```

## 型チェック（CI で動かす想定）

```sh
# Rust 全体
cargo check
cargo clippy

# TypeScript 全体
pnpm tsc --noEmit
```

## ディレクトリ構成（予定）

```
.
├── flake.nix             Nix flake（dev shell 定義）
├── .envrc                direnv: use flake
├── docs/domain/          DDD ドキュメント
│   └── code/             Phase 10 で生成される型定義（Rust + TS）
├── src-tauri/            Tauri バックエンド（Rust 実装）
└── src/                  Svelte フロントエンド（TS 実装）
```

`docs/domain/code/` は設計フェーズの型定義（コンパイル可能）の置き場で、`src-tauri/` `src/` は将来の実装用です。
