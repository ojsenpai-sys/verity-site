#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# healthcheck-start.sh — 5分ごとの軽量ヘルスチェック（@reboot失敗時の自動復旧）
#
# crontab:
#   */5 * * * * /home/veritysite/verity-official.com/app/scripts/healthcheck-start.sh \
#     >> $HOME/logs/verity/healthcheck.log 2>&1
#
# 方針（暴走防止が最優先）:
#   - PM2 verity が online の間は「絶対に」何もしない（無音終了・ログ肥大なし）
#   - 落ちている(stopped/errored/未登録)時だけ ecosystem.config.js から起動する
#   - 10分クールダウン: 起動が失敗し続けても最大10分に1回しか start しない
#   - online-but-hung(プロセスは生きているが応答無し)には意図的に介入しない
#     （壊れビルドと再起動ループで戦わないためのトレードオフ）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

# ── 真因対策: nodebrew の node を PATH 先頭に置き、HOME を明示 ──────────────────
export HOME=/home/veritysite
export PATH=/home/veritysite/.nodebrew/node/v20.11.1/bin:$PATH

NODE_BIN=/home/veritysite/.nodebrew/node/v20.11.1/bin
APP=/home/veritysite/verity-official.com/app
LOG="$HOME/logs/verity/healthcheck.log"
STAMP="$HOME/logs/verity/.hc-last-start"
COOLDOWN=600   # 秒

mkdir -p "$(dirname "$LOG")"
ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

# ── online 判定: online の間は無音で終了（暴走防止の要）─────────────────────────
if "$NODE_BIN/pm2" jlist 2>/dev/null | grep -q '"status":"online"'; then
  exit 0
fi

# ── クールダウン: 直近の start から COOLDOWN 秒未満なら起動しない ────────────────
now=$(date +%s)
last=0
[ -f "$STAMP" ] && last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $((now - last)) -lt "$COOLDOWN" ]; then
  echo "[$(ts)] verity down だがクールダウン中 (残り $((COOLDOWN - (now - last)))s) — skip" >> "$LOG"
  exit 0
fi
echo "$now" > "$STAMP"

echo "[$(ts)] verity が online でない → ecosystem.config.js から起動" >> "$LOG"
cd "$APP" || { echo "[$(ts)] FATAL: cd $APP に失敗" >> "$LOG"; exit 1; }

# env は ecosystem.config.js を唯一のソースにする（env欠落dump再発防止）
"$NODE_BIN/pm2" start "$APP/ecosystem.config.js" >> "$LOG" 2>&1
"$NODE_BIN/pm2" save >> "$LOG" 2>&1

code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3000/verity || true)
echo "[$(ts)] start 後 /verity -> $code" >> "$LOG"
exit 0
