'use client'

import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { FanzaLink } from './FanzaLink'
import { trackEvent } from '@/lib/analytics'
import {
  PREVIEW_DURATION_SEC,
  PREVIEW_POSITION,
  previewMeta,
  type HeroV21Item,
} from '@/lib/heroV21'

// Hero v2.1 main の 15秒プレビュー（方式A：FANZA公式 litevideo iframe）。
//
// 目的:「プレビューを開いたユーザーが FANZA へ行くか」の検証。厳密な再生解析ではない。
// 対象は main 作品のみ（rail 非対象・DB 変更なし・クリック後ロードで初期表示を重くしない）。
//
// ── 方式Aの制約（重要・意図的な割り切り）─────────────────────────────────────────
// sample_movie_url は litevideo プレイヤーの HTML ページ URL であり生 mp4 ではないため、
// クロスオリジン iframe になる。したがって次は「できない」前提で運用する:
//   - ミュート強制 / 開始秒 seek / 実再生開始・完了の正確な取得
// よって計測は近似とする:
//   - hero_preview_play     … iframe の load を再生準備完了の近似として1回だけ発火
//   - hero_preview_complete … 開封後 PREVIEW_DURATION_SEC 秒滞在（iframeアンマウント）の近似
// 15秒経過で iframe をアンマウントして再生を停止し、FANZA CTA を強調表示する。
// previewStartSec は将来 mp4 <video> 化時の seek 用に metadata へ持つのみ（iframe では未反映）。
// 自動再生はしない（iframe に autoplay 許可を与えない）。

type Phase = 'idle' | 'playing' | 'ended'

export function HeroV21Preview({
  item,
  onActiveChange,
}: {
  item: HeroV21Item
  /** プレビューが idle 以外（再生中/CTA表示中）になったら true。親の自動カルーセルを停止させる用。 */
  onActiveChange?: (active: boolean) => void
}) {
  const [phase, setPhase]   = useState<Phase>('idle')
  const [loaded, setLoaded] = useState(false)
  const playFiredRef        = useRef(false)

  // プレビューが開いている間は親（カルーセル）の自動送りを止める。
  useEffect(() => {
    onActiveChange?.(phase !== 'idle')
  }, [phase, onActiveChange])

  // 再生準備完了（iframe load）から PREVIEW_DURATION_SEC 秒でアンマウント停止 → complete 計測。
  useEffect(() => {
    if (phase !== 'playing' || !loaded) return
    const timer = setTimeout(() => {
      trackEvent('hero_preview_complete', { cid: item.cid, ...previewMeta(item) })
      setPhase('ended')
    }, PREVIEW_DURATION_SEC * 1000)
    return () => clearTimeout(timer)
  }, [phase, loaded, item])

  function handleOpen() {
    trackEvent('hero_preview_open', { cid: item.cid, ...previewMeta(item) })
    playFiredRef.current = false
    setLoaded(false)
    setPhase('playing')
  }

  // iframe load を再生開始の近似として計測（1回のみ）。
  function handleIframeLoad() {
    setLoaded(true)
    if (playFiredRef.current) return
    playFiredRef.current = true
    trackEvent('hero_preview_play', { cid: item.cid, ...previewMeta(item) })
  }

  // 動画URLが無い作品では何も出さない（呼び出し側でも弾くが二重防御）。
  if (!item.sampleMovieUrl) return null

  if (phase === 'idle') {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="mt-1 inline-flex items-center gap-2 rounded-full border-2 border-[var(--magenta)] px-6 py-2.5 text-sm font-bold text-[var(--magenta)] transition-all hover:bg-[var(--magenta)]/10 active:scale-95"
      >
        <Play size={14} className="fill-[var(--magenta)]" />
        15秒プレビュー
      </button>
    )
  }

  return (
    <div className="mt-2 w-full max-w-[480px]">
      {phase === 'playing' && (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-lg ring-1 ring-[var(--border)]">
          <iframe
            src={item.sampleMovieUrl}
            title={`${item.title} サンプル動画`}
            onLoad={handleIframeLoad}
            allow="encrypted-media; fullscreen"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
      )}

      {phase === 'ended' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--magenta)]/30 bg-[var(--magenta)]/5 px-5 py-5 text-center sm:items-start sm:text-left">
          <p className="text-sm font-bold text-[var(--text)]">
            プレビューはここまで — 続きはFANZAで
          </p>
          {item.fanzaUrl && (
            <FanzaLink
              href={item.fanzaUrl}
              targetId={item.cid}
              position={PREVIEW_POSITION}
              meta={previewMeta(item)}
              // 補助計測。FANZA遷移自体は FanzaLink の fanza_click で必ず記録される。
              onClick={() => trackEvent('hero_preview_fanza_click', { cid: item.cid, ...previewMeta(item) })}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--magenta)] to-rose-600 px-7 py-3 text-sm font-bold text-white shadow-[0_0_24px_rgba(226,0,116,0.42)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(226,0,116,0.65)] hover:brightness-110 active:scale-[0.97]"
            >
              ▶ FANZAで続きを見る
              <span className="opacity-70">↗</span>
            </FanzaLink>
          )}
          <button
            type="button"
            onClick={() => { setLoaded(false); setPhase('idle') }}
            className="text-xs text-[var(--text-muted)] underline underline-offset-2 transition-colors hover:text-[var(--text)]"
          >
            もう一度プレビュー
          </button>
        </div>
      )}
    </div>
  )
}
