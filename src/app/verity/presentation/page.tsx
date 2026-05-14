import type { Metadata } from 'next'
import { fetchNewsList } from '@/app/verity/actions/news'
import { PresentationClient } from './PresentationClient'

export const metadata: Metadata = {
  title: 'VERITY — Media Presentation 2025',
  description: '次世代アダルトメディアプラットフォーム VERITY のご紹介',
  robots: { index: false, follow: false },
}

export default async function PresentationPage() {
  const { items } = await fetchNewsList(6)
  const sampleNews = items.filter(n => n.thumbnail_url)

  return <PresentationClient sampleNews={sampleNews} />
}
