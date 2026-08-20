// src/lib/audienceV3FromSnapshot.mjs — kpi_daily_snapshot(最新行)から Audience v3(DAU/WAU/MAU) を導出するpure関数。
//
// Phase G-2: get_audience_counts_v3() をライブRPCで直接呼ぶ旧実装は、30日分 user_events の
// 再スキャンが DAU/WAU/MAU 3窓分発生し PostgREST の statement timeout を超過していた
// (Phase G-1 で実測確認)。catch経由で {dau:0,wau:0,mau:0} へ silent fallbackしており、
// 「Human v3 が本当に0件」と「取得失敗」が区別できなかった。
// refresh_analytics cron が同じv3定義の値を約30分毎に kpi_daily_snapshot へ保存済みのため、
// それを正本にする(KPI Trend表と同一rowを参照＝表示の不一致が構造的に発生しない)。
//
// 戻り値 null = 最新snapshot行が無い、または v3 列が未計算(null)＝「データ未取得」。
// 実際に Human v3 が0件のケースと区別するため、判定不能時に0を返さない。
//
// pure function — 副作用なし・DB呼び出しなし。node:test で直接テスト可能。

/**
 * @typedef {{ audience_v3_dau: number | null, audience_v3_wau: number | null, audience_v3_mau: number | null }} AudienceV3Snapshot
 */

/**
 * @param {AudienceV3Snapshot | undefined} latestSnapshot kpi_daily_snapshot を snapshot_date 降順で取得した先頭行
 * @returns {{ dau: number, wau: number, mau: number } | null}
 */
export function audienceV3FromSnapshot(latestSnapshot) {
  if (!latestSnapshot) return null
  const { audience_v3_dau, audience_v3_wau, audience_v3_mau } = latestSnapshot
  if (audience_v3_dau == null || audience_v3_wau == null || audience_v3_mau == null) return null
  return { dau: audience_v3_dau, wau: audience_v3_wau, mau: audience_v3_mau }
}
