import Link from 'next/link'
import { Flame, ExternalLink, ChevronRight } from 'lucide-react'
import { FanzaLink } from '@/components/FanzaLink'
import { ProxiedImage } from '@/components/ProxiedImage'
import { coverPosClass } from '@/lib/cidUtils'
import { getFastestReleasesSections } from '@/lib/fastestReleases'

export async function FastestNewReleases() {
  const makerSections = await getFastestReleasesSections()

  if (!makerSections.length) return null

  return (
    <section id="fastest-new-releases" className="space-y-8">
      {/* ── ヘッダー ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-orange-500 to-red-600" />
          <Flame size={18} className="text-orange-400 animate-pulse" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
            最新作最速更新情報
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/15 px-2.5 py-0.5 text-[10px] font-black text-red-400 border border-red-600/30">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            NEW
          </span>
        </div>
        <p className="pl-6 text-[11px] tracking-wide text-[var(--text-muted)]">
          解禁されたばかりの最旬注目作を最速でお届け！
        </p>
      </div>

      {/* ── メーカー別セクション ─────────────────────────────────────── */}
      {makerSections.map((section) => (
        <div key={section.id} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[10px] font-bold text-orange-400 border border-orange-500/30 tracking-wider">
              {section.label}
            </span>
            <Link
              href={section.moreUrl}
              className="flex items-center gap-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
            >
              {section.label}の作品をもっと見る
              <ChevronRight size={12} />
            </Link>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
            {section.cards.map((card) => {
              const { imgSrc, href, actressName } = card

              return (
                <div
                  key={card.cid}
                  className="shrink-0 w-36 sm:w-auto snap-start rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] flex flex-col group transition-colors hover:border-orange-500/40 hover:shadow-md"
                >
                  {/* ── 表紙画像（FanzaLink直行） ─────────────────────── */}
                  {href ? (
                    <FanzaLink
                      href={href}
                      targetId={card.cid}
                      position="fastest_new_releases"
                      className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]"
                    >
                      <ProxiedImage
                        src={imgSrc}
                        alt={card.title || card.cid}
                        className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(card.coverUrl)} transition-transform duration-300 ease-out group-hover:scale-105`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <span className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-black tracking-widest bg-red-600 text-white shadow-lg">
                        NEW
                      </span>
                      {actressName && (
                        <span className="absolute bottom-2 left-2 right-2 truncate rounded px-2 py-0.5 text-[10px] font-bold bg-black/70 text-white backdrop-blur-sm text-center">
                          {actressName}
                        </span>
                      )}
                      {/* ホバーオーバーレイ（PCのみ） */}
                      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/0 transition-all duration-200 group-hover:bg-black/60 md:flex">
                        <span className="translate-y-1 scale-95 rounded-full bg-white/90 px-4 py-1.5 text-[11px] font-bold text-gray-900 opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
                          ▶ FANZAで観る
                        </span>
                      </div>
                    </FanzaLink>
                  ) : (
                    <div className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
                      <ProxiedImage
                        src={imgSrc}
                        alt={card.title || card.cid}
                        className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(card.coverUrl)}`}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      <span className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[9px] font-black tracking-widest bg-red-600 text-white shadow-lg">
                        NEW
                      </span>
                      {actressName && (
                        <span className="absolute bottom-2 left-2 right-2 truncate rounded px-2 py-0.5 text-[10px] font-bold bg-black/70 text-white backdrop-blur-sm text-center">
                          {actressName}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ── テキストエリア ────────────────────────────────── */}
                  <div className="flex flex-1 flex-col gap-2.5 p-3">
                    {card.title && (
                      card.slug ? (
                        <Link href={`/verity/articles/${card.slug}`}>
                          <p className="flex-1 text-[11px] font-medium leading-snug text-[var(--text)] line-clamp-3 hover:text-[var(--magenta)] transition-colors">
                            {card.title}
                          </p>
                        </Link>
                      ) : (
                        <p className="flex-1 text-[11px] font-medium leading-snug text-[var(--text)] line-clamp-3">
                          {card.title}
                        </p>
                      )
                    )}
                    {href ? (
                      <FanzaLink
                        href={href}
                        targetId={card.cid}
                        position="fastest_new_releases_cta"
                        className="mt-auto flex items-center justify-center gap-1.5 w-full rounded-lg py-2 text-[10px] font-bold tracking-wider bg-gradient-to-r from-orange-500 to-red-600 text-white hover:from-orange-400 hover:to-red-500 transition-all shadow-sm"
                      >
                        <ExternalLink size={10} />
                        今すぐ観る
                      </FanzaLink>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
