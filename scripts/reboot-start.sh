#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# reboot-start.sh — 共有ホスト再起動後に verity(PM2) を確実に起動する
#
# crontab:
#   @reboot sleep 60 && /home/veritysite/verity-official.com/app/scripts/reboot-start.sh \
#     >> $HOME/logs/verity/reboot.log 2>&1
#
# 真因対策(2026-07-09 503):
#   pm2 は #!/usr/bin/env node スクリプト。cron @reboot の最小PATHには nodebrew の
#   node が無いため、@reboot から pm2 を絶対パスで呼んでも内部の `env node` が失敗し
#   pm2 デーモンが起動しなかった。→ 本スクリプトで PATH/HOME を明示して解決する。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

# ── 真因対策: nodebrew の node を PATH 先頭に置き、HOME を明示 ──────────────────
export HOME=/home/veritysite
export PATH=/home/veritysite/.nodebrew/node/v20.11.1/bin:$PATH

NODE_BIN=/home/veritysite/.nodebrew/node/v20.11.1/bin
APP=/home/veritysite/verity-official.com/app
LOG="$HOME/logs/verity/reboot.log"

mkdir -p "$(dirname "$LOG")"
ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }

echo "[$(ts)] ===== reboot-start START | $(uptime) =====" >> "$LOG"

cd "$APP" || { echo "[$(ts)] FATAL: cd $APP に失敗" >> "$LOG"; exit 1; }

# env は ecosystem.config.js を唯一のソースにする（env欠落dump再発防止 / 07-05対策と統一）
"$NODE_BIN/pm2" start "$APP/ecosystem.config.js" >> "$LOG" 2>&1
"$NODE_BIN/pm2" save >> "$LOG" 2>&1
"$NODE_BIN/pm2" ls   >> "$LOG" 2>&1

# 起動確認（最大60秒: 5秒 x 12回リトライ）
for i in $(seq 1 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3000/verity || true)
  echo "[$(ts)] verify $i/12 http://127.0.0.1:3000/verity -> $code" >> "$LOG"
  if [ "$code" = "200" ]; then
    echo "[$(ts)] ===== reboot-start OK (verity 200) =====" >> "$LOG"
    exit 0
  fi
  sleep 5
done

echo "[$(ts)] ===== reboot-start WARN: /verity が60秒以内に200を返さず =====" >> "$LOG"
exit 0
