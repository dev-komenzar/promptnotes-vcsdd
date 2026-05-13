# PreToolUse:Bash hook MODULE_NOT_FOUND 調査メモ

## 症状

毎ツール呼び出しで以下の非ブロッキングエラーが発生する。

```
PreToolUse:Bash hook error
Failed with non-blocking status code: node:internal/modules/cjs/loader:1386
  throw err;
  ^

Error: Cannot find module '/scripts/hooks/vcsdd-gate-check.js'
    at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)
    ...
  code: 'MODULE_NOT_FOUND'
```

`PostToolUse:Edit` でも同じパターンで `vcsdd-auto-commit.js` / `vcsdd-coherence-refresh.js` が落ちる。

## 影響

- `non-blocking` なのでツール実行自体は止まらない
- ただしすべての Bash / Edit / Write / MultiEdit 呼び出しごとにスタックトレースが stderr に出てログがノイズで埋まる
- VCSDD のゲートチェック (`vcsdd-gate-check.js`)、自動コミット、coherence 再計算が **実質無効化されている**
- 発生頻度: 現在の worktree セッションだけで 1 セッションあたり 40〜100 件オーダー

## 根本原因

### 1. hook コマンドの定義

`~/.claude/plugins/marketplaces/vcsdd-claude-code/hooks/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_DIR}/scripts/hooks/vcsdd-gate-check.js\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_DIR}/scripts/hooks/vcsdd-coherence-refresh.js\"" },
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_DIR}/scripts/hooks/vcsdd-auto-commit.js\"" }
        ]
      }
    ]
  }
}
```

hook コマンドは `${CLAUDE_PLUGIN_DIR}` に依存している。

### 2. プラグイン登録状況

`~/.claude/plugins/installed_plugins.json`:

```json
"vcsdd@vcsdd-claude-code": [{
  "scope": "project",
  "installPath": "/home/takuya/.claude/plugins/cache/vcsdd-claude-code/vcsdd/1.0.0",
  "projectPath": "/home/takuya/ghq/github.com/dev-komenzar/promptnotes-vcsdd"
}]
```

- `scope` が `project`
- `projectPath` は **元リポジトリ** (`promptnotes-vcsdd`) を指している

### 3. 現在の作業 cwd

```
/home/takuya/ghq/github.com/dev-komenzar/promptnotes-vcsdd=feature-note-body-editor
```

これは git worktree。`projectPath` と **文字列一致しない**。

### 4. 連鎖

1. worktree 側の `.claude/settings.json` には `"enabledPlugins": {"vcsdd@vcsdd-claude-code": true}` が残っている
2. Claude Code はそれを見て plugin の `hooks.json` を読み込み、hook 登録だけは行う
3. しかし `installed_plugins.json` の `projectPath` が現在の cwd と一致しないため、Claude Code は plugin の install path を解決できず、`CLAUDE_PLUGIN_DIR` 環境変数を **空のまま** hook を起動
4. シェルが `node "${CLAUDE_PLUGIN_DIR}/scripts/hooks/vcsdd-gate-check.js"` を `node "/scripts/hooks/vcsdd-gate-check.js"` に展開
5. 絶対パス `/scripts/hooks/...` は当然存在しない → `MODULE_NOT_FOUND`

### 5. 発生履歴

| プロジェクトパス | エラー数 | 期間 |
|------------------|---------|------|
| `promptnotes-vcsdd` (元) | 4,203 件 | 2026-04-27 〜 2026-05-10 |
| `promptnotes-vcsdd=feature-note-body-editor` (worktree) | 数百件 | 2026-05-13 〜 現在も発生 |

両方の cwd で発生しているのは、どちらも `projectPath` の完全一致条件を満たしていないため。元リポジトリ側でも `installed_plugins.json` 上は同じパスのはずだが、Claude Code のバージョン差や別要因で同様にミスマッチした可能性がある。

## 修正オプション

### ① worktree にも plugin を登録する（推奨）

`installed_plugins.json` の `vcsdd@vcsdd-claude-code` 配列に worktree 用エントリを追加する、または Claude Code 内で `/plugin install vcsdd@vcsdd-claude-code` を再実行する。

- ✅ VCSDD の hook が機能する
- ⚠️ worktree を切り直すたびに再登録が必要

### ② スコープを `user` に上げる

`installed_plugins.json` の `scope` を `project` → `user` にし、`projectPath` を削除する。

- ✅ どの cwd でも有効
- ⚠️ ユーザー全体の Claude Code セッションに影響する（VCSDD を使わないプロジェクトでも hook が走る）

### ③ worktree では plugin を無効化する（応急処置）

worktree 側 `.claude/settings.json` で:

```json
{
  "enabledPlugins": {
    "vcsdd@vcsdd-claude-code": false
  }
}
```

- ✅ エラーは即座に止まる
- ❌ VCSDD ゲート、auto-commit、coherence-refresh も止まる
- 👉 `/vcsdd-*` を多用する本プロジェクトでは不向き

## 推奨アクション

1. まず ① または ② で `CLAUDE_PLUGIN_DIR` を正しく解決できる状態にする
2. その後、過去セッションのログに残った大量の MODULE_NOT_FOUND は無視で良い（履歴データのみ）
3. plugin 側の `hooks.json` が `${CLAUDE_PLUGIN_DIR}` 未設定時にフォールバックする仕組みを持っていないことは、`vcsdd-claude-code` 上流に issue として報告する余地あり

## 参考: 確認に使ったコマンド

```bash
# hook 定義
cat ~/.claude/plugins/marketplaces/vcsdd-claude-code/hooks/hooks.json

# プラグイン登録状況
cat ~/.claude/plugins/installed_plugins.json

# エラーが実際に何を吐いているか
grep "loader:1386" ~/.claude/projects/-home-takuya-ghq-github-com-dev-komenzar-promptnotes-vcsdd-feature-note-body-editor/*.jsonl \
  | tail -1 | jq -r '.attachment.stderr'

# 発生件数
grep -c "loader:1386" ~/.claude/projects/-home-takuya-*/*.jsonl
```
