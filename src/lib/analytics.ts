import { createClient } from '@/lib/supabase/client'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

// ── イベント名 Union 型（厳格な制限） ─────────────────────────────────────────
//
// 5正規イベント（Phase4）と既存DB名の対応:
//   view_work     ≡ video_view    （別名維持。article_scores 等が依存のためリネームしない）
//   view_actress  ≡ actress_view
//   click_fanza   ≡ fanza_click
//   favorite_work    （新規）
//   favorite_actress （新規）
// favorite 系は payload.action='add'|'remove' を metadata に格納する。
export type EventName =
  | 'signup_start'
  | 'signup_complete'
  | 'actress_view'      // = view_work の女優版: view_actress
  | 'video_view'        // = view_work
  | 'fanza_click'       // = click_fanza
  | 'favorite_work'
  | 'favorite_actress'

// ── ペイロード型 ───────────────────────────────────────────────────────────────
export interface TrackPayload {
  /** 女優 external_id。actress_view で target_id にマップされる */
  actressId?:   string
  /** 女優名（metadata 補助情報） */
  actressName?: string
  /** 作品 external_id（CID）。video_view / fanza_click で target_id にマップされる */
  cid?:         string
  /** クリック発生 UI 位置（fanza_click の導線識別子） */
  position?:    string
  /** その他の任意フィールドは metadata JSONB にそのまま格納される */
  [key: string]: unknown
}

// ── イベント → DB ターゲット マッピング ────────────────────────────────────────
const TARGET_MAP: Partial<Record<EventName, { type: string; idKey: 'actressId' | 'cid' }>> = {
  actress_view:     { type: 'actress', idKey: 'actressId' },
  video_view:       { type: 'article', idKey: 'cid'       },
  fanza_click:      { type: 'article', idKey: 'cid'       },
  favorite_work:    { type: 'article', idKey: 'cid'       },
  favorite_actress: { type: 'actress', idKey: 'actressId' },
}

// target_id にマップされる構造キーは metadata から除外する
const STRUCTURAL_KEYS = new Set<string>(['actressId', 'cid'])

function buildMetadata(payload: TrackPayload): Record<string, unknown> {
  const meta: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (!STRUCTURAL_KEYS.has(k)) meta[k] = v
  }
  return meta
}

function getSessionId(): string {
  const key = 'verity_sid'
  let sid = sessionStorage.getItem(key)
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem(key, sid)
  }
  return sid
}

/**
 * GA4 と Supabase user_events に同時送信する。
 * fire-and-forget — UI をブロックしない。エラーは無視する。
 *
 * @param eventName  計測対象イベント（EventName Union 型で制限）
 * @param payload    actressId / cid は target_id に変換。
 *                   残りのフィールドはすべて metadata JSONB に格納される。
 */
export function trackEvent(eventName: EventName, payload: TrackPayload = {}): void {
  if (typeof window === 'undefined') return

  const mapping     = TARGET_MAP[eventName]
  const target_type = mapping?.type                                               ?? null
  const target_id   = mapping ? (payload[mapping.idKey] as string | undefined) ?? null : null
  const metadata    = buildMetadata(payload)

  // ── GA4 ──────────────────────────────────────────────────────────────────────
  if (window.gtag) {
    window.gtag('event', eventName, {
      ...(target_type && { target_type }),
      ...(target_id   && { target_id }),
      ...metadata,
    })
  }

  // ── Supabase user_events — fire-and-forget ───────────────────────────────────
  const session_id = getSessionId()
  const page_path  = window.location.pathname
  const supabase   = createClient()

  supabase.auth
    .getSession()
    .then(({ data: { session } }) =>
      supabase.from('user_events').insert({
        user_id:    session?.user?.id ?? null,
        session_id,
        event_name: eventName,
        target_type,
        target_id,
        metadata,
        page_path,
      }).then()
    )
    .catch(() => {})
}
