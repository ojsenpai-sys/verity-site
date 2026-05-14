import { ExternalLink } from 'lucide-react'

// ─── Chart math ──────────────────────────────────────────────────────────────

const AXES = [
  { label: '演技力',    value: 5 },
  { label: '官能度',    value: 5 },
  { label: '映像美',    value: 4 },
  { label: 'フェチ属性', value: 5 },
  { label: 'ルックス',  value: 5 },
  { label: '中毒性',    value: 4 },
] as const

const MAX = 5
const N   = AXES.length
const CX  = 150
const CY  = 150
const R   = 88

function rad(i: number) { return (i * 2 * Math.PI) / N - Math.PI / 2 }
function pt(i: number, r: number) {
  return [CX + r * Math.cos(rad(i)), CY + r * Math.sin(rad(i))] as const
}
function poly(vals: readonly number[]) {
  return vals.map((v, i) => {
    const [x, y] = pt(i, (v / MAX) * R)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}
function gridPoly(level: number) {
  return Array.from({ length: N }, (_, i) => {
    const [x, y] = pt(i, (level / MAX) * R)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}
function labelPos(i: number) {
  const [x, y] = pt(i, R + 24)
  const cos = Math.cos(rad(i))
  const sin = Math.sin(rad(i))
  return {
    x,
    y: y + (sin < -0.3 ? 0 : sin > 0.3 ? 12 : 4),
    anchor: (cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle') as 'start' | 'end' | 'middle',
  }
}

const CHART_POINTS = poly(AXES.map(a => a.value))
const GRID_LEVELS  = [1, 2, 3, 4, 5] as const

// ─── Asset ───────────────────────────────────────────────────────────────────

const CID         = 'hmn00849'
// pl.jpg = canonical URL。proxy は pl.jpg を優先し front-cover 右側を object-right で表示する。
const PROXY       = `/api/proxy/image?url=${encodeURIComponent(
  `https://pics.dmm.co.jp/digital/video/${CID}/${CID}pl.jpg`
)}`
const PRODUCT_URL = `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${CID}/`

// ─── Component ───────────────────────────────────────────────────────────────

export function MustOneSection() {
  const siteAffId = process.env.DMM_SITE_AFFILIATE_ID
  const ctaUrl = siteAffId
    ? `https://al.dmm.co.jp/?lurl=${encodeURIComponent(PRODUCT_URL)}&af_id=${encodeURIComponent(siteAffId)}&ch=sp_verity`
    : PRODUCT_URL

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]
                        shadow-[0_0_60px_rgba(226,0,116,0.15)]">

      {/* ── Atmospheric background ────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PROXY} alt=""
          className="h-full w-full scale-125 object-cover object-right blur-3xl opacity-[0.07]"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--surface)]/95 via-[var(--surface)]/80 to-[var(--magenta)]/8" />
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[var(--magenta)]/10 blur-3xl" />
      </div>

      {/* Top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px
                      bg-gradient-to-r from-transparent via-[var(--magenta)]/50 to-transparent" />

      {/* ── Badge ─────────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-3 border-b border-[var(--border)] px-5 py-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/verity/king.png" alt="王冠" width={14} height={14} className="shrink-0" style={{ objectFit: 'contain' }} />
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--magenta)]">
            The Must One
          </span>
          <span className="text-[10px] tracking-wide text-[var(--text-muted)]">
            VERITYが選ぶ今月の一本
          </span>
        </div>
        <span className="ml-auto shrink-0 text-[9px] tracking-[0.2em] uppercase text-[var(--text-muted)]">
          Editor's Pick
        </span>
      </div>

      {/* ── Body: flex-col mobile / flex-row desktop ───────────────────────── */}
      <div className="relative flex flex-col items-center gap-5 px-5 py-6
                      md:flex-row md:items-start md:gap-7 md:px-7 md:py-7">

        {/* ── Image: ArticleCard と同一ロジック (aspect-[2/3] + object-cover object-right) ── */}
        <div className="mx-auto w-full max-w-[170px] shrink-0 md:mx-0 md:w-[190px] md:max-w-none">
          <div className="relative aspect-[2/3] overflow-hidden rounded-xl
                          bg-[var(--surface-2)] shadow-[0_8px_28px_rgba(0,0,0,0.7)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={PROXY}
              alt={`彩月七緒 ${CID}`}
              className="absolute inset-0 h-full w-full object-cover object-right"
            />
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex w-full min-w-0 flex-col gap-4">

          {/* Title + Score */}
          <div className="space-y-2.5">
            <div className="space-y-1">
              <p className="text-[9px] tracking-[0.25em] uppercase text-[var(--text-muted)]">
                {CID}
              </p>
              <h2 className="text-[13px] font-semibold leading-relaxed text-[var(--text)]">
                会社で厳しいスパルタ女上司がまさかのニコニコソープ嬢！！いつも鬼コワなのに全肯定でよちよち甘やかし赤ちゃんプレイで爆ヌキ連射中出し20発 彩月七緒
              </h2>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-base tracking-widest text-[var(--magenta)]">★★★★☆</span>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--text)]">
                Verity Score
              </span>
              <span className="text-xs text-[var(--text-muted)]">4.5 / 5.0</span>
            </div>
          </div>

          {/* Chart + Review: stacked mobile / side-by-side desktop */}
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[auto_1fr] md:gap-6">

            {/* Radar chart */}
            <div className="flex justify-center md:justify-start">
              <svg
                viewBox="0 0 300 300"
                className="w-full max-w-[200px] shrink-0 md:w-[190px]"
                aria-hidden="true"
              >
                <defs>
                  <radialGradient id="mustOneGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stopColor="#E20074" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#E20074" stopOpacity="0.12" />
                  </radialGradient>
                </defs>

                {GRID_LEVELS.map(lv => (
                  <polygon key={lv}
                    points={gridPoly(lv)}
                    fill="none"
                    stroke={lv === MAX ? '#3a3a50' : '#222230'}
                    strokeWidth={lv === MAX ? '1.2' : '0.7'}
                  />
                ))}

                {AXES.map((_, i) => {
                  const [ex, ey] = pt(i, R)
                  return (
                    <line key={i}
                      x1={CX} y1={CY}
                      x2={ex.toFixed(2)} y2={ey.toFixed(2)}
                      stroke="#2a2a3a" strokeWidth="0.7"
                    />
                  )
                })}

                <polygon
                  points={CHART_POINTS}
                  fill="url(#mustOneGrad)"
                  stroke="#E20074"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />

                {AXES.map((axis, i) => {
                  const [dx, dy] = pt(i, (axis.value / MAX) * R)
                  return (
                    <circle key={i}
                      cx={dx.toFixed(2)} cy={dy.toFixed(2)}
                      r="3.2" fill="#E20074" stroke="#0a0a0f" strokeWidth="1.5"
                    />
                  )
                })}

                {AXES.map((axis, i) => {
                  const lp = labelPos(i)
                  return (
                    <text key={i}
                      x={lp.x.toFixed(2)} y={lp.y.toFixed(2)}
                      textAnchor={lp.anchor} fontSize="8.5"
                      fill="#8888aa"
                      fontFamily="var(--font-geist-sans), system-ui, sans-serif"
                    >
                      {axis.label}
                    </text>
                  )
                })}
              </svg>
            </div>

            {/* Review + CTA */}
            <div className="flex flex-col gap-4">
              <blockquote className="border-l-2 border-[var(--magenta)]/40 pl-4">
                <p className="text-sm leading-[2.1] tracking-[0.01em] text-[var(--text-muted)]">
                  ギャップの暴力。スパルタ上司による「甘やかし」という新境地を、彩月七緒が完璧に体現している。ソープものとしての完成度・没入感も極めて高く、連続射精という夢のシチュエーションを存分に堪能できるだろう。彼女から溢れ出る母性も相まって、複数ジャンルの魅力が凝縮された中毒性溢れる一冊（一本）に仕上がっている。
                </p>
                <footer className="mt-2.5 text-[10px] tracking-wider uppercase text-[var(--magenta)]/70">
                  — Verity Editorial, 2025
                </footer>
              </blockquote>

              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full
                           bg-[var(--magenta)] px-6 py-2.5 text-sm font-bold text-white
                           shadow-[0_0_20px_rgba(226,0,116,0.45)]
                           transition-all duration-200
                           hover:brightness-110 hover:shadow-[0_0_36px_rgba(226,0,116,0.7)]
                           active:scale-[0.97]"
              >
                この作品をチェックする
                <ExternalLink size={13} />
              </a>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
