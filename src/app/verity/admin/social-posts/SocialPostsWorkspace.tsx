'use client'

import { useState } from 'react'
import { Sparkles, History } from 'lucide-react'
import SocialPostsClient from './SocialPostsClient'
import HistoryPanel from './HistoryPanel'

type Tab = 'generate' | 'history'

function TabBtn({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold transition-all"
      style={
        active
          ? { background: 'rgba(170,255,0,0.12)', color: '#aaff00', borderColor: 'rgba(170,255,0,0.5)' }
          : { background: 'var(--surface)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
      }
    >
      {icon}
      {children}
    </button>
  )
}

export default function SocialPostsWorkspace() {
  const [tab, setTab] = useState<Tab>('generate')

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <TabBtn active={tab === 'generate'} onClick={() => setTab('generate')} icon={<Sparkles size={14} />}>
          生成
        </TabBtn>
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')} icon={<History size={14} />}>
          履歴・成果
        </TabBtn>
      </div>

      {tab === 'generate' ? <SocialPostsClient /> : <HistoryPanel />}
    </div>
  )
}
