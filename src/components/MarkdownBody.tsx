'use client'

type Props = { content: string; className?: string }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function parseInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
      `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="inline-block max-w-full rounded" />`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) =>
      `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="text-[var(--magenta)] underline underline-offset-2 hover:brightness-125">${escapeHtml(label)}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--magenta)]">$1</code>')
}

export function MarkdownBody({ content, className }: Props) {
  const lines  = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []

  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]))
        i++
      }
      blocks.push(
        `<pre class="overflow-auto rounded-xl bg-[var(--surface-2)] p-4 text-sm font-mono text-[var(--text)] my-4"><code${lang ? ` class="language-${lang}"` : ''}>${codeLines.join('\n')}</code></pre>`
      )
      i++
      continue
    }

    // Headings
    const h4 = line.match(/^#{4}\s+(.+)/)
    const h3 = line.match(/^#{3}\s+(.+)/)
    const h2 = line.match(/^#{2}\s+(.+)/)
    const h1 = line.match(/^#{1}\s+(.+)/)
    if (h4) { blocks.push(`<h4 class="mt-6 mb-2 text-base font-bold text-[var(--text)]">${parseInline(h4[1])}</h4>`); i++; continue }
    if (h3) { blocks.push(`<h3 class="mt-8 mb-3 text-lg font-bold text-[var(--text)] border-l-4 border-[var(--magenta)] pl-4">${parseInline(h3[1])}</h3>`); i++; continue }
    if (h2) { blocks.push(`<h2 class="mt-10 mb-4 text-xl font-bold text-[var(--text)]">${parseInline(h2[1])}</h2>`); i++; continue }
    if (h1) { blocks.push(`<h1 class="mt-10 mb-4 text-2xl font-bold text-[var(--text)]">${parseInline(h1[1])}</h1>`); i++; continue }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push('<hr class="my-8 border-[var(--border)]" />')
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(parseInline(lines[i].slice(2)))
        i++
      }
      blocks.push(
        `<blockquote class="my-4 border-l-4 border-[var(--magenta)]/50 bg-[var(--surface)] pl-4 pr-4 py-3 italic text-[var(--text-muted)] rounded-r-lg">${quoteLines.join('<br />')}</blockquote>`
      )
      continue
    }

    // Unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li class="ml-4 list-disc">${parseInline(lines[i].slice(2))}</li>`)
        i++
      }
      blocks.push(`<ul class="my-4 space-y-1.5 text-[var(--text)]">${items.join('')}</ul>`)
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li class="ml-4 list-decimal">${parseInline(lines[i].replace(/^\d+\.\s/, ''))}</li>`)
        i++
      }
      blocks.push(`<ol class="my-4 space-y-1.5 text-[var(--text)]">${items.join('')}</ol>`)
      continue
    }

    // Empty line → paragraph break
    if (line.trim() === '') { blocks.push('<div class="my-3" />'); i++; continue }

    // Paragraph
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}|>|[-*+]|\d+\.|```|---|\*\*\*|___)/.test(lines[i])) {
      paraLines.push(parseInline(lines[i]))
      i++
    }
    if (paraLines.length > 0) {
      blocks.push(`<p class="leading-loose text-[var(--text)]">${paraLines.join('<br />')}</p>`)
    }
  }

  return (
    <div
      className={`text-[15px] space-y-1 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: blocks.join('') }}
    />
  )
}
