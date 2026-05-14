export interface TitleDef {
  id:   string
  name: string
  desc: string
  icon: string
}

export interface UnlockedTitle {
  id:          string
  unlocked_at: string
}

/** 王冠バッジ条件: 購入/予約クリック数（per actress） */
export const CROWN_CLICK_THRESHOLD = 10
/** 王冠バッジ条件: 捧げた累計 LP（per actress） */
export const CROWN_LP_THRESHOLD = 30

export const TITLE_DEFS: TitleDef[] = [
  { id: 'newcomer',          name: '新参者',             desc: '会員登録完了',                          icon: '🌱' },
  { id: 'oshi_katsu',        name: '推し活家',            desc: 'お気に入り女優を3名設定',                icon: '💜' },
  { id: 'veteran',           name: '常連',                desc: '会員歴30日以上',                        icon: '🏅' },
  { id: 'collector',         name: 'コレクター',           desc: '記事を100件以上既読',                   icon: '📚' },
  { id: 'verity_master',     name: 'VERITY マスター',     desc: '推し女優3名全員が王冠バッジを獲得',       icon: '👑' },
  { id: 'legend_of_verity',  name: 'LEGEND OF VERITY',   desc: '9名の女優に王冠バッジを授与',             icon: '⭐' },
]

export const TITLE_MAP = Object.fromEntries(TITLE_DEFS.map(t => [t.id, t]))

/** ユーザーの状態から解除すべき称号IDリストを返す */
export function computeUnlocks(params: {
  createdAt:        Date
  favCount:         number
  existingUnlocked: string[]
  /** お気に入り女優UUIDリスト */
  favoriteIds?:     string[]
  /** 王冠バッジ獲得済み女優UUIDリスト (clicks >= CROWN_CLICK_THRESHOLD && lp >= CROWN_LP_THRESHOLD) */
  crownIds?:        string[]
}): string[] {
  const { createdAt, favCount, existingUnlocked, favoriteIds = [], crownIds = [] } = params
  const already = new Set(existingUnlocked)
  const newIds: string[] = []

  const add = (id: string) => { if (!already.has(id)) newIds.push(id) }

  add('newcomer')
  if (favCount >= 3) add('oshi_katsu')
  if (Date.now() - createdAt.getTime() >= 30 * 24 * 3_600_000) add('veteran')

  // VERITY マスター: 推し3名全員が王冠バッジを獲得済み
  if (
    favoriteIds.length >= 3 &&
    crownIds.length > 0 &&
    favoriteIds.every(id => crownIds.includes(id))
  ) {
    add('verity_master')
  }

  return newIds
}

// ── ジャンルログから動的称号を生成 ────────────────────────────────────────────

export interface GenreStats {
  id:    string  // genre name
  count: number
}

/**
 * 上位ジャンルの閲覧回数に応じた動的称号を返す。
 */
export function computeGenreTitle(topGenres: GenreStats[]): TitleDef | null {
  if (!topGenres.length) return null
  const top = topGenres[0]
  if (top.count < 3) return null

  let name: string
  let icon: string

  if (top.count >= 30) {
    name = `熟練${top.id}マニア`
    icon = '👑'
  } else if (top.count >= 10) {
    name = `${top.id}マニア`
    icon = '🔥'
  } else {
    name = `${top.id}好き`
    icon = '🔖'
  }

  return {
    id:   `genre_${top.id}`,
    name,
    desc: `${top.id}を${top.count}回閲覧`,
    icon,
  }
}

/**
 * 総クリック数から「アクティブ度」称号を返す（全ジャンル横断）。
 */
export function computeActivityTitle(totalClicks: number): TitleDef | null {
  if (totalClicks >= 100) return { id: 'activity_master', name: 'VERITY通',    desc: `累計${totalClicks}回クリック`, icon: '⚡' }
  if (totalClicks >= 30)  return { id: 'activity_active', name: 'アクティブ勢', desc: `累計${totalClicks}回クリック`, icon: '✨' }
  return null
}
