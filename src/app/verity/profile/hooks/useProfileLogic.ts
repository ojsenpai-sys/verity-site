'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { EPITHET_MAP, EPITHET_DEFS } from '@/lib/epithets'
import type { EpithetDef } from '@/lib/epithets'
import type { Actress, Profile } from '@/lib/types'
import { TITLE_MAP, type TitleDef } from '@/lib/titles'
import type { LoginBonusResult } from '../page'

export type UnlockedEntry = { def: TitleDef; unlocked_at: string }

type Input = {
  profile:            Profile | null
  favoriteActresses:  Actress[]
  unlockedTitles:     UnlockedEntry[]
  allTitleDefs:       TitleDef[]
  genreTitle:         TitleDef | null
  activityTitle:      TitleDef | null
  lpBalance:          number
  lpPointsMap:        Record<string, number>
  bonusResult:        LoginBonusResult
  earnedEpithetIds:   string[]
  /** 王冠バッジ獲得済み女優ID（LP単独判定。LP投入直後に即時更新される） */
  crownActressIds:    string[]
  starsCount:         number
  maxFavorites:       number
}

export function useProfileLogic({
  profile,
  favoriteActresses,
  unlockedTitles: initialUnlockedTitles,
  allTitleDefs,
  genreTitle,
  activityTitle,
  lpBalance:          initialLpBalance,
  lpPointsMap:        initialLpPointsMap,
  bonusResult,
  earnedEpithetIds:   initialEpithetIds,
  crownActressIds:    initialCrownActressIds,
  starsCount:         initialStarsCount,
  maxFavorites:       initialMaxFavorites,
}: Input) {
  const { signOut } = useAuth()
  const router = useRouter()

  const [displayName, setDisplayName]         = useState(profile?.display_name ?? '')
  const [editingName, setEditingName]         = useState(false)
  const [currentTitle, setCurrentTitle]       = useState(profile?.title ?? 'newcomer')
  const [favActresses, setFavActresses]       = useState<Actress[]>(favoriteActresses)
  const [isPending, startTransition]          = useTransition()
  const [saveMsg, setSaveMsg]                 = useState('')
  const [lpBalance, setLpBalance]             = useState(initialLpBalance)
  const [lpPointsMap, setLpPointsMap]         = useState<Record<string, number>>(initialLpPointsMap)
  const [epithetIds, setEpithetIds]           = useState<Set<string>>(new Set(initialEpithetIds))
  const [equippedEpithet, setEquippedEpithet] = useState<string | null>(profile?.equipped_epithet ?? null)
  const [newEpithetToast, setNewEpithetToast] = useState<EpithetDef | null>(null)
  const [showEpithets, setShowEpithets]       = useState(false)
  const [crownActressIds, setCrownActressIds] = useState<string[]>(initialCrownActressIds)
  const [starsCount, setStarsCount]           = useState(initialStarsCount)
  const [maxFavorites, setMaxFavorites]       = useState(initialMaxFavorites)
  const [unlockedTitles, setUnlockedTitles]   = useState<UnlockedEntry[]>(initialUnlockedTitles)

  // お気に入り変更(updateFavorites → router.refresh())で page.tsx が再計算した
  // 最新値を反映する。LP投入直後の即時反映(handleLpTransfer)はこれとは別に
  // ローカルsetterで行うため、ここでの同期はサーバー側の再計算結果を上書きするだけでよい。
  useEffect(() => { setCrownActressIds(initialCrownActressIds) }, [initialCrownActressIds])
  useEffect(() => { setStarsCount(initialStarsCount) },           [initialStarsCount])
  useEffect(() => { setMaxFavorites(initialMaxFavorites) },       [initialMaxFavorites])
  useEffect(() => { setUnlockedTitles(initialUnlockedTitles) },   [initialUnlockedTitles])

  // sleepless_tactician: 深夜2:00〜5:00のアクセス
  useEffect(() => {
    const h = new Date().getHours()
    if (h >= 2 && h < 5) {
      fetch('/verity/api/epithets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ids: ['sleepless_tactician'] }),
      }).then(r => r.json()).then(d => {
        if (d.ok && d.awarded?.includes('sleepless_tactician')) triggerEpithetToast('sleepless_tactician')
      }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function triggerEpithetToast(id: string) {
    const def = EPITHET_MAP[id]
    if (def && !epithetIds.has(id)) {
      setEpithetIds(prev => new Set([...prev, id]))
      setNewEpithetToast(def)
      setTimeout(() => setNewEpithetToast(null), 5000)
    }
  }

  async function awardEpithets(ids: string[]) {
    const newIds = ids.filter(id => !epithetIds.has(id))
    if (newIds.length === 0) return
    const res = await fetch('/verity/api/epithets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: newIds }),
    })
    if (res.ok) {
      setEpithetIds(prev => new Set([...prev, ...newIds]))
      if (newIds[0]) triggerEpithetToast(newIds[0])
    }
  }

  async function patchProfile(patch: Record<string, unknown>) {
    const res = await fetch('/verity/api/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })
    if (!res.ok) {
      const { error } = await res.json()
      setSaveMsg(`エラー: ${error}`)
    } else {
      setSaveMsg('保存しました')
      setTimeout(() => setSaveMsg(''), 2000)
    }
  }

  async function saveName() {
    setEditingName(false)
    startTransition(() => patchProfile({ display_name: displayName || null }))
    if (displayName && !profile?.display_name) await awardEpithets(['shadow_warrior'])
  }

  async function setTitle(id: string) {
    setCurrentTitle(id)
    startTransition(() => patchProfile({ title: id }))
  }

  async function updateFavorites(ids: string[]) {
    await patchProfile({ favorite_actress_ids: ids })
    router.refresh()
  }

  async function handleLpTransfer(actressId: string, amount: number) {
    if (lpBalance < amount) {
      await awardEpithets(['empty_prayer'])
      return
    }
    const res = await fetch('/verity/api/lp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ actress_id: actressId, amount }),
    })
    if (!res.ok) return
    const data = await res.json()
    if (data.ok) {
      setLpBalance(data.new_balance)
      setLpPointsMap(prev => ({ ...prev, [actressId]: data.lp_points }))
      // 王冠 / Stars / VERITY マスターをページ再読み込みなしで即時反映
      // （api/lp が transfer と同一レスポンスで再評価済みの値を返す）
      if (Array.isArray(data.crown_actress_ids)) setCrownActressIds(data.crown_actress_ids)
      if (typeof data.stars_count === 'number') setStarsCount(data.stars_count)
      if (typeof data.max_favorites === 'number') setMaxFavorites(data.max_favorites)
      if (data.new_verity_master) {
        setUnlockedTitles(prev =>
          prev.some(t => t.def.id === 'verity_master')
            ? prev
            : [...prev, { def: TITLE_MAP.verity_master as TitleDef, unlocked_at: new Date().toISOString() }],
        )
      }
      if (Array.isArray(data.new_epithets)) {
        for (const id of data.new_epithets) triggerEpithetToast(id as string)
      }
    }
  }

  async function equipEpithet(id: string | null) {
    const prev = equippedEpithet
    setEquippedEpithet(id)
    const res = await fetch('/verity/api/epithets', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ epithet_id: id }),
    })
    if (!res.ok) setEquippedEpithet(prev)
  }

  // ── derived ──────────────────────────────────────────────────────────────────
  const unlockedIds    = new Set(unlockedTitles.map(t => t.def.id))
  const showBonus      = !!bonusResult.ok && !bonusResult.already_claimed
  const dynamicTitles: TitleDef[] = [
    ...(genreTitle    ? [genreTitle]    : []),
    ...(activityTitle ? [activityTitle] : []),
  ]
  const activeTitleDef  = allTitleDefs.find(d => d.id === currentTitle) ?? null
  const earnedCount     = epithetIds.size
  const totalEpithets   = EPITHET_DEFS.length
  const isLegend        = starsCount >= 9

  return {
    // state
    displayName, setDisplayName,
    editingName, setEditingName,
    currentTitle,
    favActresses, setFavActresses,
    isPending,
    saveMsg,
    lpBalance,
    lpPointsMap,
    epithetIds,
    equippedEpithet,
    newEpithetToast,
    showEpithets, setShowEpithets,
    crownActressIds,
    starsCount,
    maxFavorites,
    unlockedTitles,
    // derived
    unlockedIds,
    showBonus,
    dynamicTitles,
    activeTitleDef,
    earnedCount,
    isLegend,
    totalEpithets,
    // actions
    saveName,
    setTitle,
    updateFavorites,
    handleLpTransfer,
    equipEpithet,
    awardEpithets,
    signOut,
  }
}
