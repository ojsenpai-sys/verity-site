'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, X, Plus } from 'lucide-react'
import type { Actress } from '@/lib/types'
import { cidToCdnUrl, isBadImageUrl } from '@/lib/cidUtils'
import { NowPrinting } from '@/components/NowPrinting'
import { ProxiedImage } from '@/components/ProxiedImage'
import { actressColor } from '@/lib/actressColor'

type Props = {
  favorites:       Actress[]
  maxFavorites?:   number
  crownActressIds?: string[]
  onChange:        (ids: string[], updatedList?: Actress[]) => Promise<void>
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

// ── お気に入り女優カード ────────────────────────────────────────────────────

function ActressCard({
  actress,
  onRemove,
  disabled,
  hasCrown,
}: {
  actress:  Actress
  onRemove: () => void
  disabled: boolean
  hasCrown: boolean
}) {
  const imgSrc = getProxiedSrc(actress)

  return (
    <article className={[
      'group relative flex flex-col rounded-xl border bg-[var(--surface)] overflow-hidden',
      'transition-all duration-200 hover:-translate-y-0.5',
      hasCrown
        ? 'border-amber-400/60 shadow-[0_0_18px_rgba(251,191,36,0.2)] hover:border-amber-400/80'
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

          {/* 王冠バッジ */}
          {hasCrown && (
            <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center
                            rounded-full bg-amber-400/90 text-base shadow-lg"
                 title="王冠バッジ獲得済み（50ポイント達成）"
                 aria-label="王冠バッジ"
            >
              👑
            </div>
          )}
        </div>
      </Link>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2.5">
        <Link href={`/verity/actresses/${actress.external_id}`} className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ backgroundColor: actressColor(actress.name) }}
            >
              {actress.name[0]}
            </span>
            <p className="truncate text-sm font-semibold text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors">
              {actress.name}
            </p>
          </div>
          {actress.ruby && (
            <p className="truncate pl-5 text-[10px] text-[var(--text-muted)]">{actress.ruby}</p>
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
  onChange,
}: Props) {
  const [query, setQuery]             = useState('')
  const [results, setResults]         = useState<Actress[]>([])
  const [searching, setSearching]     = useState(false)
  const [currentFavs, setCurrentFavs] = useState<Actress[]>(favorites)
  const [saving, setSaving]           = useState(false)

  const crownSet = new Set(crownActressIds)

  useEffect(() => { setCurrentFavs(favorites) }, [favorites])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
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

  async function removeFav(id: string) {
    if (saving) return
    const next = currentFavs.filter(a => a.id !== id)
    setCurrentFavs(next)
    setSaving(true)
    try { await onChange(next.map(a => a.id), next) }
    finally { setSaving(false) }
  }

  // 表示スロット数: 現在の登録数と maxFavorites の大きい方（最低3）
  const slotCount = Math.max(maxFavorites, currentFavs.length, 3)

  return (
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
                onRemove={() => removeFav(actress.id)}
                disabled={saving}
                hasCrown={crownSet.has(actress.id)}
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
                      {src ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={src}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover object-right"
                        />
                      ) : (
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: actressColor(actress.name) }}
                        >
                          {actress.name[0]}
                        </span>
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
  )
}
