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
