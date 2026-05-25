'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Send, Lock, Sparkles, Star } from 'lucide-react'
import type { ChatMessage } from './page'

// ── 定数 ────────────────────────────────────────────────────────────────────

const DAILY_LIMIT      = 15   // 1日の最大会話回数
const UNLOCK_THRESHOLD = 300  // 特別モード解放に必要な通算会話数

const GREETING = 'おかえりなさいませ、ご主人様♡ 今日はどんな作品をお探しですか？'

const AKARI_IMG: Record<1 | 2 | 3, string> = {
  1: '/assets/verity/akari_01.png',
  2: '/assets/verity/akari_02.png',
  3: '/assets/verity/akari_03.png',
}

// ── Markdown → HTML（リンク・太字・改行のみ、XSS-safe） ──────────────────

function parseMessage(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" class="underline text-[var(--magenta)] hover:opacity-75 transition-opacity" target="_self">$1</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')
}

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  initialMessages:   ChatMessage[]
  initialDailyCount: number
  initialTotalCount: number
  initialUnlocked:   boolean
}

// ── APIレスポンス型 ──────────────────────────────────────────────────────────

type PostResponse = {
  reply?:          string
  dailyCount?:     number
  totalUserCount?: number
  unlocked?:       boolean
  error?:          string
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function ConciergeClient({
  initialMessages,
  initialDailyCount,
  initialTotalCount,
  initialUnlocked,
}: Props) {
  const [messages,      setMessages]      = useState<ChatMessage[]>(initialMessages)
  const [input,         setInput]         = useState('')
  const [isLoading,     setIsLoading]     = useState(false)
  const [dailyCount,    setDailyCount]    = useState(initialDailyCount)
  const [totalCount,    setTotalCount]    = useState(initialTotalCount)
  const [unlocked,      setUnlocked]      = useState(initialUnlocked)
  const [imgKey,        setImgKey]        = useState<1 | 2 | 3>(1)  // 現在表示中の画像
  const [selectedMode,  setSelectedMode]  = useState<1 | 3>(1)      // ユーザーが選択したモード

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const isLocked   = dailyCount >= DAILY_LIMIT

  // 新着メッセージで自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading || isLocked) return

    // 楽観的UI: ユーザーメッセージを先に表示
    const tempMsg: ChatMessage = {
      id:         `temp-${Date.now()}`,
      role:       'user',
      content:    text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempMsg])
    setInput('')
    setIsLoading(true)
    setImgKey(2) // あかり 返答中

    try {
      const res  = await fetch('/verity/api/concierge', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: text }),
      })
      const data = await res.json() as PostResponse

      if (!res.ok || data.error) {
        const errContent = data.error === 'daily_limit_reached'
          ? '今日はもうお話できる回数が上限に達してしまいました♡ また明日お話しましょうね♪'
          : 'ごめんなさい、少し調子が悪いみたいです♡ もう一度試してみてください。'
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`, role: 'model', content: errContent, created_at: new Date().toISOString(),
        }])
        return
      }

      const newUnlocked = data.unlocked ?? unlocked
      if (data.dailyCount     !== undefined) setDailyCount(data.dailyCount)
      if (data.totalUserCount !== undefined) setTotalCount(data.totalUserCount)
      setUnlocked(newUnlocked)

      setMessages(prev => [...prev, {
        id:         `model-${Date.now()}`,
        role:       'model',
        content:    data.reply ?? '',
        created_at: new Date().toISOString(),
      }])

      // 返答後: ランダムで akari_02 のままにするか selectedMode に戻すか
      const nextImg = Math.random() < 0.4
        ? 2
        : (newUnlocked && selectedMode === 3 ? 3 : 1)
      setImgKey(nextImg as 1 | 2 | 3)

    } catch {
      setImgKey(selectedMode === 3 && unlocked ? 3 : 1)
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, isLocked, unlocked, selectedMode])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  const switchMode = (mode: 1 | 3) => {
    setSelectedMode(mode)
    if (!isLoading) setImgKey(mode)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">

      {/* ── ヘッダー ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="h-7 w-1 rounded-full bg-gradient-to-b from-[var(--magenta)] to-[var(--magenta)]/10" />
        <Sparkles size={17} className="text-[var(--magenta)]" />
        <h1 className="text-xl font-bold tracking-widest text-[var(--text)]">あかり部屋</h1>
        <span className="rounded-full bg-[var(--magenta)]/15 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[var(--magenta)] border border-[var(--magenta)]/30">
          CONCIERGE
        </span>
      </div>

      {/* ── メインエリア ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-6">

        {/* あかり画像サイドパネル */}
        <div className="flex flex-col items-center gap-4 sm:w-44 shrink-0">

          {/* 画像 */}
          <div className="relative w-36 h-48 sm:w-40 sm:h-52 rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={AKARI_IMG[imgKey]}
              alt="あかり"
              className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500"
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black/25 flex items-end justify-center pb-3 rounded-2xl">
                <span className="text-white text-[11px] font-bold tracking-widest animate-pulse">
                  考え中...♡
                </span>
              </div>
            )}
          </div>

          {/* 300回アンロック: モード切替ボタン */}
          {unlocked && (
            <div className="flex gap-2">
              <button
                onClick={() => switchMode(1)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold border transition-colors ${
                  selectedMode === 1
                    ? 'bg-[var(--magenta)] text-white border-[var(--magenta)]'
                    : 'text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--magenta)]/60'
                }`}
              >
                通常
              </button>
              <button
                onClick={() => switchMode(3)}
                className={`rounded-full px-3 py-1 text-[10px] font-bold border transition-colors ${
                  selectedMode === 3
                    ? 'bg-[var(--magenta)] text-white border-[var(--magenta)]'
                    : 'text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--magenta)]/60'
                }`}
              >
                ✦ 特別
              </button>
            </div>
          )}

          {/* アンロック告知 */}
          {unlocked && (
            <p className="text-[10px] text-[var(--magenta)] text-center font-bold tracking-wider">
              ✦ 特別モード解放済み♡
            </p>
          )}

          {/* デイリーカウンター */}
          <div className="text-center space-y-2">
            <p className="text-[10px] text-[var(--text-muted)] tracking-wider">今日の残り会話</p>
            <div className="flex gap-1.5 justify-center">
              {Array.from({ length: DAILY_LIMIT }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border-2 transition-colors ${
                    i < dailyCount
                      ? 'bg-[var(--magenta)] border-[var(--magenta)]'
                      : 'border-[var(--border)] bg-transparent'
                  }`}
                />
              ))}
            </div>
            <p className="text-[9px] text-[var(--text-muted)]">通算 {totalCount} 回</p>
            {!unlocked && (
              <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                あと {Math.max(0, UNLOCK_THRESHOLD - totalCount)} 回で<br />
                <span className="text-[var(--magenta)]">特別モード解放♡</span>
              </p>
            )}
          </div>

          {/* ロック中バナー */}
          {isLocked && (
            <div className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">
              <Lock size={10} className="text-[var(--text-muted)]" />
              <span className="text-[9px] text-[var(--text-muted)]">本日上限</span>
            </div>
          )}
        </div>

        {/* チャットエリア */}
        <div className="flex-1 flex flex-col min-h-0">

          {/* メッセージリスト */}
          <div
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4 overflow-y-auto max-h-[480px]
              [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]"
          >
            {/* 固定グリーティング */}
            <AkariBubble content={GREETING} imgKey={1} isMarkdown={false} />

            {/* 会話履歴 */}
            {messages.map(msg =>
              msg.role === 'user' ? (
                <UserBubble key={msg.id} content={msg.content} />
              ) : (
                <AkariBubble key={msg.id} content={msg.content} imgKey={imgKey} isMarkdown />
              )
            )}

            {/* ローディング */}
            {isLoading && <TypingIndicator />}

            <div ref={bottomRef} />
          </div>

          {/* 入力エリア */}
          {isLocked ? (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <Lock size={13} className="text-[var(--text-muted)] shrink-0" />
              <p className="text-sm text-[var(--text-muted)]">
                今日の会話は終了です♡ また明日お話しましょう！
              </p>
            </div>
          ) : (
            <div className="mt-3 flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={isLoading}
                placeholder="気になる女優さんや作品を教えてください♡"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--magenta)]/60 disabled:opacity-50 transition-colors leading-relaxed"
              />
              <button
                onClick={() => void sendMessage()}
                disabled={isLoading || !input.trim()}
                aria-label="送信"
                className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--magenta)] text-white disabled:opacity-40 hover:bg-[var(--magenta)]/85 transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── フッターナビ ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pt-2">
        <Link
          href="/verity/profile"
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors tracking-widest uppercase"
        >
          ← マイページへ戻る
        </Link>
        {unlocked && (
          <span className="flex items-center gap-1 text-[10px] text-[var(--magenta)] font-bold">
            <Star size={10} fill="currentColor" />
            特別モード解放済み
          </span>
        )}
      </div>
    </div>
  )
}

// ── サブコンポーネント ─────────────────────────────────────────────────────

function AkariBubble({
  content,
  imgKey,
  isMarkdown,
}: {
  content:    string
  imgKey:     1 | 2 | 3
  isMarkdown: boolean
}) {
  const AKARI_IMG: Record<1 | 2 | 3, string> = {
    1: '/assets/verity/akari_01.png',
    2: '/assets/verity/akari_02.png',
    3: '/assets/verity/akari_03.png',
  }
  return (
    <div className="flex gap-2.5 items-start">
      <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--surface-2)] relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={AKARI_IMG[imgKey]}
          alt="あかり"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      </div>
      <div className="max-w-[82%]">
        <p className="text-[10px] text-[var(--text-muted)] mb-1 ml-1">あかり</p>
        {isMarkdown ? (
          <div
            className="rounded-2xl rounded-tl-sm bg-[var(--surface-2)] border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: parseMessage(content) }}
          />
        ) : (
          <div className="rounded-2xl rounded-tl-sm bg-[var(--surface-2)] border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text)] leading-relaxed">
            {content}
          </div>
        )}
      </div>
    </div>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%]">
        <div className="rounded-2xl rounded-tr-sm bg-[var(--magenta)] px-4 py-2.5 text-sm text-white leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5 items-start">
      <div className="shrink-0 w-7 h-7 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--surface-2)] relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/verity/akari_02.png"
          alt="あかり"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      </div>
      <div>
        <p className="text-[10px] text-[var(--text-muted)] mb-1 ml-1">あかり</p>
        <div className="rounded-2xl rounded-tl-sm bg-[var(--surface-2)] border border-[var(--border)] px-5 py-3">
          <div className="flex gap-1.5 items-center">
            <span className="w-2 h-2 rounded-full bg-[var(--magenta)]/60 animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-[var(--magenta)]/60 animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-[var(--magenta)]/60 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  )
}
