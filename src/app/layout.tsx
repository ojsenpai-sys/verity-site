import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'),
  title: 'VERITY',
  description: 'FANZAデータ直結のAVキュレーション・メディア。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  )
}
