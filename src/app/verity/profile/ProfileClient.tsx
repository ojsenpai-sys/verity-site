'use client'

import { useState, useEffect, useCallback } from 'react'
import { LogOut, Star, TrendingUp, Flame, Sparkles, Images, ChevronDown, Clock, BarChart2, RefreshCw, Heart } from 'lucide-react'
import { FavoriteActressSelector } from '@/components/FavoriteActressSelector'
// import { MyGalleryGrid } from '@/components/MyGalleryGrid'  // SNS同期一時停止中 — API復旧後に再有効化
// import { StatusCard } from '@/components/StatusCard'  // TODO: デザイン再検討中のため一時非表示
import { EPITHET_DEFS, EPITHET_MAP, RARITY_STYLE } from '@/lib/epithets'
import type { Actress, Profile } from '@/lib/types'
import type { TitleDef, GenreStats } from '@/lib/titles'
import type { EpithetDef } from '@/lib/epithets'
import { useProfileLogic } from './hooks/useProfileLogic'
import type { UnlockedEntry } from './hooks/useProfileLogic'
import type { LoginBonusResult, ActressHistoryEntry, WorkHistoryEntry, FavoriteArticle, HistoryWork } from './page'
import { GentlemanAnalysis } from '@/components/GentlemanAnalysis'
import type { AxisScore, RecommendedProduct } from '@/components/GentlemanAnalysis'
import { LocalFavArticles } from '@/components/LocalFavArticles'
import { FanzaLink } from '@/components/FanzaLink'
import { withAffiliate } from '@/lib/affiliate'
import { GenreProfilingModal } from '@/components/GenreProfilingModal'

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
  axisScores:            AxisScore[]
  topAxis:               string | null
  recommendedProduct:    RecommendedProduct | null
  actressHistory:        ActressHistoryEntry[]
  workHistory:           WorkHistoryEntry[]
  favoriteArticles:      FavoriteArticle[]
  genreScores:           Record<string, number>
  profilingDone:         boolean
  favoritedAtMap:        Record<string, string>
}

// ── ユーティリティ ─────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (h < 1)  return 'たった今'
  if (h < 24) return `${h}時間前`
  if (d < 7)  return `${d}日前`
  if (d < 30) return `${Math.floor(d / 7)}週間前`
  return `${Math.floor(d / 30)}ヶ月前`
}

function proxiedCover(url: string | null): string {
  return url ? `/api/proxy/image?url=${encodeURIComponent(url)}` : '/assets/verity/placeholder.jpg'
}

function workFanzaHref(metadata: Record<string, unknown> | null): string | null {
  const raw = (metadata?.affiliate_url ?? metadata?.url) as string | undefined
  if (!raw) return null
  return withAffiliate(raw) ?? raw
}

// 作品行（最近見た作品 / お気に入り作品 で共用）
function WorkRow({ article, sub, position }: { article: HistoryWork; sub: string; position: string }) {
  const href = workFanzaHref(article.metadata)
  const inner = (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 hover:border-[var(--magenta)]/30 transition-colors">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxiedCover(article.image_url)}
        alt={article.title}
        className="w-10 h-14 rounded-md object-cover shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="line-clamp-2 text-sm font-medium text-[var(--text)] leading-snug">{article.title}</p>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{sub}</p>
      </div>
      {href && <span className="shrink-0 text-xs text-[var(--text-muted)]">FANZA →</span>}
    </div>
  )
  return href
    ? <FanzaLink href={href} targetId={article.external_id} position={position}>{inner}</FanzaLink>
    : inner
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

// ── 認定ジャンルバッジ ─────────────────────────────────────────────────────────
const BADGE_STYLES = [
  { bg: 'linear-gradient(135deg, rgba(226,0,116,0.25), rgba(255,110,180,0.15))', border: 'rgba(226,0,116,0.6)', text: '#ff6eb4', rank: '1st' },
  { bg: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(167,139,250,0.15))', border: 'rgba(139,92,246,0.6)', text: '#a78bfa', rank: '2nd' },
  { bg: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(96,165,250,0.15))', border: 'rgba(59,130,246,0.55)', text: '#60a5fa', rank: '3rd' },
]

function CertifiedGenreBadge({ genre, score, rank }: { genre: string; score: number; rank: number }) {
  const s = BADGE_STYLES[rank] ?? BADGE_STYLES[2]
  return (
    <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <span className="text-[9px] font-black opacity-60" style={{ color: s.text }}>{s.rank}</span>
      <span className="text-xs font-bold" style={{ color: s.text }}>{genre}</span>
      <span className="text-[10px] font-mono opacity-50" style={{ color: s.text }}>{score}pt</span>
    </div>
  )
}

function GenreBarChart({ scores }: { scores: Record<string, number> }) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 10)
  if (sorted.length === 0) return null
  const max = sorted[0][1]
  return (
    <ol className="space-y-1.5">
      {sorted.map(([genre, score], i) => {
        const pct  = Math.round((score / max) * 100)
        const s    = i < 3 ? BADGE_STYLES[i] : null
        const barColor = s
          ? `linear-gradient(90deg, ${s.border.replace('0.6', '0.8')}, ${s.border.replace('0.6', '0.4')})`
          : 'rgba(226,0,116,0.3)'
        return (
          <li key={genre} className="flex items-center gap-3 text-xs">
            <span className="w-4 text-right font-mono text-[var(--text-muted)]">{i + 1}</span>
            <span className="min-w-[72px] font-medium text-[var(--text)] truncate">{genre}</span>
            <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <span className="w-10 text-right font-mono text-[var(--text-muted)]">{score}pt</span>
          </li>
        )
      })}
    </ol>
  )
}

export function ProfileClient({
  user, profile, favoriteActresses, unlockedTitles, allTitleDefs,
  topGenres, genreTitle, activityTitle, totalClicks,
  crownActressIds, maxFavorites, starsCount, isLegend,
  lpBalance: initialLpBalance, lpTotalAccumulated, loginStreak, bonusResult,
  lpPointsMap: initialLpPointsMap, hasNewGalleryPosts,
  missingSnsActresses, earnedEpithetIds: initialEpithetIds,
  axisScores, topAxis, recommendedProduct, actressHistory,
  workHistory, favoriteArticles,
  genreScores: initialGenreScores, profilingDone: initialProfilingDone,
  favoritedAtMap,
}: Props) {
  const [showProfilingModal, setShowProfilingModal] = useState(false)
  const [localGenreScores,   setLocalGenreScores]   = useState<Record<string, number>>(initialGenreScores)

  // 初回アクセス時のみモーダルを表示（マウント後に判定してちらつきを防ぐ）
  useEffect(() => {
    if (!initialProfilingDone) {
      setShowProfilingModal(true)
    }
  }, [initialProfilingDone])

  const handleProfilingComplete = useCallback((delta: Record<string, number>) => {
    setShowProfilingModal(false)
    setLocalGenreScores(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(delta)) next[k] = (next[k] ?? 0) + v
      return next
    })
  }, [])

  const topCertified = Object.entries(localGenreScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  const {
    activeTab, setActiveTab,
    hasNewGallery,
    displayName, setDisplayName,
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
      {showProfilingModal && (
        <GenreProfilingModal
          onComplete={handleProfilingComplete}
          onSkip={() => {
            setShowProfilingModal(false)
            fetch('/verity/api/genre-scores', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ delta: {}, mark_done: true }),
            }).catch(() => {})
          }}
        />
      )}
      {showBonus && <BonusToast bonus={bonusResult.bonus!} isWeek={!!bonusResult.is_week} />}
      {newEpithetToast && <EpithetToast epithet={newEpithetToast} />}

      {/* ── 新規ユーザー向けウェルカムバナー ── */}
      {!profile?.display_name && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/30 px-4 py-3 text-sm text-rose-200 leading-relaxed">
          🎉 VERITYへようこそ！ まずはサイト内で表示されるあなたの【お名前（ニックネーム）】を入力し、最下部のボタンから保存を完了させてください。
        </div>
      )}

      {/* ── タブ（SNS同期一時停止中のためギャラリータブを非表示 — API復旧後に再有効化） ──
      <div className="flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
        <button
          onClick={() => setActiveTab('profile')}
          className={['flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all', activeTab === 'profile' ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)]'].join(' ')}
        >
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
      ── */}

      {/* ── ギャラリー（SNS同期一時停止中のため非表示 — API復旧後に再有効化） ──
      {activeTab === 'gallery' && (
        <MyGalleryGrid
          lastCheckedAt={profile?.last_gallery_checked_at ?? null}
          favoriteActresses={favoriteActresses}
          missingSnsActresses={missingSnsActresses}
        />
      )}
      ── */}

      {(
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
                <div className="flex items-center gap-2">
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    maxLength={30}
                    placeholder="ニックネームを入力"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm text-[var(--text)] focus:border-[var(--magenta)] focus:outline-none"
                  />
                  {equippedEpithet && <EpithetTag epithetId={equippedEpithet} />}
                </div>
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
          <div className="mt-4 space-y-2">
            <button
              onClick={saveName}
              disabled={isPending}
              className="w-full rounded-md bg-gradient-to-r from-pink-600 to-rose-600 py-2.5 text-sm font-bold text-white transition-all hover:from-pink-500 hover:to-rose-500 hover:shadow-[0_0_16px_rgba(225,29,72,0.4)] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {isPending ? '保存中…' : 'この内容で変更を保存する'}
            </button>
            {saveMsg && <p className="text-center text-xs text-emerald-400">{saveMsg}</p>}
          </div>
        </section>

        {/* ── 認定ジャンル ── */}
        {topCertified.length > 0 ? (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <BarChart2 size={15} className="text-[var(--magenta)]" />
                あなたの認定ジャンル
              </h2>
              <button
                onClick={() => setShowProfilingModal(true)}
                className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                title="再診断する"
              >
                <RefreshCw size={11} />
                再診断
              </button>
            </div>

            {/* TOP 3 バッジ */}
            <div className="flex flex-wrap gap-2">
              {topCertified.map(([genre, score], i) => (
                <CertifiedGenreBadge key={genre} genre={genre} score={score} rank={i} />
              ))}
            </div>

            {/* スコア分布バーチャート */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">スコア分布 TOP 10</p>
              <GenreBarChart scores={localGenreScores} />
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-6 text-center space-y-3">
            <div className="flex justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--magenta)]/20 to-purple-600/20 border border-[var(--magenta)]/30">
                <Sparkles size={18} className="text-[var(--magenta)]" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text)]">ジャンル傾向診断</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">気になる作品を直感で選ぶだけで、あなたの好みを分析します。</p>
            </div>
            <button
              onClick={() => setShowProfilingModal(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[var(--magenta)] to-purple-600 px-5 py-2 text-xs font-bold text-white hover:shadow-[0_0_16px_rgba(226,0,116,0.4)] transition-all active:scale-[0.98]"
            >
              <Sparkles size={12} />
              今すぐ診断する
            </button>
          </section>
        )}

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

        {/* ── ジェントルマン成分解析 ── */}
        <GentlemanAnalysis
          axisScores={axisScores}
          topAxis={topAxis}
          recommendedProduct={recommendedProduct}
        />

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
          {favActresses.length > 0 && (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {favActresses.map(a => {
                const searchUrl = `https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(a.name)}/`
                const href = withAffiliate(searchUrl) ?? searchUrl
                return (
                  <FanzaLink key={a.external_id} href={href} targetId={a.external_id} position="profile_fav_actress">
                    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2 hover:border-[var(--magenta)]/40 transition-colors">
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.image_url ?? '/assets/verity/placeholder.jpg'}
                          alt={a.name}
                          className="w-full h-full object-cover"
                        />
                        {crownActressIds.includes(a.id) && (
                          <span className="absolute top-0.5 right-0.5 text-[11px]">👑</span>
                        )}
                      </div>
                      <p className="w-full text-[10px] text-center text-[var(--text)] leading-tight line-clamp-2">{a.name}</p>
                    </div>
                  </FanzaLink>
                )
              })}
            </div>
          )}
          <FavoriteActressSelector
            favorites={favActresses}
            maxFavorites={maxFavorites}
            crownActressIds={crownActressIds}
            lpBalance={lpBalance}
            lpPointsMap={lpPointsMap}
            isLegend={isLegend}
            favoritedAtMap={favoritedAtMap}
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

        {/* ── お気に入り作品（DBに同期済み）。未同期/空ならローカル表示にフォールバック ── */}
        {favoriteArticles.length > 0 ? (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Heart size={14} style={{ fill: '#E20074', color: '#E20074' }} />
              お気に入り作品
              <span className="text-xs font-normal text-[var(--text-muted)]">{favoriteArticles.length}件</span>
            </h2>
            <ul className="space-y-2">
              {favoriteArticles.map(a => (
                <li key={a.external_id}>
                  <WorkRow article={a} sub={`登録 ${formatRelativeTime(a.favorited_at)}`} position="profile_fav_work_click" />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <LocalFavArticles />
        )}

        {/* ── 最近見た作品（閲覧履歴） ── */}
        {workHistory.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Clock size={15} className="text-[var(--magenta)]" />
              最近見た作品
              <span className="text-xs font-normal text-[var(--text-muted)]">直近{workHistory.length}件</span>
            </h2>
            <ul className="space-y-2">
              {workHistory.map(({ article, viewedAt }) => (
                <li key={article.external_id}>
                  <WorkRow article={article} sub={formatRelativeTime(viewedAt)} position="profile_history_work_click" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 最近チェックした女優（ディグ履歴） ── */}
        {actressHistory.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Clock size={15} className="text-[var(--magenta)]" />
              最近チェックした女優
              <span className="text-xs font-normal text-[var(--text-muted)]">直近{actressHistory.length}名</span>
            </h2>
            <ul className="space-y-2">
              {actressHistory.map(({ actress: a, visitedAt }) => {
                const searchUrl = `https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(a.name)}/`
                const href = withAffiliate(searchUrl) ?? searchUrl
                return (
                  <li key={a.external_id}>
                    <FanzaLink href={href} targetId={a.external_id} position="profile_history_click">
                      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 hover:border-[var(--magenta)]/30 transition-colors">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.image_url ?? '/assets/verity/placeholder.jpg'}
                          alt={a.name}
                          className="w-10 h-10 rounded-lg object-cover shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)] truncate">{a.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">{formatRelativeTime(visitedAt)}</p>
                        </div>
                        <span className="text-xs text-[var(--text-muted)] shrink-0">FANZA →</span>
                      </div>
                    </FanzaLink>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* ── ステータスカード（TODO: デザイン再検討中のため一時非表示） ──
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
        ── */}

      </div>
      )}
    </>
  )
}
