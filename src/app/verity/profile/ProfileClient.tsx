'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Edit2, Check, X, Crown, Star, TrendingUp } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { FavoriteActressSelector } from '@/components/FavoriteActressSelector'
import type { Actress, Profile } from '@/lib/types'
import type { TitleDef, GenreStats } from '@/lib/titles'

type UnlockedEntry = { def: TitleDef; unlocked_at: string }

type Props = {
  user:              { id: string; email: string }
  profile:           Profile | null
  favoriteActresses: Actress[]
  unlockedTitles:    UnlockedEntry[]
  allTitleDefs:      TitleDef[]
  topGenres:         GenreStats[]
  genreTitle:        TitleDef | null
  activityTitle:     TitleDef | null
  totalClicks:       number
  crownActressIds:   string[]
  maxFavorites:      number
}

export function ProfileClient({
  user, profile, favoriteActresses, unlockedTitles, allTitleDefs,
  topGenres, genreTitle, activityTitle, totalClicks,
  crownActressIds, maxFavorites,
}: Props) {
  const { signOut } = useAuth()
  const router = useRouter()

  const [displayName, setDisplayName]   = useState(profile?.display_name ?? '')
  const [editingName, setEditingName]   = useState(false)
  const [currentTitle, setCurrentTitle] = useState(profile?.title ?? 'newcomer')
  const [favActresses, setFavActresses] = useState<Actress[]>(favoriteActresses)
  const [isPending, startTransition]    = useTransition()
  const [saveMsg, setSaveMsg]           = useState('')

  const unlockedIds  = new Set(unlockedTitles.map(t => t.def.id))
  const isMaster     = unlockedIds.has('verity_master')

  async function patchProfile(patch: Record<string, unknown>) {
    const res = await fetch('/verity/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
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
  }

  async function setTitle(id: string) {
    setCurrentTitle(id)
    startTransition(() => patchProfile({ title: id }))
  }

  async function updateFavorites(ids: string[]) {
    await patchProfile({ favorite_actress_ids: ids })
    router.refresh()
  }

  const dynamicTitles: TitleDef[] = [
    ...(genreTitle    ? [genreTitle]    : []),
    ...(activityTitle ? [activityTitle] : []),
  ]

  return (
    <div className="space-y-8">
      {/* ── ユーザー情報 ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 flex-1">
            {/* VERITY マスターバナー */}
            {isMaster && (
              <div className="flex items-center gap-2 rounded-xl
                              bg-gradient-to-r from-amber-500/15 to-yellow-400/10
                              border border-amber-400/40 px-4 py-2.5">
                <span className="text-xl">👑</span>
                <div>
                  <p className="text-xs font-black tracking-wider text-amber-300">VERITY マスター</p>
                  <p className="text-[10px] text-amber-200/70">お気に入り最大6名まで追加可能</p>
                </div>
              </div>
            )}

            {/* 表示名 */}
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">表示名</p>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    maxLength={30}
                    autoFocus
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)]
                               px-3 py-1.5 text-sm text-[var(--text)]
                               focus:border-[var(--magenta)] focus:outline-none"
                  />
                  <button onClick={saveName} className="text-[var(--magenta)]"><Check size={16} /></button>
                  <button onClick={() => setEditingName(false)} className="text-[var(--text-muted)]"><X size={16} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[var(--text)]">
                    {displayName || '（未設定）'}
                  </span>
                  <button
                    onClick={() => setEditingName(true)}
                    className="text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* メールアドレス */}
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">メールアドレス</p>
              <p className="text-sm text-[var(--text)]">{user.email}</p>
            </div>
          </div>

          {/* ログアウト */}
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)]
                       px-3 py-1.5 text-xs text-[var(--text-muted)]
                       hover:border-red-500/40 hover:text-red-400 transition-colors"
          >
            <LogOut size={13} />
            ログアウト
          </button>
        </div>

        {saveMsg && (
          <p className="mt-3 text-xs text-emerald-400">{saveMsg}</p>
        )}
      </section>

      {/* ── 行動傾向（ログ集計）────────────────────────────────────────── */}
      {totalClicks > 0 && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <TrendingUp size={15} className="text-amber-400" />
            あなたのジャンル傾向
            <span className="ml-auto text-xs font-normal text-[var(--text-muted)]">
              累計 {totalClicks} クリック
            </span>
          </h2>

          {dynamicTitles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dynamicTitles.map(def => (
                <div
                  key={def.id}
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(226,0,116,0.15), rgba(251,191,36,0.12))',
                    border:     '1px solid rgba(226,0,116,0.35)',
                    color:      'var(--text)',
                  }}
                >
                  <span>{def.icon}</span>
                  <span>{def.name}</span>
                </div>
              ))}
            </div>
          )}

          {topGenres.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">閲覧ジャンル TOP 5</p>
              <ol className="space-y-1.5">
                {topGenres.slice(0, 5).map((g, i) => {
                  const pct = Math.round((g.count / topGenres[0].count) * 100)
                  return (
                    <li key={g.id} className="flex items-center gap-3 text-xs">
                      <span className="w-4 text-right text-[var(--text-muted)] font-mono">{i + 1}</span>
                      <span className="min-w-[80px] font-medium text-[var(--text)]">{g.id}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: i === 0
                              ? 'linear-gradient(90deg, #E20074, #ff6eb4)'
                              : 'rgba(226,0,116,0.4)',
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-[var(--text-muted)] font-mono">{g.count}</span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* ── 称号（バッジ）─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <Crown size={15} className="text-[var(--magenta)]" />
          称号
        </h2>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {allTitleDefs.map(def => {
            const unlocked = unlockedIds.has(def.id)
            const isActive = currentTitle === def.id
            return (
              <button
                key={def.id}
                disabled={!unlocked || isPending}
                onClick={() => unlocked && setTitle(def.id)}
                className={[
                  'flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-all',
                  unlocked
                    ? isActive
                      ? 'border-[var(--magenta)] bg-[var(--magenta)]/10 shadow-[0_0_14px_rgba(226,0,116,0.25)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--magenta)]/40 cursor-pointer'
                    : 'border-[var(--border)] bg-[var(--surface-2)] opacity-40 cursor-not-allowed',
                ].join(' ')}
              >
                <span className="text-2xl" role="img" aria-label={def.name}>{def.icon}</span>
                <span className={`text-xs font-bold ${unlocked ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
                  {def.name}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] leading-tight">{def.desc}</span>
              </button>
            )
          })}
        </div>

        {unlockedTitles.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">まだ称号を解除していません。</p>
        )}
      </section>

      {/* ── お気に入り女優 ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <Star size={15} className="text-[var(--magenta)]" />
          お気に入り女優
          <span className="text-xs text-[var(--text-muted)] font-normal">
            （最大{maxFavorites}名）
          </span>
        </h2>

        {/* 王冠バッジ取得条件の案内 */}
        {!isMaster && (
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            推し女優のFANZAページ購入リンクを計10回クリックすると 👑 王冠バッジを獲得。
            3名全員が王冠バッジを獲得すると <strong className="text-amber-400">VERITY マスター</strong> 解禁。
          </p>
        )}

        <FavoriteActressSelector
          favorites={favActresses}
          maxFavorites={maxFavorites}
          crownActressIds={crownActressIds}
          onChange={async (ids, updatedList) => {
            if (updatedList) setFavActresses(updatedList)
            else setFavActresses(prev => {
              const map = new Map(prev.map(a => [a.id, a]))
              return ids.map(id => map.get(id)).filter(Boolean) as Actress[]
            })
            await updateFavorites(ids)
          }}
        />
      </section>
    </div>
  )
}
