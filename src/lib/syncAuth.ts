// Accepts the sync secret via `x-sync-secret` header OR `?secret=` query param.
// Query param support lets the Header link work without client-side fetch.
export function isAuthorized(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const expected = process.env.SYNC_SECRET
  if (!expected) return true

  if (request.headers.get('x-sync-secret') === expected) return true

  try {
    if (new URL(request.url).searchParams.get('secret') === expected) return true
  } catch { /* malformed URL — fall through */ }

  return false
}
