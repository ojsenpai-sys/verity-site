'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, X, Plus, Heart } from 'lucide-react'
import type { Actress } from '@/lib/types'
import { cidToCdnUrl, isBadImageUrl } from '@/lib/cidUtils'
import { NowPrinting } from '@/components/NowPrinting'
import { ProxiedImage } from '@/components/ProxiedImage'
import { CROWN_CLICK_THRESHOLD, CROWN_LP_THRESHOLD } from '@/lib/titles'

type Props = {
  favorites:         Actress[]
  maxFavorites?:     number
  crownActressIds?:  string[]
  lpBalance?:        number
  lpPointsMap?:      Record<string, number>
  isLegend?:         boolean
  onChange:          (ids: string[], updatedList?: Actress[]) => Promise<void>
  onLpTransfer?:     (actressId: string, amount: number) => Promise<void>
}

function getProxiedSrc(actress: Actress): string | null {
  const raw = isBadImageUrl(actress.image_url) ? null : actress.image_url!
  const url  = raw ?? (() => {
    const cid = actress.metadata?.latest_cid as string | undefined
    return cid ? cidToCdnUrl(cid, 'pl') : null
  })()
  if (!url) return null
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

// ── 削除確認モーダル ──────────────────────────────────────────────────────────

function ConfirmRemoveModal({
  actress,
  hasCrown,
  onConfirm,
  onCancel,
}: {
  actress:   Actress
  hasCrown:  boolean
  onConfirm: () => void
  onCancel:  () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-5"
        style={{
          background:  'linear-gradient(145deg, #161624, #1e1e30)',
          border:      hasCrown ? '1px solid rgba(251,191,36,0.5)' : '1px solid rgba(226,0,116,0.4)',
          boxShadow:   hasCrown
            ? '0 0 40px rgba(251,191,36,0.18), 0 20px 60px rgba(0,0,0,0.6)'
            : '0 0 40px rgba(226,0,116,0.15), 0 20px 60px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="text-center space-y-1.5">
          {hasCrown && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/assets/verity/king.png" alt="王冠" width={28} height={28}
              className="mx-auto mb-1"
              style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.7))' }}
            />
          )}
          <p className="text-xs tracking-widest uppercase"
            style={{ color: hasCrown ? 'rgba(251,191,36,0.7)' : 'rgba(226,0,116,0.7)' }}>
            {hasCrown ? '⚠ 王冠バッジ取得済み' : '確認'}
          </p>
          <h3 className="text-base font-bold text-[var(--text)]">
            {actress.name}さんを<br />お気に入りから削除しますか？
          </h3>
          {hasCrown && (
            <p className="text-[11px] text-amber-300/70 leading-relaxed">
              王冠バッジ取得済みの女優です。削除後も王冠の記録は保持されますが、
              LP 上限は失われます。
            </p>
          )}
        </div>

        {/* ボタン */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm
                       text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)]/40
                       transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold transition-all"
            style={{
              background:  hasCrown
                ? 'linear-gradient(135deg, rgba(239,68,68,0.85), rgba(185,28,28,0.85))'
                : 'linear-gradient(135deg, rgba(226,0,116,0.85), rgba(160,0,80,0.85))',
              border:      '1px solid rgba(239,68,68,0.5)',
              color:       '#fff',
              boxShadow:   '0 0 14px rgba(239,68,68,0.25)',
            }}
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  )
}

// ── お気に入り女優カード ────────────────────────────────────────────────────

function ActressCard({
  actress,
  onRemove,
  disabled,
  hasCrown,
  lpBalance,
  lpPoints,
  lpCap,
  onLpTransfer,
}: {
  actress:       Actress
  onRemove:      () => void
  disabled:      boolean
  hasCrown:      boolean
  lpBalance:     number
  lpPoints:      number
  lpCap:         number
  onLpTransfer?: (actressId: string, amount: number) => Promise<void>
}) {
  const imgSrc   = getProxiedSrc(actress)
  const [lpPending, setLpPending] = useState(false)

  const lpProgress  = Math.min(lpPoints / lpCap, 1)
  const canSendLp   = !disabled && !lpPending && lpPoints < lpCap

  async function sendLp(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    if (!canSendLp || !onLpTransfer) return
    setLpPending(true)
    try { await onLpTransfer(actress.id, 1) }
    finally { setLpPending(false) }
  }

  return (
    <article className={[
      'group relative flex flex-col rounded-xl border bg-[var(--surface)] overflow-hidden',
      'transition-all duration-200 hover:-translate-y-0.5',
      hasCrown
        ? 'crown-neon-frame'
        : 'border-[var(--border)] hover:border-[var(--magenta)]/60 hover:shadow-[0_0_28px_rgba(226,0,116,0.18)]',
    ].join(' ')}>

      <Link href={`/verity/actresses/${actress.external_id}`} className="block">
        <div className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
          {imgSrc ? (
            <>
              <ProxiedImage
                src={imgSrc}
                alt={actress.name}
                className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)]/80 via-transparent to-transparent" />
            </>
          ) : (
            <NowPrinting />
          )}

          {/* LP プログレスバー */}
          {!hasCrown && (
            <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5">
              <div className="h-1 w-full rounded-full bg-black/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width:      `${lpProgress * 100}%`,
                    background: 'linear-gradient(90deg, #E20074, #a855f7)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </Link>

      {/* 女優名・操作エリア */}
      <div className="border-t border-[var(--border)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/verity/actresses/${actress.external_id}`} className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5">
              {hasCrown && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/assets/verity/king.png"
                  alt="王冠バッジ"
                  width={18}
                  height={18}
                  className="shrink-0"
                  style={{ objectFit: 'contain' }}
                  title={`王冠バッジ獲得済み（購入${CROWN_CLICK_THRESHOLD}回以上 & LP${CROWN_LP_THRESHOLD}以上）`}
                />
              )}
              <p className="truncate text-sm font-semibold text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors">
                {actress.name}
              </p>
            </div>
            {actress.ruby && (
              <p className="truncate text-[10px] text-[var(--text-muted)]">{actress.ruby}</p>
            )}
          </Link>

          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove() }}
            disabled={disabled}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                       border border-[var(--border)] text-[var(--text-muted)]
                       hover:border-red-500/50 hover:text-red-400 transition-colors
                       disabled:opacity-30"
            aria-label={`${actress.name}を削除`}
          >
            <X size={11} />
          </button>
        </div>

        {/* LP 情報 & 投入ボタン */}
        <div className="mt-2 flex items-center justify-between gap-1.5">
          <span className="text-[10px] text-[var(--text-muted)]">
            💙 {lpPoints} LP
            {lpPoints < lpCap && (
              <span className="text-[var(--text-muted)]/60"> / {lpCap}</span>
            )}
          </span>

          {onLpTransfer && lpPoints < lpCap && (
            <button
              onClick={sendLp}
              disabled={!canSendLp}
              title={lpBalance < 1 ? 'LP残高不足' : `${actress.name}に +1 LP を捧げる`}
              className={[
                'flex items-center gap-0.5 rounded-full px-2 py-0.5',
                'text-[10px] font-bold border transition-all',
                canSendLp && lpBalance >= 1
                  ? 'border-[var(--magenta)]/50 text-[var(--magenta)] hover:bg-[var(--magenta)]/10'
                  : 'border-[var(--border)] text-[var(--text-muted)] opacity-50 cursor-not-allowed',
              ].join(' ')}
              aria-label={`${actress.name}に +1 LP`}
            >
              <Heart size={9} />
              +1 LP
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

// ── 空スロット ────────────────────────────────────────────────────────────────

function EmptySlot({ index }: { index: number }) {
  return (
    <article className="flex flex-col rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] overflow-hidden opacity-60">
      <div className="relative w-full aspect-[2/3] flex flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--border)]">
          <Plus size={18} />
        </div>
        <span className="text-[11px]">推し {index + 1}</span>
      </div>
      <div className="border-t border-[var(--border)] px-3 py-2.5">
        <p className="text-[11px] text-[var(--text-muted)]">未設定</p>
      </div>
    </article>
  )
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export function FavoriteActressSelector({
  favorites,
  maxFavorites = 3,
  crownActressIds = [],
  lpBalance = 0,
  lpPointsMap = {},
  isLegend = false,
  onChange,
  onLpTransfer,
}: Props) {
  const lpCap = isLegend ? 100 : CROWN_LP_THRESHOLD
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<Actress[]>([])
  const [searching, setSearching]       = useState(false)
  const [currentFavs, setCurrentFavs]   = useState<Actress[]>(favorites)
  const [saving, setSaving]             = useState(false)
  const [pendingRemove, setPendingRemove] = useState<Actress | null>(null)

  const crownSet = new Set(crownActressIds)

  useEffect(() => { setCurrentFavs(favorites) }, [favorites])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      // 検索ログ（info_hermit 二つ名用）
      fetch('/verity/api/logs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ target_type: 'search', target_id: query.trim().slice(0, 80), action_type: 'search' }),
      }).catch(() => {})
      try {
        const res = await fetch(`/verity/api/actresses?q=${encodeURIComponent(query)}&limit=10`)
        if (res.ok) {
          const data: Actress[] = await res.json()
          const favIds = new Set(currentFavs.map(f => f.id))
          setResults(data.filter(a => !favIds.has(a.id)))
        }
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, currentFavs])

  async function addFav(actress: Actress) {
    if (currentFavs.length >= maxFavorites || saving) return
    const next = [...currentFavs, actress]
    setCurrentFavs(next)
    setQuery('')
    setResults([])
    setSaving(true)
    try { await onChange(next.map(a => a.id), next) }
    finally { setSaving(false) }
  }

  function requestRemove(actress: Actress) {
    if (saving) return
    setPendingRemove(actress)
  }

  async function confirmRemove() {
    if (!pendingRemove || saving) return
    const id   = pendingRemove.id
    setPendingRemove(null)
    const next = currentFavs.filter(a => a.id !== id)
    setCurrentFavs(next)
    setSaving(true)
    try { await onChange(next.map(a => a.id), next) }
    finally { setSaving(false) }
  }

  const slotCount = Math.max(maxFavorites, currentFavs.length, 3)

  return (
    <>
      {pendingRemove && (
        <ConfirmRemoveModal
          actress={pendingRemove}
          hasCrown={crownSet.has(pendingRemove.id)}
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}

      <div className="space-y-5">
        {/* ── カードグリッド ── */}
        <div className={[
          'grid gap-3',
          slotCount <= 3 ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-3 lg:grid-cols-6',
        ].join(' ')}>
          {Array.from({ length: slotCount }).map((_, i) => {
            const actress = currentFavs[i]
            return actress
              ? <ActressCard
                  key={actress.id}
                  actress={actress}
                  onRemove={() => requestRemove(actress)}
                  disabled={saving}
                  hasCrown={crownSet.has(actress.id)}
                  lpBalance={lpBalance}
                  lpPoints={lpPointsMap[actress.id] ?? 0}
                  lpCap={lpCap}
                  onLpTransfer={onLpTransfer}
                />
              : <EmptySlot key={`empty-${i}`} index={i} />
          })}
        </div>

        {saving && <p className="text-xs text-[var(--text-muted)]">保存中…</p>}

        {/* ── 検索ボックス（上限未満のとき表示） ── */}
        {currentFavs.length < maxFavorites && (
          <div className="space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="女優名で検索…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)]
                           py-2.5 pl-9 pr-4 text-sm text-[var(--text)]
                           placeholder:text-[var(--text-muted)]/50
                           focus:border-[var(--magenta)] focus:outline-none transition-colors"
              />
            </div>

            {searching && <p className="text-xs text-[var(--text-muted)] px-1">検索中…</p>}

            {results.length > 0 && (
              <ul className="max-h-52 overflow-y-auto rounded-lg border border-[var(--border)]
                              bg-[var(--surface)] divide-y divide-[var(--border)]">
                {results.map(actress => {
                  const src = getProxiedSrc(actress)
                  return (
                    <li key={actress.id}>
                      <button
                        onClick={() => addFav(actress)}
                        disabled={saving}
                        className="flex w-full items-center gap-3 px-4 py-2.5
                                   hover:bg-[var(--surface-2)] transition-colors text-left
                                   disabled:opacity-40"
                      >
                        {src && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={src}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full object-cover object-right"
                          />
                        )}
                        <span className="text-sm text-[var(--text)]">{actress.name}</span>
                        {actress.ruby && (
                          <span className="ml-auto text-xs text-[var(--text-muted)]">{actress.ruby}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {query && !searching && results.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] px-1">
                「{query}」に一致する女優が見つかりません
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
