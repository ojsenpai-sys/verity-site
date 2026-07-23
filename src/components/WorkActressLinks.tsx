import Link from 'next/link'
import { UserRound, ChevronRight } from 'lucide-react'
import { ActressLink } from '@/components/ActressLink'
import { actressExternalIdFromNumericId, actressPageHref } from '@/lib/actressUrl'

type MetaActress = { id: number; name: string }

type Props = {
  actresses:  MetaActress[]
  sourceCid?: string | null
  sourceSlug: string
}

/**
 * 作品ページ上部の出演女優導線。
 *   - 出演女優名を明確な内部リンク（chip）として全員表示する（人数が多くても wrap で崩れない）。
 *   - id > 0（VERITY 女優ページあり）は女優ページへ内部リンク＋ actress_click 計測。
 *     id <= 0 はタグ検索へフォールバック（女優ページ無し＝計測なし）。
 *   - 主要女優（最初の id>0）にプロフィール導線 CTA を 1 つ添える。
 *   - FANZA ボタンより目立たせない控えめなスタイル。女優情報が無ければ何も表示しない。
 */
export function WorkActressLinks({ actresses, sourceCid, sourceSlug }: Props) {
  const named = actresses.filter((a) => a.name && a.name.trim().length > 0)
  if (named.length === 0) return null

  const primary = named.find((a) => a.id > 0) ?? null

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          <UserRound size={13} className="text-[var(--magenta)]" />
          出演女優
        </span>
        {named.map((act, i) =>
          act.id > 0 ? (
            <ActressLink
              key={act.id}
              href={actressPageHref(actressExternalIdFromNumericId(act.id))}
              actressId={actressExternalIdFromNumericId(act.id)}
              actressName={act.name}
              position="work_hero_actress"
              sectionType="hero"
              slot={i}
              actressCount={named.length}
              sourceCid={sourceCid}
              sourceSlug={sourceSlug}
              className="inline-flex items-center gap-0.5 rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-2.5 py-1 text-[13px] font-semibold text-[var(--magenta)] transition-colors hover:bg-[var(--magenta)]/25"
            >
              {act.name}
              <ChevronRight size={13} className="opacity-60" />
            </ActressLink>
          ) : (
            <Link
              key={`tag-${i}`}
              href={`/?tag=${encodeURIComponent(act.name)}`}
              className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
            >
              {act.name}
            </Link>
          ),
        )}
      </div>

      {primary && (
        <ActressLink
          href={actressPageHref(actressExternalIdFromNumericId(primary.id))}
          actressId={actressExternalIdFromNumericId(primary.id)}
          actressName={primary.name}
          position="work_actress_profile_cta"
          sectionType="profile_cta"
          actressCount={named.length}
          sourceCid={sourceCid}
          sourceSlug={sourceSlug}
          className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--magenta)]"
        >
          <UserRound size={13} />
          {primary.name}のプロフィール・出演作品を見る
          <ChevronRight size={13} />
        </ActressLink>
      )}
    </section>
  )
}
