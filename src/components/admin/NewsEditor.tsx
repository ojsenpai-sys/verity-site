'use client'

import { useState, useCallback, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Save, Send, Eye, Edit, Loader2, CheckCircle, AlertCircle,
  Tag, Link as LinkIcon, Image, BookOpen, UploadCloud, ExternalLink,
} from 'lucide-react'
import { adminPostNews, type AdminPostNewsInput } from '@/app/verity/actions/admin-news'
import { uploadImage } from '@/app/verity/actions/storage'
import { MarkdownBody } from '@/components/MarkdownBody'

// ── 型 ──────────────────────────────────────────────────────────────────────

type Actress = {
  id:          string
  external_id: string
  name:        string
  ruby:        string | null
}

type Props = {
  actresses:    Actress[]
  initialData?: Partial<AdminPostNewsInput>
  editSlug?:    string
}

// ── Toast ────────────────────────────────────────────────────────────────────

type ToastState = { type: 'success' | 'error'; message: string } | null

function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-2xl transition-all ${
        toast.type === 'success'
          ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
          : 'bg-red-500/20 border border-red-500/30 text-red-300'
      }`}
    >
      {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {toast.message}
    </div>
  )
}

// ── スラッグ自動生成 ─────────────────────────────────────────────────────────

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^\w぀-鿿-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

// ── フォームフィールド ────────────────────────────────────────────────────────

function Field({
  label, required, hint, children,
}: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
        {required && <span className="text-[var(--magenta)]">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  )
}

const INPUT_BASE = [
  'w-full rounded-lg border border-[var(--border)] bg-[var(--bg)]',
  'px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/40',
  'focus:border-[var(--magenta)]/60 focus:outline-none transition-colors',
].join(' ')

const CATEGORIES = ['NEWS', 'INTERVIEW', 'EVENT', 'COLUMN', 'REPORT']

// ── 画像アップロードゾーン ────────────────────────────────────────────────────

function ImageUploadZone({
  onSuccess,
  onError,
  multiple = false,
}: {
  onSuccess: (url: string) => void
  onError:   (msg: string) => void
  multiple?: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFiles(files: FileList | File[]) {
    const arr = Array.from(files)
    setUploading(true)
    for (const file of arr) {
      const fd = new FormData()
      fd.append('file', file)
      const result = await uploadImage(fd)
      if ('error' in result) {
        onError(result.error)
      } else {
        onSuccess(result.url)
      }
    }
    setUploading(false)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="画像をアップロード"
      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
      }}
      onClick={() => !uploading && inputRef.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer select-none transition-all ${
        isDragging
          ? 'border-[var(--magenta)] bg-[var(--magenta)]/8 text-[var(--magenta)]'
          : uploading
          ? 'border-[var(--border)] cursor-wait text-[var(--text-muted)]'
          : 'border-[var(--border)] hover:border-[var(--magenta)]/40 hover:bg-[var(--surface-2)] text-[var(--text-muted)]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={e => e.target.files && processFiles(e.target.files)}
      />
      {uploading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">アップロード中…</span>
        </>
      ) : (
        <>
          <UploadCloud size={14} />
          <span className="text-xs">
            ドロップ または クリックして{multiple ? '画像を追加（複数可）' : '画像を選択'}
          </span>
        </>
      )}
    </div>
  )
}

// ── ギャラリープレビュー ──────────────────────────────────────────────────────

function GalleryPreview({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  return (
    <div className="flex gap-2 flex-wrap">
      {urls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={url}
          alt=""
          className="h-16 w-16 flex-shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      ))}
    </div>
  )
}

// ── メインエディタ ────────────────────────────────────────────────────────────

export function NewsEditor({ actresses, initialData, editSlug }: Props) {
  const router  = useRouter()
  const formId  = useId()

  const [title,        setTitle]        = useState(initialData?.title ?? '')
  const [slug,         setSlug]         = useState(initialData?.slug ?? '')
  const [slugManual,   setSlugManual]   = useState(!!initialData?.slug)
  const [category,     setCategory]     = useState(initialData?.category ?? 'NEWS')
  const [summary,      setSummary]      = useState(initialData?.summary ?? '')
  const [actressId,    setActressId]    = useState(initialData?.actress_id ?? '')
  const [actressQuery, setActressQuery] = useState('')
  const [content,      setContent]      = useState(initialData?.content ?? '')
  const [thumbnail,    setThumbnail]    = useState(initialData?.thumbnail_url ?? '')
  const [gallery,      setGallery]      = useState((initialData?.gallery_urls ?? []).join(', '))
  const [fanzaLink,    setFanzaLink]    = useState(initialData?.fanza_link ?? '')
  const [tags,         setTags]         = useState((initialData?.tags ?? []).join(', '))
  const [isPublished,  setIsPublished]  = useState(initialData?.is_published ?? true)

  const [previewMode,  setPreviewMode]  = useState<'edit' | 'preview' | 'split'>('split')
  const [loading,      setLoading]      = useState(false)
  const [toast,        setToast]        = useState<ToastState>(null)

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const handleTitleChange = useCallback((v: string) => {
    setTitle(v)
    if (!slugManual) setSlug(titleToSlug(v))
  }, [slugManual])

  // ギャラリー URL リスト（プレビュー用）
  const galleryUrls = gallery.split(',').map(u => u.trim()).filter(Boolean)

  // 女優フィルター
  const filteredActresses = actressQuery.trim()
    ? actresses.filter(a =>
        a.name.includes(actressQuery) ||
        (a.ruby ?? '').includes(actressQuery) ||
        a.external_id.includes(actressQuery)
      ).slice(0, 20)
    : actresses.slice(0, 20)

  const selectedActress = actresses.find(a => a.external_id === actressId)

  // ギャラリー URL 末尾追加
  function appendGalleryUrl(url: string) {
    setGallery(prev => {
      const trimmed = prev.trim().replace(/,\s*$/, '')
      return trimmed ? `${trimmed}, ${url}` : url
    })
  }

  async function handleSubmit(published: boolean) {
    if (!title.trim() || !slug.trim() || !content.trim()) {
      showToast('error', 'タイトル・スラッグ・本文は必須です')
      return
    }

    setLoading(true)
    try {
      const input: AdminPostNewsInput = {
        title:         title.trim(),
        slug:          slug.trim(),
        category,
        summary:       summary.trim() || undefined,
        actress_id:    actressId || undefined,
        content:       content,
        thumbnail_url: thumbnail.trim() || undefined,
        gallery_urls:  gallery.split(',').map(u => u.trim()).filter(Boolean),
        fanza_link:    fanzaLink.trim() || undefined,
        tags:          tags.split(',').map(t => t.trim()).filter(Boolean),
        is_published:  published,
      }

      const result = await adminPostNews(input)

      if ('error' in result) {
        showToast('error', result.error)
      } else {
        showToast(
          'success',
          result.isNew
            ? `✓ 記事を${published ? '公開' : '下書き保存'}しました`
            : `✓ 記事を更新しました`
        )
        setTimeout(() => router.push('/verity/admin/news'), 1200)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Toast toast={toast} />

      {/* ── ツールバー ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1 text-xs">
          {(['edit', 'split', 'preview'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setPreviewMode(mode)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-all ${
                previewMode === mode
                  ? 'bg-[var(--magenta)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {mode === 'edit'    && <Edit size={11} />}
              {mode === 'split'   && <BookOpen size={11} />}
              {mode === 'preview' && <Eye size={11} />}
              {mode === 'edit' ? '編集' : mode === 'split' ? '分割' : 'プレビュー'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {editSlug && (
            <a
              href={`/news/${editSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:border-amber-400/50 hover:text-amber-400 transition-all"
            >
              <ExternalLink size={14} />
              サイトで確認する
            </a>
          )}
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--magenta)]/50 hover:text-[var(--text)] disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            下書き保存
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--magenta)] px-5 py-2 text-sm font-bold text-white shadow-[0_0_16px_rgba(226,0,116,0.3)] hover:brightness-110 disabled:opacity-50 active:scale-95 transition-all"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            公開する
          </button>
        </div>
      </div>

      {/* ── メインレイアウト ───────────────────────────────────── */}
      <div className={`gap-6 ${previewMode === 'split' ? 'grid grid-cols-2' : 'block'}`}>

        {/* 左ペイン：フォーム */}
        {(previewMode === 'edit' || previewMode === 'split') && (
          <div className="space-y-5" id={formId}>

            {/* タイトル */}
            <Field label="タイトル" required>
              <input
                type="text"
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="記事タイトルを入力…"
                className={`${INPUT_BASE} text-base font-semibold`}
              />
            </Field>

            {/* スラッグ */}
            <Field label="スラッグ" required hint="/news/{slug} の URL に使用">
              <input
                type="text"
                value={slug}
                onChange={e => { setSlug(e.target.value); setSlugManual(true) }}
                placeholder="url-slug-here"
                className={`${INPUT_BASE} font-mono text-xs`}
              />
            </Field>

            {/* カテゴリ + 公開設定 */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="カテゴリ">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className={INPUT_BASE}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="公開設定">
                <button
                  type="button"
                  onClick={() => setIsPublished(v => !v)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                    isPublished
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${isPublished ? 'bg-emerald-400' : 'bg-[var(--border)]'}`} />
                  {isPublished ? '公開' : '下書き'}
                </button>
              </Field>
            </div>

            {/* 概要 */}
            <Field label="概要（リード文）" hint="一覧に表示されるサマリーテキスト">
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                rows={2}
                placeholder="記事の要約を入力…"
                className={`${INPUT_BASE} resize-none`}
              />
            </Field>

            {/* 女優選択 */}
            <Field label="関連女優">
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={actressQuery}
                    onChange={e => setActressQuery(e.target.value)}
                    placeholder="名前・ふりがなで検索…"
                    className={INPUT_BASE}
                  />
                </div>
                {actressQuery && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
                    {filteredActresses.length === 0 && (
                      <p className="px-3 py-2 text-xs text-[var(--text-muted)]">見つかりません</p>
                    )}
                    {filteredActresses.map(a => (
                      <button
                        key={a.external_id}
                        type="button"
                        onClick={() => {
                          setActressId(a.external_id)
                          setActressQuery('')
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <span className="font-medium text-[var(--text)]">{a.name}</span>
                        {a.ruby && <span className="text-xs text-[var(--text-muted)]">{a.ruby}</span>}
                        <span className="ml-auto font-mono text-[10px] text-[var(--text-muted)]">
                          {a.external_id}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedActress && (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--magenta)]/30 bg-[var(--magenta)]/5 px-3 py-2">
                    <span className="text-sm font-medium text-[var(--magenta)]">
                      {selectedActress.name}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      {selectedActress.external_id}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActressId('')}
                      className="ml-auto text-xs text-[var(--text-muted)] hover:text-red-400"
                    >
                      解除
                    </button>
                  </div>
                )}
              </div>
            </Field>

            {/* 本文 */}
            <Field label="本文（Markdown）" required>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={previewMode === 'split' ? 24 : 20}
                placeholder={`## 見出し\n\n本文をMarkdownで記述します。\n\n**太字** や *斜体* が使えます。`}
                className={`${INPUT_BASE} resize-y font-mono text-xs leading-relaxed`}
              />
            </Field>

            {/* メディア */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <Image size={13} /> メディア
              </h3>

              {/* サムネイル */}
              <Field label="サムネイル URL">
                <input
                  type="url"
                  value={thumbnail}
                  onChange={e => setThumbnail(e.target.value)}
                  placeholder="https://..."
                  className={INPUT_BASE}
                />
                <ImageUploadZone
                  onSuccess={url => setThumbnail(url)}
                  onError={msg => showToast('error', msg)}
                />
                {thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnail}
                    alt="thumbnail preview"
                    className="mt-1 h-28 w-full rounded-lg object-cover border border-[var(--border)]"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
              </Field>

              {/* ギャラリー */}
              <Field label="ギャラリー URL" hint="カンマ区切りで複数指定、または画像をドロップして追加">
                <textarea
                  value={gallery}
                  onChange={e => setGallery(e.target.value)}
                  rows={2}
                  placeholder="https://url1, https://url2, https://url3"
                  className={`${INPUT_BASE} resize-none font-mono text-xs`}
                />
                <ImageUploadZone
                  multiple
                  onSuccess={appendGalleryUrl}
                  onError={msg => showToast('error', msg)}
                />
                <GalleryPreview urls={galleryUrls} />
              </Field>
            </div>

            {/* リンク＆タグ */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <LinkIcon size={13} /> リンク・タグ
              </h3>
              <Field label="FANZA リンク" hint="アフィリエイト ID は自動付与されます">
                <input
                  type="url"
                  value={fanzaLink}
                  onChange={e => setFanzaLink(e.target.value)}
                  placeholder="https://www.dmm.co.jp/..."
                  className={INPUT_BASE}
                />
              </Field>
              <Field label="タグ" hint="カンマ区切り">
                <div className="relative">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    placeholder="インタビュー, 独占, 新作"
                    className={`${INPUT_BASE} pl-8`}
                  />
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* 右ペイン：プレビュー */}
        {(previewMode === 'preview' || previewMode === 'split') && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <Eye size={12} /> プレビュー
              </span>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-220px)]">
              {category && (
                <span className="inline-block rounded-full bg-[var(--magenta)] px-3 py-1 text-xs font-bold tracking-wider text-white">
                  {category}
                </span>
              )}
              <h1 className="text-xl font-bold leading-snug text-[var(--text)]">
                {title || 'タイトルが入力されていません'}
              </h1>

              {summary && (
                <p className="rounded-xl border-l-4 border-[var(--magenta)] bg-[var(--surface-2)] px-4 py-3 text-sm italic text-[var(--text-muted)]">
                  {summary}
                </p>
              )}

              {thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnail}
                  alt={title}
                  className="w-full h-auto rounded-xl"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}

              {content
                ? <MarkdownBody content={content} />
                : <p className="text-sm text-[var(--text-muted)] italic">本文がまだ入力されていません…</p>
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
