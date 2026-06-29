// ホームHero バリアント切替フラグ（Hero v2 / v2.1）。
//
// v2.1（急上昇TOP10大型Hero）を既定とし、不具合時は env で即時 v2 へロールバックできる。
//   NEXT_PUBLIC_HERO_VARIANT=v2     → 従来Hero（HeroSection）
//   NEXT_PUBLIC_HERO_VARIANT=v2.1   → 新Hero（HeroV21Section）※未指定でもこれが既定
//
// NEXT_PUBLIC_ 接頭辞によりサーバー/クライアント双方で参照可能。中央レジストリは無く、
// 既存の `process.env.NEXT_PUBLIC_* ?? default` 慣習（page.tsx の BRAND_ID 等）に揃えている。

export type HeroVariant = 'v2' | 'v2.1'

const RAW = process.env.NEXT_PUBLIC_HERO_VARIANT?.trim()

/** 既定は 'v2.1'。明示的に 'v2' を指定したときのみ従来Heroへフォールバック。 */
export const HERO_VARIANT: HeroVariant = RAW === 'v2' ? 'v2' : 'v2.1'
