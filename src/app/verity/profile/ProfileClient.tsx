'use client'

import { useState, useEffect } from 'react'
import { LogOut, Edit2, Check, X, Star, TrendingUp, Flame, Sparkles, Images, ChevronDown } from 'lucide-react'
import { FavoriteActressSelector } from '@/components/FavoriteActressSelector'
import { MyGalleryGrid } from '@/components/MyGalleryGrid'
import { StatusCard } from '@/components/StatusCard'
import { EPITHET_DEFS, EPITHET_MAP, RARITY_STYLE } from '@/lib/epithets'
import type { Actress, Profile } from '@/lib/types'
import type { TitleDef, GenreStats } from '@/lib/titles'
import type { EpithetDef } from '@/lib/epithets'
import { useProfileLogic } from './hooks/useProfileLogic'
import type { UnlockedEntry } from './hooks/useProfileLogic'
import type { LoginBonusResult } from './page'

type Props = {
  user:                  { id: string; email: string }
  profile:               Profile | null
  favoriteActresses:     Actress[]
  unlockedTitles:        UnlockedEntry[]
  allTitleDefs:          TitleDef[]
  topGenres:             GenreStats[]
  genreTitle:            TitleDef | null
  activityTitle:         TitleDef | null
  totalClicks:           number
  crownActressIds:       string[]
  maxFavorites:          number
  starsCount:            number
  isLegend:              boolean
  lpBalance:             number
  lpTotalAccumulated:    number
  loginStreak:           number
  bonusResult:           LoginBonusResult
  lpPointsMap:           Record<string, number>
  hasNewGalleryPosts:    boolean
  missingSnsActresses:   Actress[]
  earnedEpithetIds:      string[]
}

// ── 小型 UI コンポーネント ─────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: number }) {
  if (streak <= 0) return null
  const isWeek = streak % 7 === 0
  const isFire = streak >= 3
  if (isWeek) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-400/15 border border-amber-400/40 px-2.5 py-1 text-[11px] font-bold text-amber-300">
      🎊 {streak}日連続達成！
    </span>
  )
  if (isFire) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 border border-orange-400/30 px-2.5 py-1 text-[11px] font-bold text-orange-300">
      <Flame size={11} />
      {streak}日連続
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
      {streak}日目
    </span>
  )
}

function LpBadge({ balance }: { balance: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--magenta)]/15 to-purple-500/10 border border-[var(--magenta)]/30 px-3 py-1 text-[11px] font-bold text-[var(--magenta)]">
      💙 {balance} LP
    </span>
  )
}

function BonusToast({ bonus, isWeek }: { bonus: number; isWeek: boolean }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(t)
  }, [])
  if (!visible) return null
  return (
    <div className={[
      'fixed bottom-6 right-4 z-50 flex items-center gap-2.5 rounded-2xl px-5 py-3',
      'shadow-2xl border animate-in slide-in-from-bottom-4 duration-300',
      isWeek
        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 border-amber-300/50 text-amber-900'
        : 'bg-[var(--surface)] border-[var(--magenta)]/50 text-[var(--text)]',
    ].join(' ')}>
      <span className="text-xl">{isWeek ? '🎊' : '💙'}</span>
      <div>
        <p className="text-sm font-black">{isWeek ? `7日連続ボーナス！ +${bonus} LP` : `+${bonus} LP 受け取りました`}</p>
        <p className="text-[10px] opacity-70">ログインボーナス</p>
      </div>
    </div>
  )
}

function EpithetToast({ epithet }: { epithet: EpithetDef }) {
  const [visible, setVisible] = useState(true)
  const rs = RARITY_STYLE[epithet.rarity]
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500)
    return () => clearTimeout(t)
  }, [])
  if (!visible) return null
  return (
    <div className={['fixed bottom-6 left-4 z-50 flex items-center gap-3 rounded-2xl px-5 py-3', 'shadow-2xl border animate-in slide-in-from-bottom-4 duration-300', rs.bg, rs.border, rs.glow].join(' ')}>
      <span className="text-lg">⚡</span>
      <div>
        <p className="text-[10px] uppercase tracking-widest opacity-70">{rs.label} — 二つ名獲得</p>
        <p className={`text-sm font-black ${rs.textClass}`}>「{epithet.name}」を解放しました</p>
      </div>
    </div>
  )
}

function StarsDisplay({ starsCount, isLegend }: { starsCount: number; isLegend: boolean }) {
  if (starsCount === 0) return null
  const filled = starsCount === 9 ? 3 : starsCount === 6 ? 2 : 1
  if (isLegend) return (
    <div className="rounded-xl px-4 py-3 space-y-1.5" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.18), rgba(251,191,36,0.10), rgba(201,168,76,0.18))', border: '1px solid rgba(201,168,76,0.55)' }}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/verity/king.png" alt="王冠" width={28} height={28} style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.7))' }} />
        <div className="flex-1">
          <p className="text-sm font-black tracking-widest" style={{ color: '#fcd34d', letterSpacing: '0.15em' }}>LEGEND OF VERITY</p>
          <p className="text-[10px]" style={{ color: 'rgba(253,224,71,0.7)' }}>お気に入り最大9名 · LP上限100まで解放</p>
        </div>
        <div className="flex gap-0.5">
          {[0,1,2].map(i => <Star key={i} size={16} className="fill-amber-400 text-amber-400" />)}
        </div>
      </div>
    </div>
  )
  const label     = starsCount === 6 ? 'VERITY エリート' : 'VERITY マスター'
  const nextSlots = starsCount === 6 ? 9 : 6
  const nextReq   = starsCount === 6 ? 9 : 6
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-amber-500/15 to-yellow-400/10 border border-amber-400/40 px-4 py-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/verity/king.png" alt="王冠" width={22} height={22} style={{ objectFit: 'contain' }} />
      <div className="flex-1">
        <p className="text-xs font-black tracking-wider text-amber-300">{label}</p>
        <p className="text-[10px] text-amber-200/70">お気に入り最大{nextSlots}名 · あと{nextReq - starsCount}冠で次のステージ</p>
      </div>
      <div className="flex gap-0.5">
        {[0,1,2].map(i => <Star key={i} size={14} className={i < filled ? 'fill-amber-400 text-amber-400' : 'text-amber-400/25'} />)}
      </div>
    </div>
  )
}

function EpithetTag({ epithetId }: { epithetId: string }) {
  const def = EPITHET_MAP[epithetId]
  if (!def) return null
  const rs = RARITY_STYLE[def.rarity]
  return (
    <span className={['inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider', rs.textClass, rs.border, rs.bg, rs.glow].join(' ')}>
      {def.name}
    </span>
  )
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export function ProfileClient({
  user, profile, favoriteActresses, unlockedTitles, allTitleDefs,
  topGenres, genreTitle, activityTitle, totalClicks,
  crownActressIds, maxFavorites, starsCount, isLegend,
  lpBalance: initialLpBalance, lpTotalAccumulated, loginStreak, bonusResult,
  lpPointsMap: initialLpPointsMap, hasNewGalleryPosts,
  missingSnsActresses, earnedEpithetIds: initialEpithetIds,
}: Props) {
  const {
    activeTab, setActiveTab,
    hasNewGallery,
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
    unlockedIds,
    showBonus,
    dynamicTitles,
    activeTitleDef,
    earnedCount,
    totalEpithets,
    openGallery,
    saveName,
    setTitle,
    updateFavorites,
    handleLpTransfer,
    equipEpithet,
    signOut,
  } = useProfileLogic({
    profile, favoriteActresses, unlockedTitles, allTitleDefs,
    genreTitle, activityTitle,
    lpBalance: initialLpBalance,
    lpPointsMap: initialLpPointsMap,
    hasNewGalleryPosts, bonusResult,
    earnedEpithetIds: initialEpithetIds,
  })

  return (
    <>
      {showBonus && <BonusToast bonus={bonusResult.bonus!} isWeek={!!bonusResult.is_week} />}
      {newEpithetToast && <EpithetToast epithet={newEpithetToast} />}

      {/* ── タブ ── */}
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
        <button
          onClick={() => setActiveTab('profile')}
          className={['flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all', activeTab === 'profile' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'].join(' ')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/verity/king.png" alt="王冠" width={14} height={14} style={{ objectFit: 'contain' }} />
          プロフィール
        </button>
        <button
          onClick={openGallery}
          className={['relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all', activeTab === 'gallery' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'].join(' ')}
        >
          <Images size={14} />
          ギャラリー
          {hasNewGallery && <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-[var(--magenta)] shadow-[0_0_6px_rgba(226,0,116,0.8)]" />}
        </button>
      </div>

      {activeTab === 'gallery' && (
        <MyGalleryGrid
          lastCheckedAt={profile?.last_gallery_checked_at ?? null}
          favoriteActresses={favoriteActresses}
          missingSnsActresses={missingSnsActresses}
        />
      )}

      {activeTab === 'profile' && (
      <div className="space-y-8">

        {/* ── ユーザー情報 ── */}
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              <StarsDisplay starsCount={starsCount} isLegend={isLegend} />
              <div className="flex flex-wrap items-center gap-2">
                <LpBadge balance={lpBalance} />
                <StreakBadge streak={loginStreak} />
                {loginStreak > 0 && loginStreak % 7 !== 0 && (
                  <span className="text-[10px] text-[var(--text-muted)]">あと {7 - (loginStreak % 7)} 日で 🎊 ボーナス</span>
                )}
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">表示名</p>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      maxLength={30}
                      autoFocus
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--text)] focus:border-[var(--magenta)] focus:outline-none"
                    />
                    <button onClick={saveName} className="text-[var(--magenta)]"><Check size={16} /></button>
                    <button onClick={() => setEditingName(false)} className="text-[var(--text-muted)]"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-[var(--text)]">{displayName || '（未設定）'}</span>
                    {equippedEpithet && <EpithetTag epithetId={equippedEpithet} />}
                    <button onClick={() => setEditingName(true)} className="text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors">
                      <Edit2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-0.5">メールアドレス</p>
                <p className="text-sm text-[var(--text)]">{user.email}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-red-500/40 hover:text-red-400 transition-colors"
            >
              <LogOut size={13} />
              ログアウト
            </button>
          </div>
          {saveMsg && <p className="mt-3 text-xs text-emerald-400">{saveMsg}</p>}
        </section>

        {/* ── 行動傾向 ── */}
        {totalClicks > 0 && (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <TrendingUp size={15} className="text-amber-400" />
              あなたのジャンル傾向
              <span className="ml-auto text-xs font-normal text-[var(--text-muted)]">累計 {totalClicks} クリック</span>
            </h2>
            {dynamicTitles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dynamicTitles.map(def => (
                  <div key={def.id} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: 'linear-gradient(135deg, rgba(226,0,116,0.15), rgba(251,191,36,0.12))', border: '1px solid rgba(226,0,116,0.35)', color: 'var(--text)' }}>
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
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: i === 0 ? 'linear-gradient(90deg, #E20074, #ff6eb4)' : 'rgba(226,0,116,0.4)' }} />
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

        {/* ── 称号 ── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/verity/king.png" alt="王冠" width={15} height={15} style={{ objectFit: 'contain' }} />
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
                  className={['flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-all', unlocked ? isActive ? 'border-[var(--magenta)] bg-[var(--magenta)]/10 shadow-[0_0_14px_rgba(226,0,116,0.25)]' : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--magenta)]/40 cursor-pointer' : 'border-[var(--border)] bg-[var(--surface-2)] opacity-40 cursor-not-allowed'].join(' ')}
                >
                  <span className="text-2xl" role="img" aria-label={def.name}>{def.icon}</span>
                  <span className={`text-xs font-bold ${unlocked ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>{def.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] leading-tight">{def.desc}</span>
                </button>
              )
            })}
          </div>
          {unlockedTitles.filter(t => t.def.id.startsWith('actress_master_')).map(t => (
            <div key={t.def.id} className="flex items-center gap-2.5 rounded-xl border px-4 py-3 mt-1" style={{ borderColor: 'rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.08)' }}>
              <span className="text-xl">{t.def.icon}</span>
              <div>
                <p className="text-xs font-bold" style={{ color: '#fcd34d' }}>{t.def.name}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{t.def.desc}</p>
              </div>
            </div>
          ))}
          {unlockedTitles.length === 0 && <p className="text-xs text-[var(--text-muted)]">まだ称号を解除していません。</p>}
        </section>

        {/* ── 二つ名 ── */}
        <section className="space-y-3">
          <button
            onClick={() => setShowEpithets(v => !v)}
            className="flex w-full items-center gap-2 text-sm font-semibold text-[var(--text)]"
          >
            <span className="text-base">⚡</span>
            二つ名
            <span className="text-[11px] font-normal text-[var(--text-muted)]">{earnedCount} / {totalEpithets} 解放</span>
            {equippedEpithet && <EpithetTag epithetId={equippedEpithet} />}
            <ChevronDown size={14} className={`ml-auto transition-transform ${showEpithets ? 'rotate-180' : ''} text-[var(--text-muted)]`} />
          </button>
          {showEpithets && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EPITHET_DEFS.map(def => {
                const earned = epithetIds.has(def.id)
                const isWorn = equippedEpithet === def.id
                const rs     = RARITY_STYLE[def.rarity]
                return (
                  <button
                    key={def.id}
                    disabled={!earned}
                    onClick={() => earned && equipEpithet(isWorn ? null : def.id)}
                    className={['flex items-start gap-3 rounded-xl border p-3 text-left transition-all', earned ? isWorn ? `${rs.border} ${rs.bg} ${rs.glow}` : `border-[var(--border)] bg-[var(--surface)] hover:${rs.border} hover:${rs.bg}` : 'border-[var(--border)] bg-[var(--surface-2)] opacity-35 cursor-not-allowed'].join(' ')}
                    title={earned ? (isWorn ? '装備解除' : '装備する') : '未解放'}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-black ${earned ? rs.textClass : 'text-[var(--text-muted)]'}`}>{def.name}</span>
                        <span className="text-[9px] font-bold opacity-50 tracking-widest">{rs.label}</span>
                        {isWorn && <span className="text-[9px] font-black text-emerald-400 border border-emerald-400/40 rounded px-1">装備中</span>}
                      </div>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)] leading-relaxed">{def.desc}</p>
                    </div>
                    {earned && !isWorn && <span className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-60">装備</span>}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* ── お気に入り女優 ── */}
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Star size={15} className="text-[var(--magenta)]" />
            お気に入り女優
            <span className="text-xs text-[var(--text-muted)] font-normal">（最大{maxFavorites}名）</span>
          </h2>
          {starsCount === 0 && (
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              推し女優の購入/予約リンクを <strong className="text-[var(--text)]">10回以上</strong>クリック、かつ
              <strong className="text-[var(--text)]"> 30 LP 以上</strong>捧げると
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/verity/king.png" alt="王冠" width={12} height={12} className="inline mx-0.5 align-middle" style={{ objectFit: 'contain' }} />
              王冠バッジを獲得。3名全員が獲得すると <strong className="text-amber-400">VERITY マスター</strong> 解禁。
            </p>
          )}
          {isLegend && (
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(253,224,71,0.75)' }}>
              推し女優に <strong style={{ color: '#fcd34d' }}>100 LP</strong> を捧げると
              <strong style={{ color: '#fcd34d' }}> [女優名]マスター</strong> 称号が解放されます。
            </p>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-[var(--magenta)]/20 bg-[var(--magenta)]/5 px-3 py-2">
            <Sparkles size={13} className="text-[var(--magenta)] shrink-0" />
            <p className="text-[11px] text-[var(--text-muted)]">
              毎日ログインで <strong className="text-[var(--magenta)]">+1 LP</strong>、7日連続で <strong className="text-amber-400">+6 LP</strong>。LP をお気に入り女優に捧げましょう。
            </p>
          </div>
          <FavoriteActressSelector
            favorites={favActresses}
            maxFavorites={maxFavorites}
            crownActressIds={crownActressIds}
            lpBalance={lpBalance}
            lpPointsMap={lpPointsMap}
            isLegend={isLegend}
            onChange={async (ids, updatedList) => {
              if (updatedList) setFavActresses(updatedList)
              else setFavActresses(prev => {
                const map = new Map(prev.map(a => [a.id, a]))
                return ids.map(id => map.get(id)).filter(Boolean) as Actress[]
              })
              await updateFavorites(ids)
            }}
            onLpTransfer={handleLpTransfer}
          />
        </section>

        {/* ── ステータスカード ── */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">ステータスカード</h2>
          <p className="text-[11px] text-[var(--text-muted)]">SNS 投稿用の画像をダウンロードできます。</p>
          <StatusCard
            displayName={displayName || 'VERITY USER'}
            equippedEpithet={equippedEpithet}
            activeTitle={activeTitleDef}
            starsCount={starsCount}
            isLegend={isLegend}
            lpTotalAccumulated={lpTotalAccumulated}
            loginDays={profile?.login_days_count ?? 0}
            favoriteActresses={favActresses}
            crownActressIds={crownActressIds}
            lpPointsMap={lpPointsMap}
          />
        </section>

      </div>
      )}
    </>
  )
}
