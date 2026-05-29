import type { Metadata } from 'next'
import { GuideContent } from './GuideContent'

export const metadata: Metadata = {
  title: 'VERITYの遊び方 / How to VERITY — Complete Guide',
  description:
    'FANZA公式データ直結・ログイン不要お気に入り・マイページ属性解析——VERITYを120%楽しむための完全ガイド。JP/EN/TH対応。',
}

export default function GuidePage() {
  return <GuideContent />
}
