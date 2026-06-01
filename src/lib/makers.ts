export type Maker = {
  id: number
  name: string
  nameEn?: string
  description: string
}

// 監視メーカー一覧 — pipeline.ts の syncMakerUpcoming と共有する唯一の source of truth
export const MAKERS: Maker[] = [
  { id: 3152,  name: 'S1 No.1 Style',  nameEn: 'S1',       description: '人気専属女優による高品質映像作品' },
  { id: 1509,  name: 'Prestige',                             description: '艶やかな女性の美しさを追求するプレミアムレーベル' },
  { id: 1219,  name: 'SOD Create',                           description: 'ユニークな企画とSOD定番シリーズを展開' },
  { id: 6329,  name: 'V&R PRODUCE',    nameEn: 'V&R',       description: '企画物・ハード系・SM専門の老舗メーカー' },
  { id: 40488, name: 'MagicBanana',                          description: '個性的な企画とフェチ系コンテンツが充実' },
  { id: 4641,  name: 'MOODYZ',                               description: '美少女系・ドラマ仕立て作品を多数リリース' },
  { id: 6304,  name: '本中',           nameEn: 'Honchu',    description: '中出し作品専門の人気メーカー' },
  { id: 2661,  name: 'E-BODY',                               description: 'グラマー・巨乳系の人気女優作品を展開' },
  { id: 45276, name: 'Ksommelier',                           description: '人妻・熟女系コンテンツのスペシャリスト' },
  { id: 5032,  name: 'ALICE JAPAN',                          description: 'ロリ系・妹系・萌え系の人気コンテンツ' },
  { id: 4469,  name: 'GIGA',                                 description: '特撮ヒロイン・コスプレ・変身系の専門メーカー' },
  { id: 3890,  name: 'PREMIUM',                              description: '高品質な映像美と一流女優による大人の映像作品' },
  { id: 5238,  name: 'OPPAI',                                description: '巨乳・爆乳系のスペシャリストメーカー' },
]

export const MAKER_MAP = new Map<number, Maker>(MAKERS.map(m => [m.id, m]))

export function getMakerById(id: number): Maker | undefined {
  return MAKER_MAP.get(id)
}

// pipeline.ts の syncMakerUpcoming で使用する ID リスト
export const MONITORED_MAKER_IDS = MAKERS.map(m => m.id)
