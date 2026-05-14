import { NextRequest, NextResponse } from 'next/server'

const DMM_HOSTNAMES = new Set([
  'pics.dmm.co.jp',
  'pics.dmm.com',
])

const ALLOWED_HOSTNAMES = new Set([
  ...DMM_HOSTNAMES,
  'picsum.photos',
  'janoaissungtmkdngmnf.supabase.co', // Supabase Storage
])

const DMM_HEADERS = {
  Referer:       'https://www.dmm.co.jp/',
  Origin:        'https://www.dmm.co.jp',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:        'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
}

// DMM CDN silently returns HTTP 200 with a ~2.7 KB "no image" placeholder when
// jp.jpg (jacket photo) does not exist for a product.  Any image below this
// threshold is treated as missing and the next candidate in the chain is tried.
const MIN_IMAGE_BYTES = 8_000

// Build the URL candidate chain for a DMM image.
//
// Works bidirectionally: input can be either a digital/video or mono/movie/adult URL.
//
// Size priority depends on the suffix stored in the DB:
//   - jp.jpg stored → jp first (caller explicitly wants jacket photo)
//   - pl.jpg or ps.jpg stored → pl first, then ps, then jp as last resort
//     Reason: pl.jpg is the full-package spread where the front cover is on the RIGHT,
//     matching the CSS `object-right` convention. jp.jpg can be a different scan
//     (sometimes front-cover-left layout) that would show the back cover instead.
//
// Path fallback order for each size group:
//   1. pl → ps  (original CID, primary path)
//   2. pl → ps  (normalised CID — trailing letter stripped, primary path)
//   3. pl → ps  (original CID, opposite path)
//   4. pl → ps  (normalised CID, opposite path)
//   5. jp       (primary + normalised + opposite) — last resort
//   6. js-1.jpg (primary) → js-1.jpg (opposite)  — sample frame, absolute last resort
//
// Non-matched URLs (actress portraits, etc.) return a simple pl→ps→jp chain.
// URLs without a recognisable DMM suffix are returned as-is.
function buildChain(target: URL): string[] {
  const s = target.toString()

  // Detect what suffix was stored to decide size priority
  const storedSuffix = s.match(/(?:jp|pl|ps)\.jpg$/)?.[0].replace('.jpg', '') ?? null

  const base = s.replace(/(?:jp|pl|ps)\.jpg$/, '')
  if (base === s) return [s]   // no recognised DMM suffix — return as-is

  const DIGITAL_RE = /^(https:\/\/pics\.dmm\.co\.jp)\/digital\/video\/([^/]+)\/[^/]+$/
  const MONO_RE    = /^(https:\/\/pics\.dmm\.co\.jp)\/mono\/movie\/adult\/([^/]+)\/[^/]+$/

  const digitalMatch = base.match(DIGITAL_RE)
  const monoMatch    = base.match(MONO_RE)

  if (!digitalMatch && !monoMatch) {
    // Actress portrait or other unrecognised path — simple chain only
    return [`${base}pl.jpg`, `${base}ps.jpg`, `${base}jp.jpg`]
  }

  const [, host, cid] = (digitalMatch ?? monoMatch)!
  // Normalise: strip trailing lowercase letter(s) e.g. "v" in mkmp726v, "r" in hmn845r
  const cidNorm = cid.replace(/[a-z]+$/, '')
  const cids    = [...new Set([cid, cidNorm])]   // deduplicate when no trailing letter

  const primaryPath  = digitalMatch ? 'digital/video' : 'mono/movie/adult'
  const oppositePath = digitalMatch ? 'mono/movie/adult' : 'digital/video'

  // When jp.jpg is explicitly stored, keep jp-first order (caller wants the jacket scan).
  // Otherwise use pl-first to guarantee correct front-cover orientation with object-right.
  const mainSizes    = storedSuffix === 'jp' ? ['jp', 'pl', 'ps'] : ['pl', 'ps']
  const fallbackSize = storedSuffix === 'jp' ? [] : ['jp']

  const v = (path: string, c: string, sizes: string[]) =>
    sizes.map(sz => `${host}/${path}/${c}/${c}${sz}.jpg`)

  const candidates: string[] = []

  // 1 & 2: primary path
  for (const c of cids) candidates.push(...v(primaryPath, c, mainSizes))
  // 3 & 4: opposite path
  for (const c of cids) candidates.push(...v(oppositePath, c, mainSizes))
  // 5: jp fallback (only when not jp-first) — tried after all pl/ps attempts
  for (const c of cids) candidates.push(...v(primaryPath, c, fallbackSize))
  for (const c of cids) candidates.push(...v(oppositePath, c, fallbackSize))
  // 6: js-1.jpg sample frame — absolute last resort
  for (const c of cids) {
    candidates.push(`${host}/${primaryPath}/${c}/${c}js-1.jpg`)
    candidates.push(`${host}/${oppositePath}/${c}/${c}js-1.jpg`)
  }

  return [...new Set(candidates)]
}

async function fetchImage(url: string): Promise<{ buffer: ArrayBuffer; type: string } | null> {
  const isDmm = DMM_HOSTNAMES.has(new URL(url).hostname)
  try {
    const res = await fetch(url, {
      headers: isDmm ? DMM_HEADERS : {},
      cache: 'no-store',
    })
    if (!res.ok) {
      console.log(`[proxy/image] ${res.status} for ${url}`)
      return null
    }
    const buffer = await res.arrayBuffer()
    if (isDmm && buffer.byteLength < MIN_IMAGE_BYTES) {
      console.log(`[proxy/image] placeholder (${buffer.byteLength}B) — skip: ${url.slice(-55)}`)
      return null
    }
    return { buffer, type: res.headers.get('content-type') ?? 'image/jpeg' }
  } catch (err) {
    console.log(`[proxy/image] fetch error for ${url}:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url')

  if (!rawUrl) return new NextResponse('Missing url param', { status: 400 })

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    console.log('[proxy/image] invalid URL:', rawUrl)
    return new NextResponse('Invalid URL', { status: 400 })
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTNAMES.has(target.hostname)) {
    console.log('[proxy/image] blocked host:', target.hostname)
    return new NextResponse('Host not allowed', { status: 403 })
  }

  const chain = buildChain(target)
  for (const url of chain) {
    const result = await fetchImage(url)
    if (result) {
      if (url !== rawUrl) {
        const fromDigital = rawUrl.includes('/digital/')
        const toMono      = url.includes('/mono/')
        const role = (fromDigital && toMono)  ? 'mono-fallback'
                   : (!fromDigital && !toMono) ? 'digital-fallback'
                   : url.endsWith('jp.jpg') && !rawUrl.endsWith('jp.jpg') ? 'upgrade'
                   : 'fallback'
        console.log(`[proxy/image] served via ${role}: ${url.slice(-65)}`)
      }
      return new NextResponse(result.buffer, {
        headers: {
          'Content-Type':  result.type,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
          'X-Proxy-Source': url,
        },
      })
    }
  }

  console.log('[proxy/image] all candidates failed for:', rawUrl)
  return new NextResponse('Image not found', { status: 404 })
}
