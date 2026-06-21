import { PenLine } from 'lucide-react'

// Lightweight inline Markdown renderer: **bold**, *italic*
function InlineText({ text }: { text: string }) {
  // Split on **bold** and *italic* tokens
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.startsWith('**') && tok.endsWith('**')) {
          return <strong key={i} className="font-bold text-[var(--text)]">{tok.slice(2, -2)}</strong>
        }
        if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
          return <em key={i} className="italic text-[var(--text-muted)]">{tok.slice(1, -1)}</em>
        }
        return tok
      })}
    </>
  )
}

// Parses a Markdown string into React nodes
function MarkdownBody({ src }: { src: string }) {
  const lines = src.split('\n')
  const nodes: React.ReactNode[] = []
  const listBuf: string[] = []

  const flushList = (key: number) => {
    if (listBuf.length === 0) return
    nodes.push(
      <ul key={`ul-${key}`} className="mt-2 space-y-1.5 pl-0">
        {listBuf.map((item, j) => (
          <li key={j} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--magenta)]" aria-hidden />
            <InlineText text={item} />
          </li>
        ))}
      </ul>
    )
    listBuf.length = 0
  }

  lines.forEach((line, idx) => {
    const t = line.trim()
    if (!t) {
      flushList(idx)
      return
    }
    if (t.startsWith('### ')) {
      flushList(idx)
      nodes.push(
        <h4 key={idx} className="mt-4 text-xs font-black tracking-widest uppercase text-[var(--magenta)]">
          {t.slice(4)}
        </h4>
      )
    } else if (t.startsWith('## ')) {
      flushList(idx)
      nodes.push(
        <h3 key={idx} className="mt-4 text-sm font-bold text-[var(--text)]">
          {t.slice(3)}
        </h3>
      )
    } else if (t.startsWith('- ') || t.startsWith('* ')) {
      listBuf.push(t.slice(2))
    } else {
      flushList(idx)
      nodes.push(
        <p key={idx} className="text-sm leading-relaxed text-[var(--text-muted)]">
          <InlineText text={t} />
        </p>
      )
    }
  })
  flushList(lines.length)

  return <>{nodes}</>
}

type Props = {
  metadata: Record<string, unknown> | null
  lang?:    'ja' | 'en' | 'zh'
}

export function EditorNoteBlock({ metadata, lang = 'ja' }: Props) {
  const note       = metadata?.editor_note       as string   | undefined
  const highlights = metadata?.editor_highlights as string[] | undefined

  if (!note && (!highlights || highlights.length === 0)) return null

  const label =
    lang === 'en' ? "Editor's Note" :
    lang === 'zh' ? '编辑点评'       :
    '編集部レビュー'

  const highlightLabel =
    lang === 'en' ? 'Highlights' :
    lang === 'zh' ? '注目点'     :
    '注目ポイント'

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-5 space-y-3"
      style={{
        background: 'linear-gradient(135deg, #0e0e1a 0%, #12001a 60%, #0a0e18 100%)',
        border: '1px solid rgba(226,0,116,0.20)',
      }}
    >
      {/* グリッド装飾 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(226,0,116,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(226,0,116,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden
      />

      <div className="relative z-10 space-y-3">
        {/* ヘッダー */}
        <div className="flex items-center gap-2">
          <PenLine size={14} className="text-[var(--magenta)]" />
          <span className="text-xs font-black tracking-[0.18em] uppercase text-[var(--magenta)]">
            {label}
          </span>
        </div>

        {/* ハイライト一覧 */}
        {highlights && highlights.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
              {highlightLabel}
            </p>
            <ul className="space-y-1">
              {highlights.map((h, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-[var(--text)]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: 'var(--magenta)', boxShadow: '0 0 6px rgba(226,0,116,0.6)' }}
                    aria-hidden
                  />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 本文 Markdown */}
        {note && (
          <div className="space-y-1 border-t border-[var(--border)] pt-3">
            <MarkdownBody src={note} />
          </div>
        )}
      </div>
    </div>
  )
}
