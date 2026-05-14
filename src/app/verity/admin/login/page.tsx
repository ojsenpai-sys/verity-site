import type { Metadata } from 'next'
import { AdminLoginForm } from './AdminLoginForm'

export const metadata: Metadata = {
  title: 'Admin Login — VERITY',
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <AdminLoginForm error={error} />
    </div>
  )
}
