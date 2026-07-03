'use client'

import { useState, useTransition } from 'react'
import {
  Sparkles, Copy, Check, AlertTriangle, ImageOff, Images, Loader2, Info,
} from 'lucide-react'
import { generateSocialPost } from '@/app/verity/actions/admin-social-posts'
import type {
  GenerateInput, GenerateResult, PostLangOrAll, PostType,
} from '@/lib/social/types'
import { TWEET_LIMIT } from '@/lib/social/tweetLength'

// ── 選択肢定義 ──────────────────────────────────────────────────────────────

const POST_TYPES: { key: PostType; label: string; hint: string }[] = [
  { key: 'ranking',          label: '人気ランキング', hint: '人気作品TOP' },
  { key: 'actress_trending', label: '女優',           hint: '人気/急上昇女優' },
  { key: 'new_releases',     label: '新作',           hint: '注目新作/新着' },
  { key: 'sale',             label: 'セール',         hint: 'FANZAセール' },
]

const LANGS: { key: PostLangOrAll; label: string }[] = [
  { key: 'ja',  label: '日本語' },
  { key: 'en',  label: 'English' },
  { key: 'zh',  label: '中文' },
  { key: 'all', label: 'まとめ (ja+en+zh)' },
]

const PERIODS: { key: NonNullable<GenerateInput['periodLabel']>; label: string }[] = [
  { key: 'overall',   label: '総合' },
  { key: 'today',     label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: 'week',      label: '今週' },
]

// ── 小型セグメントボタン ────────────────────────────────────────────────────

function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string; hint?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className="rounded-lg border px-3 py-2 text-sm font-medium transition-all"
            style={
              active
                ? { background: 'rgba(170,255,0,0.12)', color: '#aaff00', borderColor: 'rgba(170,255,0,0.5)' }
                : { background: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
            }
          >
            {o.label}
            {o.hint && <span className="ml-1 text-[10px] opacity-60">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      {children}
    </div>
  )
}

// ── メイン ──────────────────────────────────────────────────────────────────

export default function SocialPostsClient() {
  const [postType, setPostType]     = useState<PostType>('ranking')
  const [count, setCount]           = useState<number>(5)
  const [variant, setVariant]       = useState<'popular' | 'rising'>('rising')
  const [newMode, setNewMode]       = useState<'todays_pick' | 'new_arrivals'>('todays_pick')
  const [campaign, setCampaign]     = useState<'chijo' | 'fanza_limited'>('chijo')
  const [period, setPeriod]         = useState<NonNullable<GenerateInput['periodLabel']>>('overall')
  const [safeMode, setSafeMode]     = useState(false)

  const [lang, setLang]     = useState<PostLangOrAll>('all')
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleGenerate() {
    setCopied(false)
    const input: GenerateInput = {
      postType,
      count,
      variant,
      newMode,
      campaign,
      periodLabel: period,
      safeMode,
    }
    startTransition(async () => {
      const res = await generateSocialPost(input)
      setResult(res)
    })
  }

  async function handleCopy(body: string) {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard 権限なし: フォールバックなし（textarea は手動選択可） */
    }
  }

  const variant280 = result?.ok ? result.variants[lang] : null
  const showCountOption = postType === 'ranking' || postType === 'actress_trending'
    || (postType === 'new_releases' && newMode === 'new_arrivals')

  return (
    <div className="space-y-6">
      {/* ── 入力パネル ── */}
      <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <Field label="投稿タイプ">
          <Segmented options={POST_TYPES} value={postType} onChange={setPostType} />
        </Field>

        {postType === 'ranking' && (
          <Field label="期間ラベル（見出しの体裁）">
            <Segmented options={PERIODS} value={period} onChange={setPeriod} />
            <p className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
              <Info size={12} className="mt-0.5 shrink-0" />
              人気作品は「直近14日・半減期7日」の総合スコア（公開ランキングと同一）です。期間ラベルは見出しの言い回しのみを変えます。
            </p>
          </Field>
        )}

        {postType === 'actress_trending' && (
          <Field label="女優ランキング種別">
            <Segmented
              options={[
                { key: 'rising',  label: '急上昇' },
                { key: 'popular', label: '人気（お気に入り数）' },
              ]}
              value={variant}
              onChange={setVariant}
            />
          </Field>
        )}

        {postType === 'new_releases' && (
          <Field label="新作モード">
            <Segmented
              options={[
                { key: 'todays_pick',  label: '本日の注目新作（単品）' },
                { key: 'new_arrivals', label: '新着まとめ（複数）' },
              ]}
              value={newMode}
              onChange={setNewMode}
            />
          </Field>
        )}

        {postType === 'sale' && (
          <Field label="キャンペーン">
            <Segmented
              options={[
                { key: 'chijo',         label: '巨乳キャンペーン 30%OFF' },
                { key: 'fanza_limited', label: 'FANZA 期間限定セール' },
              ]}
              value={campaign}
              onChange={setCampaign}
            />
          </Field>
        )}

        {showCountOption && (
          <Field label="件数">
            <Segmented
              options={[{ key: '3', label: 'TOP3' }, { key: '5', label: 'TOP5' }]}
              value={String(count)}
              onChange={(v) => setCount(Number(v))}
            />
          </Field>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => setSafeMode((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all"
            style={
              safeMode
                ? { background: 'rgba(170,255,0,0.1)', color: '#aaff00', borderColor: 'rgba(170,255,0,0.4)' }
                : { background: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
            }
          >
            {safeMode ? <ImageOff size={14} /> : <Images size={14} />}
            セーフモード（画像候補を隠す）
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-black transition-all active:scale-95 disabled:opacity-60"
            style={{ background: '#aaff00' }}
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            投稿文を生成
          </button>
        </div>
      </div>

      {/* ── 結果パネル ── */}
      {result && !result.ok && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {result.error}
        </div>
      )}

      {result && result.ok && variant280 && (
        <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {/* 言語タブ */}
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => {
              const active = l.key === lang
              const v = result.variants[l.key]
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => { setLang(l.key); setCopied(false) }}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all"
                  style={
                    active
                      ? { background: 'rgba(170,255,0,0.12)', color: '#aaff00', borderColor: 'rgba(170,255,0,0.5)' }
                      : { background: 'var(--surface-2)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                  }
                >
                  {l.label}
                  <span
                    className="ml-1.5 tabular-nums"
                    style={{ color: v.overLimit ? '#f87171' : undefined, opacity: 0.7 }}
                  >
                    {v.weighted}
                  </span>
                </button>
              )
            })}
          </div>

          {/* 本文 */}
          <textarea
            readOnly
            value={variant280.body}
            rows={Math.min(16, variant280.body.split('\n').length + 1)}
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 font-mono text-sm leading-relaxed text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--magenta)]"
          />

          {/* 文字数カウンタ + コピー */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CounterBadge weighted={variant280.weighted} over={variant280.overLimit} />
              {variant280.overLimit && (
                <span className="inline-flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle size={12} /> 280超過（トリミング推奨）
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleCopy(variant280.body)}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--magenta)]/40 px-4 py-2 text-sm font-bold text-[var(--magenta)] transition-all hover:bg-[var(--magenta)]/10 active:scale-95"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'コピーしました' : '本文をコピー'}
            </button>
          </div>

          {/* データソース */}
          <p className="flex items-start gap-1.5 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
            <Info size={12} className="mt-0.5 shrink-0" />
            {result.meta.sourceNote}
          </p>

          {/* 画像候補 */}
          {result.images.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                画像候補（自動添付なし・手動で保存/添付）
              </p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {result.images.map((img) => (
                  <div key={img.url} className="space-y-1">
                    <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.proxyUrl} alt={img.label} className="absolute inset-0 h-full w-full object-cover object-right" />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(img.url)}
                      className="w-full truncate rounded border border-[var(--border)] px-1.5 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--magenta)]"
                      title={img.url}
                    >
                      URLコピー
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CounterBadge({ weighted, over }: { weighted: number; over: boolean }) {
  const near = !over && weighted > TWEET_LIMIT - 20
  const color = over ? '#f87171' : near ? '#fbbf24' : '#aaff00'
  return (
    <span className="inline-flex items-center gap-1 font-mono tabular-nums" style={{ color }}>
      {weighted}
      <span className="text-[var(--text-muted)]">/ {TWEET_LIMIT}</span>
    </span>
  )
}
