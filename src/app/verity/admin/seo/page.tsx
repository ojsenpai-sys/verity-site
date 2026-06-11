export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { Metadata } from 'next'
import { ExternalLink, Search, TrendingUp, AlertTriangle, CheckCircle, Copy, Edit3, Eye } from 'lucide-react'
import {
  getSearchConsoleData,
  getImprovementBadges,
  isTreasure,
  opportunityScore,
  suggestTitle,
  TREASURE_CONFIG,
  type SearchConsoleRow,
} from '@/lib/googleSearchConsole'

export const metadata: Metadata = { title: 'SEO改善ボード — VERITY Admin' }

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

// ── URLからページ種別を判定 ───────────────────────────────────────────────────
function classifyPage(page: string): { type: 'actress' | 'article' | 'top' | 'list' | 'other'; slug: string | null; actressId: string | null } {
  const path = page.startsWith('http') ? new URL(page).pathname : page

  const actressMatch = path.match(/\/actresses\/(dmm-actress-[\w-]+)/)
  if (actressMatch) return { type: 'actress', slug: null, actressId: actressMatch[1] }

  const articleMatch = path.match(/\/articles\/([\w-]+)/)
  if (articleMatch) return { type: 'article', slug: articleMatch[1], actressId: null }

  if (path === '/verity/' || path === '/verity' || path === '/') return { type: 'top', slug: null, actressId: null }
  if (path.includes('/actresses')) return { type: 'list', slug: null, actressId: null }

  return { type: 'other', slug: null, actressId: null }
}

function displayPath(page: string): string {
  try {
    const url  = page.startsWith('http') ? new URL(page) : null
    const path = url ? url.pathname : page
    if (path === '/verity/' || path === '/verity') return 'トップページ'
    if (path.endsWith('/actresses'))               return '女優一覧'
    const actressId = path.match(/dmm-actress-(\d+)/)?.[1]
    if (actressId) return `女優ページ #${actressId}`
    const slug = path.match(/\/articles\/([^/]+)/)?.[1]
    if (slug) return `記事: ${slug.slice(0, 24)}…`
    return path.replace('/verity', '')
  } catch {
    return page.slice(0, 30)
  }
}

function buildPageUrl(page: string): string {
  if (page.startsWith('http')) return page
  return `${SITE_ORIGIN}${page}`
}

function buildEditUrl(page: string): string | null {
  const { type, slug } = classifyPage(page)
  if (type === 'article' && slug) return `/verity/admin/news/${slug}/edit`
  return null
}

// ── CTR の色 ─────────────────────────────────────────────────────────────────
function ctrColor(ctr: number): string {
  if (ctr >= 0.05)  return '#aaff00'
  if (ctr >= 0.02)  return '#00ffc8'
  if (ctr >= 0.01)  return '#fbbf24'
  if (ctr >= 0.005) return '#fb923c'
  return '#ff5533'
}

// ── 順位の色 ─────────────────────────────────────────────────────────────────
function posColor(pos: number): string {
  if (pos <= 3)  return '#aaff00'
  if (pos <= 10) return '#00ffc8'
  if (pos <= 15) return '#fbbf24'
  return 'var(--text-muted)'
}

// ── ページ ────────────────────────────────────────────────────────────────────
export default async function SeoPage() {
  const { rows, isMock } = await getSearchConsoleData()

  // 穴場フィルタ → 機会スコア順
  const treasureRows: SearchConsoleRow[] = rows
    .filter(isTreasure)
    .sort((a, b) => opportunityScore(b) - opportunityScore(a))
    .slice(0, 15)

  // 全体の平均CTR（健全な行も含む）
  const avgCtr = rows.length > 0
    ? rows.reduce((s, r) => s + r.ctr, 0) / rows.length
    : 0

  // サマリー統計
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0)
  const totalClicks      = rows.reduce((s, r) => s + r.clicks, 0)
  const globalCtr        = totalImpressions > 0 ? totalClicks / totalImpressions : 0
  const totalTreasure    = rows.filter(isTreasure).length

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">

      {/* ── ヘッダー ──────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(34,204,255,0.12)', border: '1px solid rgba(34,204,255,0.3)' }}>
              <Search size={15} style={{ color: '#22ccff' }} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black tracking-tight" style={{ color: '#22ccff' }}>
                  SEO改善お宝ボード
                </h1>
                <span className="rounded px-1.5 py-0.5 text-[8px] font-black tracking-widest uppercase" style={{ background: 'rgba(34,204,255,0.15)', color: '#22ccff', border: '1px solid rgba(34,204,255,0.3)' }}>
                  Search Console
                </span>
                {isMock && (
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>
                    デモデータ（API未接続）
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">Google Search Console 直近30日 — 穴場キーワード抽出</p>
            </div>
          </div>
          {/* 接続状態バッジ */}
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: isMock ? 'rgba(251,191,36,0.06)' : 'rgba(170,255,0,0.06)', border: `1px solid ${isMock ? 'rgba(251,191,36,0.2)' : 'rgba(170,255,0,0.2)'}` }}>
            {isMock
              ? <AlertTriangle size={13} style={{ color: '#fbbf24' }} />
              : <CheckCircle  size={13} style={{ color: '#aaff00' }} />}
            <span className="text-[10px] font-bold" style={{ color: isMock ? '#fbbf24' : '#aaff00' }}>
              {isMock ? 'モック（API Key未設定）' : 'Search Console 接続済み'}
            </span>
          </div>
        </div>
        <div className="h-px w-full" style={{ background: 'linear-gradient(to right, #22ccff 0%, rgba(34,204,255,0.4) 25%, rgba(34,204,255,0.1) 60%, transparent 100%)' }} />
      </div>

      {/* ── API接続ガイド（モック時のみ） ─────────────────────────────────── */}
      {isMock && (
        <div className="rounded-xl p-5 space-y-3" style={{ border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.04)' }}>
          <p className="text-xs font-bold" style={{ color: '#fbbf24' }}>Google Search Console API を接続するには</p>
          <ol className="space-y-1.5 text-[11px] text-[var(--text-muted)] list-decimal list-inside">
            <li>Google Cloud Console でサービスアカウントを作成し、JSONキーをダウンロード</li>
            <li>Search Console でそのサービスアカウントのメールアドレスを「閲覧者」として追加</li>
            <li>.env.local に以下の2変数を設定して再起動</li>
          </ol>
          <pre className="rounded-lg p-3 text-[10px] leading-relaxed" style={{ background: 'rgba(0,0,0,0.5)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.15)' }}>{`GOOGLE_SC_SERVICE_ACCOUNT_JSON='{"type":"service_account","client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",...}'
GOOGLE_SC_SITE_URL=https://verity-official.com/`}</pre>
        </div>
      )}

      {/* ── KPIサマリー ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '総表示回数',    value: totalImpressions.toLocaleString(), color: '#22ccff', sub: '直近30日' },
          { label: '総クリック数',  value: totalClicks.toLocaleString(),      color: '#aaff00', sub: '直近30日' },
          { label: '全体CTR',       value: `${(globalCtr * 100).toFixed(2)}%`, color: globalCtr >= 0.03 ? '#aaff00' : globalCtr >= 0.01 ? '#fbbf24' : '#ff5533', sub: '目標: 3%+' },
          { label: '穴場キーワード', value: `${totalTreasure}件`,              color: '#ff5533', sub: '要対応数' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="rounded-xl p-4 space-y-1" style={{ background: `linear-gradient(135deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 90%, ${color}) 100%)`, border: `1px solid ${color}28` }}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
            <p className="text-2xl font-black tabular-nums leading-none" style={{ color }}>{value}</p>
            <p className="text-[9px] text-[var(--text-muted)]">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── 穴場抽出アルゴリズム説明 ─────────────────────────────────────── */}
      <div className="rounded-xl px-5 py-4 flex flex-wrap items-center gap-4" style={{ border: '1px solid rgba(34,204,255,0.15)', background: 'rgba(34,204,255,0.04)' }}>
        <Search size={14} style={{ color: '#22ccff', flexShrink: 0 }} />
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className="text-[var(--text-muted)]">穴場抽出条件:</span>
          <span className="rounded px-2 py-0.5 font-bold" style={{ background: 'rgba(170,255,0,0.1)', color: '#aaff00', border: '1px solid rgba(170,255,0,0.2)' }}>
            掲載順位 ≤ {TREASURE_CONFIG.maxPosition}位
          </span>
          <span className="rounded px-2 py-0.5 font-bold" style={{ background: 'rgba(170,170,255,0.1)', color: '#aa77ff', border: '1px solid rgba(170,170,255,0.2)' }}>
            表示回数 ≥ {TREASURE_CONFIG.minImpressions}
          </span>
          <span className="rounded px-2 py-0.5 font-bold" style={{ background: 'rgba(255,85,51,0.1)', color: '#ff5533', border: '1px solid rgba(255,85,51,0.2)' }}>
            CTR {'<'} {(TREASURE_CONFIG.maxCtr * 100).toFixed(0)}%
          </span>
          <span className="text-[var(--text-muted)] ml-1">→ 機会スコア = 想定クリック数（CTR 3%時）− 現在のクリック数</span>
        </div>
      </div>

      {/* ── 穴場キーワードテーブル ────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#ff5533' }}>
            <TrendingUp size={12} /> 穴場キーワード TOP{treasureRows.length}（改善ポテンシャル順）
          </h2>
          <span className="text-[9px] text-[var(--text-muted)]">平均CTR: {(avgCtr * 100).toFixed(2)}%</span>
        </div>

        {treasureRows.length === 0 ? (
          <div className="rounded-xl px-6 py-12 text-center" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <CheckCircle size={24} className="mx-auto mb-3" style={{ color: '#aaff00' }} />
            <p className="text-sm font-bold" style={{ color: '#aaff00' }}>穴場キーワードなし</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">すべてのページが健全なCTRを維持しています</p>
          </div>
        ) : (
          <div className="space-y-2">
            {treasureRows.map((row, i) => {
              const badges   = getImprovementBadges(row)
              const oScore   = opportunityScore(row)
              const pageInfo = classifyPage(row.page)
              const editUrl  = buildEditUrl(row.page)
              const pageUrl  = buildPageUrl(row.page)
              const suggest  = suggestTitle(row.query, row.page)
              const isTop3   = i < 3

              return (
                <div
                  key={`${row.query}-${row.page}`}
                  className="rounded-xl overflow-hidden"
                  style={{
                    border:     isTop3 ? '1px solid rgba(255,85,51,0.35)' : '1px solid var(--border)',
                    background: isTop3 ? 'rgba(255,85,51,0.04)' : 'var(--surface)',
                  }}
                >
                  {/* メイン行 */}
                  <div className="grid gap-x-3 px-5 py-3.5 items-start"
                    style={{ gridTemplateColumns: '1.5rem 1fr 5rem 5rem 5rem 5rem' }}>

                    {/* 順位番号 */}
                    <span className="mt-0.5 text-xs font-black tabular-nums text-right"
                      style={{ color: isTop3 ? '#ff5533' : 'var(--text-muted)' }}>
                      {i + 1}
                    </span>

                    {/* 検索クエリ + バッジ + ページ */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[var(--text)]">{row.query}</p>
                        {badges.map(b => (
                          <span
                            key={b.label}
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black"
                            style={{ background: `${b.color}15`, color: b.color, border: `1px solid ${b.color}35` }}
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                        <span className="rounded px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {pageInfo.type === 'actress' ? '女優ページ' : pageInfo.type === 'article' ? '記事' : pageInfo.type === 'top' ? 'TOP' : pageInfo.type === 'list' ? '一覧' : 'その他'}
                        </span>
                        <span className="truncate opacity-60">{displayPath(row.page)}</span>
                      </div>
                    </div>

                    {/* 表示回数 */}
                    <div className="text-right space-y-0.5 mt-0.5">
                      <p className="text-[9px] text-[var(--text-muted)] uppercase">表示回数</p>
                      <p className="text-sm font-black tabular-nums" style={{ color: '#22ccff' }}>
                        {row.impressions.toLocaleString()}
                      </p>
                    </div>

                    {/* CTR */}
                    <div className="text-right space-y-0.5 mt-0.5">
                      <p className="text-[9px] text-[var(--text-muted)] uppercase">CTR</p>
                      <p className="text-sm font-black tabular-nums" style={{ color: ctrColor(row.ctr) }}>
                        {(row.ctr * 100).toFixed(2)}%
                      </p>
                    </div>

                    {/* 平均順位 */}
                    <div className="text-right space-y-0.5 mt-0.5">
                      <p className="text-[9px] text-[var(--text-muted)] uppercase">平均順位</p>
                      <p className="text-sm font-black tabular-nums" style={{ color: posColor(row.position) }}>
                        {row.position.toFixed(1)}位
                      </p>
                    </div>

                    {/* 機会スコア */}
                    <div className="text-right space-y-0.5 mt-0.5">
                      <p className="text-[9px] text-[var(--text-muted)] uppercase">機会</p>
                      <p className="text-sm font-black tabular-nums" style={{ color: oScore >= 10 ? '#ff5533' : '#fbbf24' }}>
                        +{oScore}
                        <span className="text-[8px] font-normal opacity-60 ml-0.5">click</span>
                      </p>
                    </div>
                  </div>

                  {/* タイトル改善提案 + アクションバー */}
                  <div className="px-5 py-3 flex flex-wrap items-start gap-3 border-t border-[var(--border)]"
                    style={{ background: 'rgba(0,0,0,0.2)' }}>

                    {/* 改善提案タイトル */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-[8px] font-bold uppercase tracking-widest" style={{ color: '#22ccff' }}>
                        タイトル改善案
                      </p>
                      <p className="text-[11px] leading-snug text-[var(--text-muted)] italic">
                        「{suggest}」
                      </p>
                    </div>

                    {/* アクションリンク群 */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* ページを開く */}
                      <a
                        href={pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all hover:brightness-110"
                        style={{ background: 'rgba(34,204,255,0.1)', border: '1px solid rgba(34,204,255,0.25)', color: '#22ccff' }}
                      >
                        <Eye size={11} />
                        ページ確認
                      </a>

                      {/* 記事編集（article のみ） */}
                      {editUrl && (
                        <a
                          href={editUrl}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all hover:brightness-110"
                          style={{ background: 'rgba(170,255,0,0.1)', border: '1px solid rgba(170,255,0,0.25)', color: '#aaff00' }}
                        >
                          <Edit3 size={11} />
                          タイトルを最適化
                        </a>
                      )}

                      {/* 女優ページ向け（DB編集が必要な旨を示す） */}
                      {pageInfo.type === 'actress' && !editUrl && (
                        <a
                          href={`/verity/actresses/${pageInfo.actressId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all hover:brightness-110"
                          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}
                        >
                          <Copy size={11} />
                          SEOメタをSupabaseで編集
                        </a>
                      )}

                      {/* Google Search Console へのリンク */}
                      <a
                        href={`https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(SITE_ORIGIN + '/')}&query=${encodeURIComponent(row.query)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] transition-all hover:brightness-110"
                        style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
                        title="Search Consoleで詳細を確認"
                      >
                        <ExternalLink size={10} />
                        GSC
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── SEO改善インデックス ────────────────────────────────────────────── */}
      <div className="rounded-xl p-5 space-y-3" style={{ border: '1px solid rgba(170,119,255,0.2)', background: 'var(--surface)' }}>
        <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#aa77ff' }}>
          <Search size={12} /> 女優ページ SEO メタ編集ガイド
        </h2>
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          女優ページのデフォルトタイトルは <strong className="text-[var(--text)]">【N月最新】[名前]の神作・出演動画まとめ…</strong> 形式で月次自動更新されます。
          個別に最適化する場合は <code className="rounded px-1 py-0.5 text-[10px]" style={{ background: 'rgba(0,0,0,0.4)', color: '#aa77ff' }}>actresses.metadata</code> の <code className="rounded px-1 py-0.5 text-[10px]" style={{ background: 'rgba(0,0,0,0.4)', color: '#aa77ff' }}>seo_title</code> / <code className="rounded px-1 py-0.5 text-[10px]" style={{ background: 'rgba(0,0,0,0.4)', color: '#aa77ff' }}>seo_description</code> で上書きしてください（自動生成より優先）。
        </p>
        <pre className="overflow-x-auto rounded-lg p-4 text-[10px] leading-relaxed" style={{ background: 'rgba(0,0,0,0.4)', color: '#aa77ff', border: '1px solid rgba(170,119,255,0.15)' }}>{`-- Supabase SQL Editor で実行 (例: 篠崎沙帆)
-- ※ デフォルト自動生成: 【${new Date().getMonth() + 1}月最新】[名前]の神作・出演動画まとめ！…【VERITY】
UPDATE actresses
SET metadata = metadata || jsonb_build_object(
  'seo_title',       '【${new Date().getMonth() + 1}月最新】篠崎沙帆の神作・出演動画まとめ！今すぐ使えるセール作品・無料サンプル情報【VERITY】',
  'seo_description', '篠崎沙帆の最新作・セール中作品・無料サンプル動画を徹底まとめ。FANZAで視聴できる出演AV作品をVERITY編集部がキュレーション。'
)
WHERE external_id = 'dmm-actress-1154783';`}</pre>
      </div>

    </div>
  )
}
