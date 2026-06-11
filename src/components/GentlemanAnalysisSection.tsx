import Link from 'next/link'
import { Brain, Zap, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { FanzaLink } from './FanzaLink'
import type { Article } from '@/lib/types'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

const AXIS_GENRES: Record<string, string[]> = {
  '母性・癒やし':     ['人妻', '熟女', '巨乳', 'お姉さん', '未亡人', 'ムチムチ', '豊満', 'ぽっちゃり', '人妻もの', 'Gカップ', 'Hカップ', '爆乳'],
  '刺激・スパルタ':   ['SM', '調教', '拘束', 'ハード系', '淫乱・ハード系', '凌辱', '鬼畜', 'ドM', 'ドS', 'アナル', '潮吹き', '輪姦'],
  '王道・清純':       ['美少女', '清純', '女子大生', '制服', '学生', 'キュート', '天然', '単体作品', '処女', 'キス・接吻'],
  'ギャル・セクシー': ['ギャル', 'セクシー', 'ランジェリー', 'グラビア', 'ビキニ', 'ナンパ', '痴女', 'スレンダー', 'ミニスカ', '長身'],
  'マニアック・企画': ['企画', 'アイドル', 'コスプレ', 'フェチ', '素人', 'ドキュメント', '独占配信', '女教師'],
}

type AxisScore = { axis: string; score: number }

function computeAxisScores(genreMap: Map<string, number>): AxisScore[] {
  const raw = Object.fromEntries(Object.keys(AXIS_GENRES).map(k => [k, 0]))
  for (const [tag, count] of genreMap.entries()) {
    for (const [axis, list] of Object.entries(AXIS_GENRES)) {
      if (list.includes(tag)) { raw[axis] += count; break }
    }
  }
  const max = Math.max(...Object.values(raw), 1)
  return Object.entries(raw).map(([axis, r]) => ({
    axis,
    score: Math.round((r / max) * 100),
  }))
}

type RecoArticle = Article & { affiliateUrl: string | null }

async function getRecoArticles(topAxisGenres: string[], isOverseas: boolean): Promise<RecoArticle[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .overlaps('tags', topAxisGenres)
    .lte('published_at', new Date().toISOString())
    .not('image_url', 'is', null)
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false })
    .limit(3)
  return ((data as Article[]) ?? []).map(art => {
    const meta = (art.metadata ?? {}) as Record<string, unknown>
    const rawUrl = (meta.affiliate_url ?? meta.url) as string | null
    return { ...art, affiliateUrl: withAffiliateForRegion(rawUrl, isOverseas) }
  })
}

// ── Sub-components (server-only JSX helpers) ──────────────────────────────────

function AxisBar({ axis, score, rank }: { axis: string; score: number; rank: number }) {
  const isTop    = rank === 0
  const isSec    = rank === 1
  const barColor = isTop
    ? 'linear-gradient(90deg, #E20074, #ff6eb4)'
    : isSec
    ? 'rgba(226,0,116,0.50)'
    : 'rgba(226,0,116,0.25)'

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className={[
        'w-[5.5rem] shrink-0 truncate text-right',
        isTop ? 'font-bold text-[var(--text)]' : 'text-[var(--text-muted)]',
      ].join(' ')}>
        {axis}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${score}%`, background: barColor }}
        />
      </div>
      <span className="w-6 text-right font-mono text-[var(--text-muted)]">{score}</span>
    </div>
  )
}

// ── Exported component ────────────────────────────────────────────────────────

export async function GentlemanAnalysisSection() {
  const supabase   = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOverseas = await getIsOverseasUser()

  // ── 未ログイン: ゲーミフィケーション登録CTA ───────────────────────────────
  if (!user) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-[var(--magenta)]/30 bg-gradient-to-br from-[#0a0010] via-[#12001a] to-[#0a000f] p-6 sm:p-8">
        {/* atmospheric glow spots */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute left-[10%] top-[20%] h-36 w-36 rounded-full blur-3xl" style={{ background: 'rgba(226,0,116,0.09)' }} />
          <div className="absolute right-[12%] bottom-[20%] h-28 w-28 rounded-full blur-3xl" style={{ background: 'rgba(139,92,246,0.08)' }} />
        </div>

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          {/* Left: copy */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-[var(--magenta)]" />
              <span className="text-[10px] font-black tracking-[0.2em] uppercase text-[var(--magenta)]">
                Gentleman Analysis
              </span>
            </div>

            <h2 className="text-xl font-black leading-snug text-white sm:text-2xl">
              1分で判明！
              <span
                className="block sm:inline"
                style={{
                  background: 'linear-gradient(90deg, #E20074, #ff6eb4, #fbbf24)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                あなたの性的嗜好を<br className="hidden sm:inline" />AIが暴く
              </span>
            </h2>

            <p className="text-sm leading-relaxed text-white/55">
              閲覧行動から5軸スコアを算出。あなたの「本当の性癖」を<br className="hidden sm:block" />
              可視化する独自の「ジェントルマン分析」を体験しよう。
            </p>

            <Link
              href="/verity/login?next=/verity/profile"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-6 py-2.5 text-sm font-black text-white shadow-[0_0_24px_rgba(226,0,116,0.40)] transition-all hover:brightness-110 hover:shadow-[0_0_40px_rgba(226,0,116,0.65)] active:scale-[0.97]"
            >
              <Zap size={13} />
              ジェントルマン分析を試す ▶
            </Link>
          </div>

          {/* Right: blurred preview */}
          <div className="relative mx-auto w-full max-w-[220px] select-none sm:mx-0 sm:shrink-0">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-white/30">Sample</p>
              <div className="space-y-2 blur-[3px] pointer-events-none">
                {(['王道・清純', 'ギャル・セクシー', '刺激・スパルタ', '母性・癒やし', 'マニアック・企画'] as const).map((axis, i) => (
                  <div key={axis} className="flex items-center gap-2 text-[9px]">
                    <span className="w-[5rem] text-right text-white/40">{axis}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${[88, 65, 47, 32, 20][i]}%`,
                          background: i === 0 ? 'linear-gradient(90deg,#E20074,#ff6eb4)' : 'rgba(226,0,116,0.35)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/35 backdrop-blur-[1.5px]">
              <span className="rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/15 px-3 py-1 text-[11px] font-bold text-[var(--magenta)]">
                🔒 ログインで解放
              </span>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // ── ログイン済み: ジャンルログ取得 ────────────────────────────────────────
  const { data: logRows } = await supabase
    .from('sn_user_logs')
    .select('target_id')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .eq('target_type', 'genre')

  const genreMap = new Map<string, number>()
  for (const row of (logRows ?? []) as { target_id: string }[]) {
    genreMap.set(row.target_id, (genreMap.get(row.target_id) ?? 0) + 1)
  }

  // データ蓄積前: 控えめなティーザー
  if (genreMap.size === 0) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-4">
        <Brain size={16} className="shrink-0 text-[var(--magenta)]/60" />
        <p className="text-sm text-[var(--text-muted)]">
          作品を閲覧するとあなた専用の「ジェントルマン分析」が表示されます。
        </p>
        <Link href="/verity/profile" className="ml-auto shrink-0 text-[11px] text-[var(--magenta)] hover:underline">
          マイページ →
        </Link>
      </section>
    )
  }

  const scores = computeAxisScores(genreMap)
  const sorted = [...scores].sort((a, b) => b.score - a.score)
  const topAxis = sorted[0]
  const topAxisGenres = AXIS_GENRES[topAxis.axis] ?? []

  const recoArticles = await getRecoArticles(topAxisGenres, isOverseas)

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--magenta)]/20 bg-[var(--surface)]">
      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[var(--magenta)]/60 via-purple-400/35 to-transparent" />

      <div className="p-5 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain size={15} className="text-[var(--magenta)]" />
            <h2 className="text-sm font-black tracking-wide text-[var(--text)] uppercase">
              あなたのジェントルマン分析
            </h2>
          </div>
          <Link
            href="/verity/profile"
            className="flex items-center gap-1 text-[10px] text-[var(--magenta)] hover:underline"
          >
            完全分析を見る <ArrowRight size={10} />
          </Link>
        </div>

        <div className="flex flex-col gap-5 sm:flex-row">

          {/* Axis bars */}
          <div className="flex-1 space-y-2">
            <p className="mb-3 text-[9px] uppercase tracking-widest text-[var(--text-muted)]">属性スコア</p>
            {sorted.map((a, i) => (
              <AxisBar key={a.axis} axis={a.axis} score={a.score} rank={i} />
            ))}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[9px] text-[var(--text-muted)]">最強属性</span>
              <span className="inline-flex items-center rounded-full border border-[var(--magenta)]/40 bg-[var(--magenta)]/10 px-2.5 py-0.5 text-[11px] font-black text-[var(--magenta)]">
                {topAxis.axis}
              </span>
            </div>
          </div>

          {/* 3 recommended articles */}
          {recoArticles.length > 0 && (
            <div className="sm:w-[52%] space-y-2">
              <p className="mb-3 text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
                このタイプのあなたに今夜おすすめ
              </p>
              <div className="flex gap-2">
                {recoArticles.map((art) => {
                  const proxyImg = art.image_url
                    ? `/api/proxy/image?url=${encodeURIComponent(art.image_url)}`
                    : null
                  return art.affiliateUrl ? (
                    <FanzaLink
                      key={art.id}
                      href={art.affiliateUrl}
                      targetId={art.external_id}
                      position="gentleman_recom"
                      className="group/gr relative flex-1 min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--magenta)]/50 transition-colors"
                    >
                      <div className="relative aspect-[2/3]">
                        {proxyImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={proxyImg}
                            alt={art.title}
                            className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-200 group-hover/gr:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-[var(--surface-2)]" />
                        )}
                        {/* hover overlay */}
                        <div className="pointer-events-none absolute inset-0 hidden items-end justify-center bg-black/0 pb-1.5 transition-all duration-200 group-hover/gr:bg-black/50 md:flex">
                          <span className="text-[8px] font-bold text-white opacity-0 transition-opacity duration-200 group-hover/gr:opacity-100">
                            ▶ FANZAで観る
                          </span>
                        </div>
                      </div>
                      <p className="p-1.5 text-[8px] leading-tight text-[var(--text-muted)] line-clamp-2">
                        {art.title}
                      </p>
                    </FanzaLink>
                  ) : null
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
