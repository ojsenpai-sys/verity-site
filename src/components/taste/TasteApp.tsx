'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { trackEvent } from '@/lib/analytics'
import { selectDiagnosisSet } from '@/lib/taste/candidate-selection'
import { computeWeights, rankWorks, rankActresses, buildTasteSummary } from '@/lib/taste/scoring'
import { TASTE_QUESTION_COUNT, TASTE_MAX_WORKS, TASTE_MAX_ACTRESSES } from '@/lib/taste/types'
import type {
  AnsweredItem,
  TasteAnswer,
  TasteCandidate,
  TasteCandidatePool,
  TasteResult as TasteResultData,
} from '@/lib/taste/types'
import { TasteIntro } from './TasteIntro'
import { TasteProgress } from './TasteProgress'
import { TasteCard } from './TasteCard'
import { TasteControls } from './TasteControls'
import { TasteResult } from './TasteResult'

type Phase = 'intro' | 'selection' | 'result'

const RECENT_KEY = 'verity_taste_recent'
const RECENT_CAP = 80

function readRecentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return new Set()
    const arr: unknown = JSON.parse(raw)
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    // localStorage不可（プライベートモード等）でも診断自体は継続可能
    return new Set()
  }
}

function scrollToTop() {
  try {
    window.scrollTo({ top: 0, behavior: 'auto' })
  } catch {
    /* noop */
  }
}

function writeRecentIds(ids: readonly string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(-RECENT_CAP)))
  } catch {
    /* 保存失敗は無視（多様化のヒントが次回無くなるだけで致命的ではない） */
  }
}

type Props = {
  pool: TasteCandidatePool
}

export function TasteApp({ pool }: Props) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [questions, setQuestions] = useState<TasteCandidate[]>([])
  const [answers, setAnswers] = useState<AnsweredItem[]>([])
  const [result, setResult] = useState<TasteResultData | null>(null)
  const viewedRef = useRef(false)

  useEffect(() => {
    if (viewedRef.current) return
    viewedRef.current = true
    try {
      trackEvent('taste_view')
    } catch {
      /* 計測失敗は表示を妨げない */
    }
  }, [])

  const hasEnoughPool = pool.candidates.length > 0

  const buildQuestions = useCallback((): TasteCandidate[] => {
    const excludeIds = readRecentIds()
    const withExclusion = selectDiagnosisSet(pool.candidates, {
      count: TASTE_QUESTION_COUNT,
      excludeExternalIds: excludeIds,
    })
    // 直近出題の除外が効きすぎて必要数に届かない場合（プール縮小/再診断連投）は除外無しで再選択する
    const needed = Math.min(TASTE_QUESTION_COUNT, pool.candidates.length)
    if (withExclusion.length < needed) {
      return selectDiagnosisSet(pool.candidates, { count: TASTE_QUESTION_COUNT })
    }
    return withExclusion
  }, [pool.candidates])

  const handleStart = useCallback(() => {
    if (!hasEnoughPool) return
    setQuestions(buildQuestions())
    setAnswers([])
    setResult(null)
    setPhase('selection')
    scrollToTop()
    try {
      trackEvent('taste_start')
    } catch {
      /* noop */
    }
  }, [hasEnoughPool, buildQuestions])

  const finishDiagnosis = useCallback(
    (finalAnswers: AnsweredItem[]) => {
      const likeCount = finalAnswers.filter(a => a.answer === 'like').length
      const neutralCount = finalAnswers.filter(a => a.answer === 'neutral').length
      const dislikeCount = finalAnswers.filter(a => a.answer === 'dislike').length
      try {
        trackEvent('taste_complete', {
          answered_count: finalAnswers.length,
          like_count: likeCount,
          neutral_count: neutralCount,
          dislike_count: dislikeCount,
        })
      } catch {
        /* noop */
      }

      writeRecentIds([...readRecentIds(), ...finalAnswers.map(a => a.candidate.externalId)])

      const weights = computeWeights(finalAnswers, pool.candidates)
      const shownIds = new Set(finalAnswers.map(a => a.candidate.externalId))
      const shownActressIds = new Set(finalAnswers.flatMap(a => a.candidate.actress.map(x => x.id)))

      const works = rankWorks(pool.candidates, weights, {
        excludeExternalIds: shownIds,
        limit: TASTE_MAX_WORKS,
      })
      const actresses = rankActresses(pool.candidates, pool.actressIndex, weights, {
        shownActressIds,
        limit: TASTE_MAX_ACTRESSES,
      })
      const summary = buildTasteSummary(finalAnswers, weights, pool.candidates)

      setResult({ summary, actresses, works })
      setPhase('result')
      scrollToTop()
    },
    [pool],
  )

  const handleAnswer = useCallback(
    (answer: TasteAnswer) => {
      const step = answers.length
      const current = questions[step]
      if (!current) return

      try {
        trackEvent('taste_answer', { cid: current.externalId, answer, step: step + 1 })
      } catch {
        /* noop */
      }

      const next = [...answers, { candidate: current, answer }]
      setAnswers(next)

      if (next.length >= questions.length) {
        finishDiagnosis(next)
      }
    },
    [answers, questions, finishDiagnosis],
  )

  const handleRetry = useCallback(() => {
    const q = buildQuestions()
    setQuestions(q)
    setAnswers([])
    setResult(null)
    setPhase(q.length > 0 ? 'selection' : 'intro')
    scrollToTop()
  }, [buildQuestions])

  if (!hasEnoughPool) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center px-4 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          現在Taste Checkをご利用いただけません。しばらくしてからもう一度お試しください。
        </p>
      </div>
    )
  }

  if (phase === 'result' && result) {
    return <TasteResult result={result} onRetry={handleRetry} />
  }

  if (phase === 'selection' && questions[answers.length]) {
    const current = questions[answers.length]
    return (
      <div className="pb-32 sm:pb-4">
        <div className="mx-auto max-w-sm">
          <TasteProgress current={answers.length + 1} total={questions.length} />
        </div>
        <div className="flex flex-col items-center gap-6 pt-6">
          <TasteCard candidate={current} />
        </div>
        <div className="mx-auto mt-8 max-w-sm px-4 sm:px-0">
          <TasteControls onAnswer={handleAnswer} />
        </div>
      </div>
    )
  }

  return <TasteIntro onStart={handleStart} />
}
