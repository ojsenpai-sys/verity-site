'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Trash2 } from 'lucide-react'
import { ProxiedImage } from '@/components/ProxiedImage'
import { FanzaLink } from '@/components/FanzaLink'
import { withAffiliate } from '@/lib/affiliate'
import { cidToCdnUrl, coverPosClass, isBadImageUrl } from '@/lib/cidUtils'
import {
  readRecentWorks,
  clearRecentWorks,
  RECENT_CHANGED_EVENT,
  type RecentWork,
} from '@/lib/recentWorks'

/** 表示件数の上限（履歴保存は 10 件、表示は最大 6 件）。 */
const DISPLAY_MAX = 6

function proxyUrl(url: string): string {
  return `/api/proxy/image?url=${encodeURIComponent(url)}`
}

/** スナップショット画像が壊れていれば CID から CDN URL を再構築する。 */
function imageFor(item: RecentWork): string {
  if (!isBadImageUrl(item.img)) return item.img!
  return cidToCdnUrl(item.cid, 'pl')
}

type Props = {
  /** 配置場所。placement（fanza_click の position）と source_page メタデータに反映される。 */
  source: 'home' | 'work_page'
  /** 現在閲覧中の作品 CID。関連表示から除外する（作品ページ用）。 */
  excludeCid?: string
}

/**
 * 「最近見た作品」セクション。
 *
 *   - localStorage のみを参照するクライアント専用コンポーネント。
 *   - SSR / ハイドレーション時は必ず null を返し（mounted=false）、hydration error を避ける。
 *   - 履歴 0 件・現在の作品を除外した結果 0 件の場合は何も描画しない（空セクションを出さない）。
 *   - カードクリックは既存 fanza_click を再利用し、placement（position）に
 *     recently_viewed_home / recently_viewed_work_page を付与する。新規イベント名は追加しない
 *     ため Human v2/v3 の判定ロジックには影響しない。
 */
export function RecentlyViewedSection({ source, excludeCid }: Props) {
  const [items, setItems] = useState<RecentWork[]>([])
  const [mounted, setMounted] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const refresh = useCallback(() => setItems(readRecentWorks()), [])

  useEffect(() => {
    refresh()
    setMounted(true)
    // 同一タブ内の変更（RECENT_CHANGED_EVENT）と別タブ変更（storage）の双方に追随する。
    const onChange = () => refresh()
    window.addEventListener(RECENT_CHANGED_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(RECENT_CHANGED_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [refresh])

  // SSR と初回クライアントレンダは常に null で一致させる（レイアウトシフト/hydration error 回避）。
  if (!mounted) return null

  const display = items
    .filter((it) => !excludeCid || it.cid !== excludeCid)
    .slice(0, DISPLAY_MAX)

  if (display.length === 0) return null

  const placement  = source === 'home' ? 'recently_viewed_home' : 'recently_viewed_work_page'
  const sourcePage = source === 'home' ? 'home' : 'work_page'

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    clearRecentWorks()
    setConfirmClear(false)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clock size={15} className="text-[var(--magenta)]" />
          <h2 className="text-base font-bold tracking-tight text-[var(--text)]">
            最近見た作品
          </h2>
          <span className="rounded-full bg-[var(--magenta)]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--magenta)]">
            History
          </span>
        </div>

        {/* 削除は誤操作しにくい 2 段階確認 UI（1 回目=確認表示 / 2 回目=実行） */}
        {confirmClear ? (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-[var(--text-muted)]">削除しますか？</span>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full bg-[var(--magenta)] px-2.5 py-1 font-bold text-white transition-colors hover:brightness-110"
            >
              削除する
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--magenta)]"
          >
            <Trash2 size={12} />
            閲覧履歴を削除
          </button>
        )}
      </div>

      {/* モバイルは横スクロール / sm 以上はグリッド */}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-6">
        {display.map((item, i) => {
          const rawImg = imageFor(item)
          const img    = proxyUrl(rawImg)
          const fanza  = withAffiliate(item.fz ?? null)

          const imageEl = (
            <ProxiedImage
              src={img}
              alt={item.title}
              loading="lazy"
              className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(rawImg)} transition-transform duration-300 group-hover/img:scale-[1.05]`}
            />
          )

          const imageBox = fanza ? (
            <FanzaLink
              href={fanza}
              targetId={item.cid}
              position={placement}
              meta={{ slot: i, src: sourcePage, hist: items.length }}
              ariaLabel={item.title}
              className="group/img relative block aspect-[2/3] overflow-hidden rounded-lg bg-[var(--surface-2)]"
            >
              {imageEl}
              <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover/img:bg-black/55 md:flex">
                <span className="translate-y-1 scale-95 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold text-gray-900 opacity-0 shadow transition-all duration-200 group-hover/img:translate-y-0 group-hover/img:scale-100 group-hover/img:opacity-100">
                  ▶ FANZAで観る
                </span>
              </div>
            </FanzaLink>
          ) : (
            <Link
              href={`/verity/articles/${item.slug}`}
              aria-label={item.title}
              className="group/img relative block aspect-[2/3] overflow-hidden rounded-lg bg-[var(--surface-2)]"
            >
              {imageEl}
            </Link>
          )

          return (
            <div key={item.cid} className="flex w-32 shrink-0 flex-col gap-1.5 sm:w-auto">
              {imageBox}
              <Link
                href={`/verity/articles/${item.slug}`}
                className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--text)] transition-colors hover:text-[var(--magenta)]"
              >
                {item.title}
              </Link>
              {item.actress && (
                <span className="line-clamp-1 text-[10px] text-[var(--text-muted)]">
                  {item.actress}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
