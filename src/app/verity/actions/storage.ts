'use server'

import { createClient as createAnonClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const BUCKET = 'verity'

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function requireAdmin() {
  const supabase = await createAnonClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmail = process.env.ADMIN_EMAIL
  if (!user || !adminEmail || user.email !== adminEmail) {
    throw new Error('unauthorized')
  }
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_SIZE      = 8 * 1024 * 1024  // 8 MB

export async function uploadImage(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  try {
    await requireAdmin()
  } catch {
    return { error: '管理者権限が必要です' }
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'ファイルが見つかりません' }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: '対応形式: JPEG / PNG / GIF / WebP' }
  }
  if (file.size > MAX_SIZE) {
    return { error: 'ファイルサイズは 8MB 以下にしてください' }
  }

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const now  = new Date()
  const year = now.getFullYear()
  const mon  = String(now.getMonth() + 1).padStart(2, '0')
  const uid  = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const path = `news/images/${year}/${mon}/${uid}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const db     = svc()

  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert:      false,
  })
  if (error) return { error: error.message }

  const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path)
  return { url: publicUrl }
}
