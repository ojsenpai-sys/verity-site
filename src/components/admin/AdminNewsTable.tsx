'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Edit, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import type { SnNewsWithActress } from '@/lib/types'
import { adminDeleteNews, adminTogglePublish } from '@/app/verity/actions/admin-news'

type Props = { initialItems: SnNewsWithActress[] }

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function AdminNewsTable({ initialItems }: Props) {
  const [items,      setItems]     = useState(initialItems)
  const [, startT]                 = useTransition()

  function togglePublish(id: string, current: boolean) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, is_published: !current } : it))
    startT(async () => {
      const res = await adminTogglePublish(id, !current)
      if ('error' in res) {
        setItems(prev => prev.map(it => it.id === id ? { ...it, is_published: current } : it))
        alert(`エラー: ${res.error}`)
      }
    })
  }

  function deleteItem(id: string, title: string) {
    if (!confirm(`「${title}」を削除しますか？この操作は取り消せません。`)) return
    setItems(prev => prev.filter(it => it.id !== id))
    startT(async () => {
      const res = await adminDeleteNews(id)
      if ('error' in res) {
        alert(`削除エラー: ${res.error}`)
      }
    })
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-16 text-[var(--text-muted)]">
        <span className="text-4xl">📰</span>
        <p className="text-sm">記事がありません</p>
        <Link href="/verity/admin/news/new" className="text-sm text-[var(--magenta)] hover:underline">
          最初の記事を作成 →
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              ステータス
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              タイトル
            </th>
            <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              女優
            </th>
            <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              カテゴリ
            </th>
            <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              更新日
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {items.map(news => (
            <tr key={news.id} className="hover:bg-[var(--surface-2)] transition-colors">
              {/* ステータス */}
              <td className="px-4 py-3">
                <button
                  onClick={() => togglePublish(news.id, news.is_published)}
                  title={news.is_published ? '非公開にする' : '公開する'}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all hover:opacity-80"
                  style={{
                    background: news.is_published ? 'rgba(52,211,153,0.15)' : 'var(--surface-2)',
                    color:      news.is_published ? '#34d399' : 'var(--text-muted)',
                  }}
                >
                  {news.is_published
                    ? <><Eye size={10} /> 公開</>
                    : <><EyeOff size={10} /> 下書き</>
                  }
                </button>
              </td>

              {/* タイトル */}
              <td className="px-4 py-3 max-w-xs">
                <p className="font-medium text-[var(--text)] truncate">{news.title}</p>
                <p className="text-[11px] text-[var(--text-muted)] font-mono">{news.slug}</p>
              </td>

              {/* 女優 */}
              <td className="hidden md:table-cell px-4 py-3">
                <span className="text-xs text-[var(--text-muted)]">
                  {news.actress?.name ?? '—'}
                </span>
              </td>

              {/* カテゴリ */}
              <td className="hidden lg:table-cell px-4 py-3">
                {news.category && (
                  <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--magenta)]">
                    {news.category}
                  </span>
                )}
              </td>

              {/* 更新日 */}
              <td className="hidden lg:table-cell px-4 py-3 text-xs text-[var(--text-muted)]">
                {formatDate(news.updated_at ?? news.created_at)}
              </td>

              {/* 操作 */}
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {/* 公開プレビュー */}
                  {news.is_published && (
                    <a
                      href={`/news/${news.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-amber-400 hover:bg-[var(--surface-2)] transition-all"
                      title="サイトで確認する"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {/* 編集 */}
                  <Link
                    href={`/verity/admin/news/${news.slug}/edit`}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--magenta)] hover:bg-[var(--surface-2)] transition-all"
                    title="編集"
                  >
                    <Edit size={14} />
                  </Link>
                  {/* 削除 */}
                  <button
                    onClick={() => deleteItem(news.id, news.title)}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="削除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
