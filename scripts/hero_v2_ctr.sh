#!/usr/bin/env bash
# hero_v2_ctr.sh — Hero v2 Phase1 CTR速報（read-only）
#
# 使い方:  ./scripts/hero_v2_ctr.sh [WINDOW_HOURS]   (default 24)
#   例:    ./scripts/hero_v2_ctr.sh 24     # 直近24時間
#          ./scripts/hero_v2_ctr.sh 72     # 直近3日
#          ./scripts/hero_v2_ctr.sh 168    # 直近7日
#
# 指標:
#   - 真CTR  = position clicks ÷ ホームimpression(page_view /verity)  ※Heroはホームのみ表示
#   - share  = position clicks ÷ 総fanza_click（ダッシュボード「導線別」と同義）
#   - 旧Hero(hero_cta/hero_image) と Hero v2 / v2.1 の比較
#   - main vs rail、rank metadata別、FANZA送客全体への寄与
#   - Hero v2.1: 送客=hero_v21_main_image/main_cta/rank_thumb（fanza_click）、
#               切替=hero_v21_rank_nav（内部回遊イベント hero_rank_select・分母汚染なし）
#
# DB書き込みは一切行わない（GETのみ）。合成イベントを注入しないこと（CTRベースライン保護）。
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WIN_H="${1:-24}"
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
auth=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY")
SINCE=$(date -u -d "${WIN_H} hours ago" '+%Y-%m-%dT%H:%M:%SZ')
NOW=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

count_of(){ curl -s --ssl-no-revoke --max-time 25 -D - -o /dev/null "${auth[@]}" \
  -H "Prefer: count=exact" -H "Range: 0-0" "$URL/rest/v1/user_events?select=id&$1" \
  | grep -i '^content-range:' | sed -E 's/.*\/([0-9]+).*/\1/' | tr -d '\r'; }

IMPR=$(count_of "event_name=eq.page_view&page_path=eq./verity&created_at=gte.$SINCE")
TOTFZ=$(count_of "event_name=eq.fanza_click&created_at=gte.$SINCE")
fz=$(curl -s --ssl-no-revoke --max-time 25 "${auth[@]}" \
  "$URL/rest/v1/user_events?select=metadata&event_name=eq.fanza_click&created_at=gte.$SINCE&limit=5000")
# Hero v2.1 のメイン切替は内部回遊イベント hero_rank_select（fanza_click と別系統）
sel=$(curl -s --ssl-no-revoke --max-time 25 "${auth[@]}" \
  "$URL/rest/v1/user_events?select=metadata&event_name=eq.hero_rank_select&created_at=gte.$SINCE&limit=5000")

cnt(){ printf '%s' "$fz" | { grep -o "\"position\": *\"$1\"" || true; } | wc -l | tr -d ' '; }
cntsel(){ printf '%s' "$sel" | { grep -o "\"position\": *\"$1\"" || true; } | wc -l | tr -d ' '; }
ctr(){ awk -v c="$1" -v i="$IMPR" 'BEGIN{ if(i>0) printf "%.2f%%", c/i*100; else print "n/a" }'; }
shr(){ awk -v c="$1" -v t="$TOTFZ" 'BEGIN{ if(t>0) printf "%.1f%%", c/t*100; else print "n/a" }'; }
row(){ printf "%-22s %5s  CTR=%-8s share=%s\n" "$1" "$2" "$(ctr $2)" "$(shr $2)"; }

echo "════ Hero v2 CTR速報  window=直近${WIN_H}h  ($SINCE → $NOW UTC) ════"
echo "ホームimpression(page_view /verity)=$IMPR   総fanza_click=$TOTFZ"
echo
echo "── Hero v2（分母=ホームview $IMPR）──"
row hero_main_image    "$(cnt hero_main_image)"
row hero_main_cta      "$(cnt hero_main_cta)"
row hero_rank_card     "$(cnt hero_rank_card)"
row hero_rank_carousel "$(cnt hero_rank_carousel)"
MAIN=$(( $(cnt hero_main_image) + $(cnt hero_main_cta) ))
RAIL=$(( $(cnt hero_rank_card) + $(cnt hero_rank_carousel) ))
V2=$(( MAIN + RAIL ))
printf "%-22s %5s  CTR=%s\n" "main合計" "$MAIN" "$(ctr $MAIN)"
printf "%-22s %5s  CTR=%s\n" "rail合計" "$RAIL" "$(ctr $RAIL)"
printf "%-22s %5s  CTR=%s  寄与=%s of FANZA\n" "Hero v2全体" "$V2" "$(ctr $V2)" "$(shr $V2)"
echo
echo "── Hero v2.1（分母=ホームview $IMPR）──"
row hero_v21_main_image  "$(cnt hero_v21_main_image)"
row hero_v21_main_cta    "$(cnt hero_v21_main_cta)"
row hero_v21_rank_thumb  "$(cnt hero_v21_rank_thumb)"
V21=$(( $(cnt hero_v21_main_image) + $(cnt hero_v21_main_cta) + $(cnt hero_v21_rank_thumb) ))
printf "%-22s %5s  CTR=%s  寄与=%s of FANZA\n" "Hero v2.1送客計" "$V21" "$(ctr $V21)" "$(shr $V21)"
NAV=$(cntsel hero_v21_rank_nav)
printf "%-22s %5s  CTR=%-8s （内部回遊・fanza_click外）\n" "rank_nav切替" "$NAV" "$(ctr $NAV)"
echo
echo "── 旧Hero（比較）──"
row "hero_cta(旧)"   "$(cnt hero_cta)"
row "hero_image(旧)" "$(cnt hero_image)"
echo
echo "── 参考（他導線・share）──"
for p in card_image card_cta fastest_new_releases digital_single related_scored_image; do
  printf "%-22s %5s  share=%s\n" "$p" "$(cnt $p)" "$(shr $(cnt $p))"
done
echo
echo "── rank metadata別 v2（rail click傾向）──"
printf '%s' "$fz" | { grep -oE '"rank": *[0-9]+, *"position": *"hero_rank[^"]*"' || true; } \
  | sed -E 's/"rank": *([0-9]+).*"position": *"([^"]*)"/rank \1  \2/' | sort | uniq -c | sort -rn
echo
echo "── rank metadata別 v2.1（thumb送客＋nav切替）──"
# jsonbはkey長順で rank→…→position と並ぶため [^}]* で同一オブジェクト内を許容
{
  printf '%s' "$fz"  | { grep -oE '"rank": *[0-9]+[^}]*"position": *"hero_v21_rank_thumb"' || true; }
  printf '%s' "$sel" | { grep -oE '"rank": *[0-9]+[^}]*"position": *"hero_v21_rank_nav"'   || true; }
} | sed -E 's/"rank": *([0-9]+).*"position": *"([^"]*)"/rank \1  \2/' | sort | uniq -c | sort -rn
echo "════════════════════════════════════════════════════════════════"
