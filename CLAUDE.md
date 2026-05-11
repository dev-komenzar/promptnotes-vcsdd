# Prompt Notes - VCSDD 規約

## ワークフロー設計

### 1. Planモードを基本とする
- 3ステップ以上 or アーキテクチャに関わるタスクは必ずPlanモードで開始する
- 途中でうまくいかなくなったら、無理に進めずすぐに立ち止まって再計画する
- 構築だけでなく、検証ステップにもPlanモードを使う
- 曖昧さを減らすため、実装前に詳細な仕様を書く

### 2. ファイル探索にはSerena MCPを使う
- コードベースのファイル探索・シンボル検索には Serena MCP ツールを優先的に使用する
- `find_symbol`, `get_symbols_overview`, `search_for_pattern`, `list_dir`, `find_file` などを活用する
- ファイル全体を読む前に、まずシンボル概要で必要な箇所を特定する

### 3. サブエージェント戦略
- メインのコンテキストウィンドウをクリーンに保つためにサブエージェントを積極的に活用する
- リサーチ・調査・並列分析はサブエージェントに任せる
- 複雑な問題には、サブエージェントを使ってより多くの計算リソースを投入する
- 集中して実行するために、サブエージェント1つにつき1タスクを割り当てる

### 4. 自己改善ループ
- ユーザーから修正を受けたら必ずメモリにそのパターンを記録する
- 同じミスを繰り返さないように、自分へのルールを書く
- ミス率が下がるまで、ルールを徹底的に改善し続ける
- セッション開始時に、そのプロジェクトに関連するメモリをレビューする

### 5. 完了前に必ず検証する
- 動作を証明できるまで、タスクを完了とマークしない
- 必要に応じてmainブランチと自分の変更の差分を確認する
- 「スタッフエンジニアはこれを承認するか？」と自問する
- 実際に環境変更を適用し、成果物を確認し、正しく動作することを示す

### 6. エレガントさを追求する（バランスよく）
- 重要な変更をする前に「もっとエレガントな方法はないか？」と一度立ち止まる
- ハック的な修正に感じたら「今知っていることをすべて踏まえて、エレガントな解決策を実装する」
- シンプルで明白な修正にはこのプロセスをスキップする（過剰設計しない）
- 提示する前に自分の作業に自問自答する

### 7. 自律的なバグ修正
- バグレポートを受けたら、手取り足取り教えてもらわずにそのまま修正する
- ログ・エラー・失敗しているテストを見て、自分で解決する
- ユーザーのコンテキスト切り替えをゼロにする
- 言われなくても、失敗しているCIテストを修正しに行く

---

## セッション完了 (Landing the Plane)

**このプロジェクトは [VCSDD](https://github.com/sc30gsw/vcsdd-claude-code/tree/main) のワークフローに従って開発する。**
セッション完了は VCSDD パイプラインの整合と、リモートへの push が両方とも成功するまで未完了とする。

### 6フェーズパイプライン

仕様記述から収束判定まで、すべての作業を明確なフェーズに分割して進める。フェーズをまたぐ作業は許可されず、各フェーズ完了時に品質ゲートが走る。

| フェーズ | 名称 | 内容 |
|---------|------|------|
| 1a | 行動仕様 | EARS形式の要件定義、エッジケースカタログ |
| 1b | 検証アーキテクチャ | 純粋性境界マップ、証明義務の定義 |
| 1c | 仕様レビューゲート | canonical VCSDD では adversary と人間の両方がレビューする。このプラグインは strict で人手承認を必須にし、lean では任意に緩和する |
| 2a | テスト生成（Red） | 必ず失敗するテストを先に書く |
| 2b | 実装（Green） | テストを通過させる最小実装 |
| 2c | リファクタ | グリーンを維持しながら構造を改善 |
| 3 | 敵対的レビュー | 新鮮なコンテキストのadversaryエージェントによる審査 |
| 4 | フィードバック統合 | 指摘事項を適切なフェーズへルーティング |
| 5 | 形式的強化 | 検証ティアに応じた形式証明の実行 |
| 6 | 収束判定 | 4次元収束が達成された場合のみ完了 |

各フェーズは対応するスラッシュコマンドで進める（`/vcsdd-spec`, `/vcsdd-spec-review`, `/vcsdd-tdd`, `/vcsdd-impl`, `/vcsdd-adversary`, `/vcsdd-feedback`, `/vcsdd-harden`, `/vcsdd-converge`）。状態は `/vcsdd-status` で確認する。

### 必須ワークフロー

**セッション終了時**、以下のすべてのステップを完了すること。

1. **VCSDDフェーズの整合** - 進行中のフェーズを中途半端な状態で残さない。`/vcsdd-status` で現在地を確認し、ゲートを通過させるか、未完了であれば次のセッションへの引き継ぎ事項として明示する
2. **フィードバックのルーティング** - 敵対的レビューや収束判定で出た指摘は `/vcsdd-feedback` で適切なフェーズへ戻す。フェーズをまたいだ未処理の findings を残さない
3. **品質ゲートの実行**（コード変更時） - テスト、リンター、ビルド、加えてフェーズ固有の証明・敵対的レビューを通す
4. **VCSDDコミットの作成** - フェーズ成果物は `/vcsdd-commit` で `vcsdd/<feature>/phase-<id>` タグ付きコミットを生成する
5. **リモートへPUSH** - これは必須:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
6. **クリーンアップ** - stashの整理、リモートブランチのprune
7. **検証** - すべての変更がcommit済みかつpush済みであること、`.vcsdd/` 配下の状態ファイルも含めて整合していること
8. **引き継ぎ** - 次のセッション向けのコンテキストを提供する（現在のフェーズ、未完了の証明義務、open findings を含める）

### コミットメッセージの形式

VCSDDフェーズ成果物のコミットは `/vcsdd-commit` が自動生成する（feature/phase/sprint/gate 情報を含む）。それ以外の通常コミットは以下の形式に従う:

```
(fix|docs|add|update|feat|chore): タイトル

## 問題
- 問題の記述

## 原因
- 分析した問題の原因を説明

## 修正
- 実行した修正項目
```
- それぞれを箇条書きで5行以内にまとめる

### 重要ルール

- フェーズをまたいで作業しない — 1c が PASS する前に 2a を始めない、3 が PASS する前に 5 を始めない
- `git push` が成功するまで作業は未完了
- push前に止まらない — ローカルに作業が取り残される
- 「pushする準備ができたら言ってください」とは言わない — 自分でpushする
- pushが失敗したら、解決してリトライする
- 敵対的レビューが FAIL したら `/vcsdd-feedback` で適切なフェーズへルーティングし、イテレーション上限に達したら `/vcsdd-escalate` で人手承認を取る

---

## コア原則

- **シンプル第一**：すべての変更をできる限りシンプルにする。影響するコードを最小限にする。
- **手を抜かない**：根本原因を見つける。一時的な修正は避ける。シニアエンジニアの水準を保つ。
- **影響を最小化する**：変更は必要な箇所のみにとどめる。バグを新たに引き込まない。

---

## UI 実装ガイド

UI / フロントエンド実装（Svelte コンポーネント、スタイル、画面レイアウト等）を行う際は、必ず [DESIGN.md](./DESIGN.md) を参照する。

- カラーパレット、タイポグラフィ、コンポーネントスタイル、間隔、影、レスポンシブ挙動は DESIGN.md に定義された Notion インスパイアのデザインシステムに従う
- 新しい UI コンポーネントを追加する前に DESIGN.md の該当セクション（Buttons / Cards / Inputs / Navigation / Layout など）を確認する
- DESIGN.md と矛盾するスタイルを書かない。仕様にない要素が必要になった場合は、まず DESIGN.md の原則（warm neutrals、whisper border、4 weight system、layered shadow など）から導出する
- 色・サイズ・余白などのハードコード値は DESIGN.md に記載の値を優先する（独自の数値を入れない）

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
