import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Lock, ArrowLeft, CalendarDays, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LogView } from '@/components/LogView'

// ── モックインタビューデータ（将来 DB テーブルへ移行可能） ──────────────────────

type Interview = {
  id:        string
  title:     string
  actress:   string
  date:      string
  genre:     string
  excerpt:   string   // 非ログインユーザーに見せるプレビュー
  content:   string   // ログインユーザーのみ
}

const INTERVIEWS: Record<string, Interview> = {
  '001': {
    id:      '001',
    title:   '石川澪 独占インタビュー — 女優としての覚悟と今後のビジョン',
    actress: '石川澪',
    date:    '2026-05-01',
    genre:   '独占インタビュー',
    excerpt: '「最初は怖かった。でも、カメラの前に立った瞬間、全部吹き飛んだ」——石川澪が初めて明かす素顔と、女優としての葛藤。',
    content: `「最初は怖かった。でも、カメラの前に立った瞬間、全部吹き飛んだ」——石川澪が初めて明かす素顔と、女優としての葛藤。

VERITY 編集部が単独でインタビューを敢行。デビューから現在に至るまでのキャリアの変遷、作品への向き合い方、そしてプライベートな一面まで、余すところなく語ってもらった。

**Q: デビュー当時を振り返って、どんな気持ちでしたか？**

正直、不安と期待が半々でした。業界のことをほとんど知らないまま飛び込んで…でも周りのスタッフさんが本当に優しくて。「自分らしくやれば大丈夫」ってずっと言ってくれたんです。

**Q: 今、特に力を入れている作品のジャンルは？**

メイド系と純愛系に特に思い入れがあります。キャラクターに命を吹き込む感覚が好きで、衣装を着た瞬間にスイッチが入る感じがたまらないんです。

**Q: ファンへのメッセージを。**

いつも応援してくれてありがとうございます。作品を通じて少しでも笑顔になってもらえたら、それが私の全てです。これからも全力で挑みます。

---
*本インタビューは VERITY 会員限定コンテンツです。転載・引用はご遠慮ください。*`,
  },
  '002': {
    id:      '002',
    title:   '本庄鈴 特別対談 — 「私が作品に込める想い」',
    actress: '本庄鈴',
    date:    '2026-04-20',
    genre:   '独占インタビュー',
    excerpt: 'トップ女優として君臨し続ける本庄鈴が、自身の原動力と、VERITY 読者への特別メッセージを語る。',
    content: `トップ女優として君臨し続ける本庄鈴が、自身の原動力と、VERITY 読者への特別メッセージを語る。

**Q: 長くトップを維持できている秘訣は？**

常に「次の自分」を意識しています。現状に満足した瞬間に成長は止まると思っているので。毎回の撮影で必ず何か新しいことを試みるようにしています。

**Q: 作品選びの基準を教えてください。**

「この作品で何を伝えられるか」を一番に考えます。単に売れる作品より、見てくれた人の心に何かを残せる作品を選びたい。それが私のポリシーです。

**Q: VERITY 読者へ一言。**

皆さんの応援がエネルギーになっています。これからも一緒に歩んでいきましょう。

---
*本インタビューは VERITY 会員限定コンテンツです。転載・引用はご遠慮ください。*`,
  },
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params
  const iv = INTERVIEWS[id]
  if (!iv) return { title: 'Not Found — VERITY' }
  return {
    title:       `${iv.title} — VERITY`,
    description: iv.excerpt,
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function InterviewPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const iv     = INTERVIEWS[id]

  // 404
  if (!iv) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center text-[var(--text-muted)]">
        <p className="text-5xl mb-6">📭</p>
        <p className="text-lg">インタビューが見つかりませんでした</p>
        <Link href="/verity" className="mt-6 inline-block text-sm text-[var(--magenta)] hover:underline">
          トップへ戻る
        </Link>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ── 未ログイン：プレビュー表示（リダイレクトの代わりに CTA カード） ─────────
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
        <Link
          href="/verity"
          className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
        >
          <ArrowLeft size={14} />
          トップへ戻る
        </Link>

        {/* ヘッダー */}
        <div className="space-y-3">
          <span className="inline-block rounded-full bg-[var(--magenta)]/15 px-3 py-1 text-[11px] font-bold text-[var(--magenta)] uppercase tracking-widest">
            {iv.genre}
          </span>
          <h1 className="text-2xl font-bold text-[var(--text)] leading-snug">{iv.title}</h1>
          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><User size={12} />{iv.actress}</span>
            <span className="flex items-center gap-1"><CalendarDays size={12} />{iv.date}</span>
          </div>
        </div>

        {/* プレビュー本文（ぼかし + グラデーション） */}
        <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 overflow-hidden">
          <p className="text-sm leading-relaxed text-[var(--text)] mb-6">{iv.excerpt}</p>
          {/* ぼかしオーバーレイ */}
          <div
            className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--surface) 80%)' }}
          />
        </div>

        {/* ログイン促進CTA */}
        <div
          className="relative overflow-hidden rounded-2xl p-8 text-center space-y-4"
          style={{
            background: 'linear-gradient(135deg, rgba(226,0,116,0.12) 0%, rgba(18,18,26,0.97) 60%, rgba(251,191,36,0.08) 100%)',
            border:     '1px solid rgba(226,0,116,0.3)',
            boxShadow:  '0 0 32px rgba(226,0,116,0.1)',
          }}
        >
          <div
            className="pointer-events-none absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(226,0,116,0.7), rgba(251,191,36,0.4), transparent)' }}
          />
          <div className="flex justify-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: 'rgba(226,0,116,0.15)', border: '1px solid rgba(226,0,116,0.3)' }}
            >
              <Lock size={24} className="text-[var(--magenta)]" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-base font-bold text-[var(--text)]">
              続きを読むには VERITY 会員登録が必要です
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              無料登録で独占インタビューを含む会員限定コンテンツにアクセスできます
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={`/verity/login?next=/verity/interviews/${iv.id}`}
              className="rounded-xl px-6 py-3 text-sm font-bold text-white transition-all hover:opacity-90 hover:shadow-[0_0_20px_rgba(226,0,116,0.4)]"
              style={{ background: 'linear-gradient(135deg, #E20074, #b30059)' }}
            >
              無料で会員登録
            </Link>
            <Link
              href={`/verity/login?next=/verity/interviews/${iv.id}`}
              className="rounded-xl border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-muted)] hover:border-[var(--magenta)]/40 hover:text-[var(--text)] transition-colors"
            >
              ログイン
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── ログイン済み：全文表示 ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      {/* ジャンルログを記録 */}
      <LogView targetType="genre" targetId={iv.genre} />

      <Link
        href="/verity"
        className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
      >
        <ArrowLeft size={14} />
        トップへ戻る
      </Link>

      {/* ヘッダー */}
      <div className="space-y-3">
        <span className="inline-block rounded-full bg-[var(--magenta)]/15 px-3 py-1 text-[11px] font-bold text-[var(--magenta)] uppercase tracking-widest">
          {iv.genre}
        </span>
        <h1 className="text-2xl font-bold text-[var(--text)] leading-snug">{iv.title}</h1>
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1"><User size={12} />{iv.actress}</span>
          <span className="flex items-center gap-1"><CalendarDays size={12} />{iv.date}</span>
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: 'rgba(226,0,116,0.15)', color: 'var(--magenta)' }}
          >
            会員限定
          </span>
        </div>
      </div>

      {/* 本文 */}
      <article
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-4
                   text-sm leading-relaxed text-[var(--text)] prose-invert"
      >
        {iv.content.split('\n\n').map((para, i) => {
          if (para.startsWith('**') && para.endsWith('**')) {
            return (
              <p key={i} className="font-bold text-[var(--magenta)]">
                {para.replace(/\*\*/g, '')}
              </p>
            )
          }
          if (para.startsWith('**Q:')) {
            return (
              <p key={i} className="font-bold text-[var(--text)]">
                {para.replace(/\*\*/g, '')}
              </p>
            )
          }
          if (para.startsWith('---')) {
            return <hr key={i} className="border-[var(--border)]" />
          }
          if (para.startsWith('*') && para.endsWith('*')) {
            return (
              <p key={i} className="text-[11px] text-[var(--text-muted)] italic">
                {para.replace(/\*/g, '')}
              </p>
            )
          }
          return <p key={i}>{para}</p>
        })}
      </article>
    </div>
  )
}
