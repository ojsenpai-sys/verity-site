import type { MetaEntry, TasteActressInfo, TasteCandidate } from '../types.ts'

export function candidate(overrides: Partial<TasteCandidate> & { externalId: string }): TasteCandidate {
  return {
    id: overrides.externalId,
    title: `title-${overrides.externalId}`,
    slug: overrides.externalId,
    imageUrl: 'https://pics.dmm.co.jp/digital/video/x/xpl.jpg',
    tags: [],
    actress: [],
    series: [],
    maker: [],
    publishedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

export function actress(id: number, name: string): MetaEntry {
  return { id, name }
}

export function actressInfo(externalId: string, name: string): TasteActressInfo {
  return { externalId, name, imageUrl: 'https://pics.dmm.co.jp/actress.jpg' }
}
