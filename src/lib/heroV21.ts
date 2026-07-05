// Hero v2.1 共有型・定数・計測ヘルパー（サーバー/クライアント両用・React非依存）。
//
// HeroV21Section（server）が整形し、HeroV21Client / MainStage / Thumb（client）が描画する。
// v2.2（動画）・v3（AI）でも作品アイテムの基本形は共通のため、ここを単一の source of truth とする。

export type HeroV21Item = {
  rank:        number
  points:      number
  cid:         string
  title:       string
  slug:        string | null
  actress:     string | null
  actressId:   number | null
  maker:       string | null
  releaseDate: string | null   // 'YYYY.MM.DD'（JST・サーバー整形済み）
  imgSrc:      string | null   // /api/proxy/image?url=...
  coverPos:    string          // object-position tailwind クラス
  fanzaUrl:    string | null   // リージョン解決済みアフィリエイトURL
  // ── 15秒プレビュー（方式A：FANZA公式 litevideo iframe）─────────────────────────
  // FANZA litevideo プレイヤーの HTML ページ URL（`metadata.sample_movie_url`）。
  // ※生 mp4 の直リンクではないため <video> 直再生は不可＝iframe 埋め込みで扱う。
  // null の作品は main プレビューボタンを出さない。
  sampleMovieUrl:  string | null
  // 将来 mp4 <video> 化した際の seek 開始秒。iframe 方式では再生位置に反映できないため
  // 現状は計測メタとして持つのみ（既定 0）。
  previewStartSec: number
}

// TOP3 のみ軽量装飾（v2 rail / ranking ページと同じ規約）。
export const RANK_STYLE: Record<number, { ring: string; badge: string }> = {
  1: { ring: 'ring-amber-400/70', badge: 'bg-amber-400 text-amber-950' },
  2: { ring: 'ring-slate-300/60', badge: 'bg-slate-300 text-slate-800' },
  3: { ring: 'ring-amber-600/60', badge: 'bg-amber-700 text-amber-50'  },
}

/**
 * 全 position 共通の計測メタ。cid は呼び出し側で target_id に載せるためここには含めない。
 * rank/points/title/actress/maker を送り、CTR×順位×戦闘力スコアのクロス分析を可能にする。
 */
export function heroClickMeta(item: HeroV21Item) {
  return {
    rank:    item.rank,
    points:  item.points,
    title:   item.title,
    actress: item.actress,
    maker:   item.maker,
  }
}

// ── 15秒プレビュー実験（方式A：公式 litevideo iframe）─────────────────────────────
//
// 検証目的:「プレビューを開いたユーザーが FANZA へ行くか」。厳密な再生解析ではない。
// 対象は Hero v2.1 の main 作品のみ（rail 非対象・DB 変更なし）。

/** プレビュー計測の position（既存 hero_v21_* 規約に合わせる。fanza_click の導線切り分け用）。 */
export const PREVIEW_POSITION = 'hero_v21_preview_main'

/** プレビュー再生秒数。この秒数経過で iframe をアンマウントして停止し CTA を強調する。 */
export const PREVIEW_DURATION_SEC = 15

/**
 * プレビュー系イベント（hero_preview_*）共通メタ。
 * cid は呼び出し側で target_id に載せるためここには含めない。
 * ※analytics は camelCase の `actressId`/`cid` を構造キーとして metadata から剥がすため、
 *   女優IDは snake_case の `actress_id` で持たせる（metadata に残す目的）。
 */
export function previewMeta(item: HeroV21Item) {
  return {
    position:           PREVIEW_POSITION,
    rank:               item.rank,
    points:             item.points,
    title:              item.title,
    actress:            item.actress,
    actress_id:         item.actressId,
    previewStartSec:    item.previewStartSec,
    previewDurationSec: PREVIEW_DURATION_SEC,
  }
}
