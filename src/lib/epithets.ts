export interface EpithetDef {
  id:     string
  name:   string
  desc:   string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export const EPITHET_DEFS: EpithetDef[] = [
  { id: 'dawn_scout',          name: '暁の偵察兵',    rarity: 'common',    desc: 'ニュース記事を累計5件閲覧' },
  { id: 'rising_star',         name: '新進気鋭',      rarity: 'common',    desc: 'お気に入り女優を1名登録' },
  { id: 'first_action',        name: '行動の証',      rarity: 'common',    desc: 'FANZAで購入ボタンを初めてクリック' },
  { id: 'scarlet_maniac',      name: '深紅の熱狂者',  rarity: 'rare',      desc: '累計でLPを50回付与する' },
  { id: 'sleepless_tactician', name: '不眠の軍師',    rarity: 'rare',      desc: '深夜2:00〜5:00にアクセス' },
  { id: 'devoted_guardian',    name: '一途なる防人',  rarity: 'common',    desc: '1人の女優にLP30以上捧げる' },
  { id: 'twin_wings',          name: '比翼の鳥',      rarity: 'rare',      desc: '2人の女優の王冠を達成' },
  { id: 'three_heroes',        name: '三英傑',        rarity: 'rare',      desc: '3人の王冠達成+VERITYマスター' },
  { id: 'six_paths',           name: '六道輪廻',      rarity: 'epic',      desc: '6人の王冠を達成' },
  { id: 'info_hermit',         name: '情報の隠者',    rarity: 'common',    desc: '検索機能で女優を10回検索' },
  { id: 'clairvoyant',         name: '千里眼',        rarity: 'rare',      desc: '発売10日以上先の先行作品を閲覧' },
  { id: 'strategist',          name: '軍配者',        rarity: 'rare',      desc: 'オススメ女優を3名お気に入りに登録' },
  { id: 'sleeping_dragon',     name: '臥龍',          rarity: 'rare',      desc: '3日以上不在から復帰ログイン' },
  { id: 'battle_general',      name: '赤壁の猛将',    rarity: 'epic',      desc: '1日でLPを10回付与する' },
  { id: 'invincible_gem',      name: '国士無双',      rarity: 'legendary', desc: '女優のLPを100まで貯める' },
  { id: 'kabukimono',          name: '傾奇者',        rarity: 'legendary', desc: '王冠達成済み女優のお気に入りを解除' },
  { id: 'conquest',            name: '天下布武',      rarity: 'epic',      desc: 'お気に入り枠を最大9枠に拡張' },
  { id: 'wind_fire',           name: '風林火山',      rarity: 'epic',      desc: 'FANZAで購入を累計50回クリック' },
  { id: 'digital_bard',        name: '電子の語り部',  rarity: 'rare',      desc: '記事や女優ページをSNSでシェア' },
  { id: 'neon_overlord',       name: 'ネオンの覇者',  rarity: 'legendary', desc: 'LEGEND OF VERITY称号を獲得' },
  { id: 'data_diver',          name: 'データダイバー', rarity: 'rare',      desc: '累計100件のニュース記事を閲覧' },
  { id: 'swift_reader',        name: '神速の執筆者',  rarity: 'rare',      desc: '記事公開日当日にその記事を閲覧' },
  { id: 'golden_lion',         name: '黄金の獅子',    rarity: 'epic',      desc: '全お気に入りへの累計LP合計300突破' },
  { id: 'conquering_march',    name: '覇王の歩み',    rarity: 'epic',      desc: '累計ログイン日数が30日に達する' },
  { id: 'shadow_warrior',      name: '影武者',        rarity: 'common',    desc: 'プロフィール名を初めて変更' },
  { id: 'empty_prayer',        name: '無双の祈り',    rarity: 'common',    desc: 'LP不足状態でLPを捧げようとする' },
  { id: 'cyber_ghost',         name: '電脳の亡霊',    rarity: 'legendary', desc: '午前4時台にニュース記事を5件閲覧' },
  { id: 'endless_cycle',       name: '修羅の道',      rarity: 'epic',      desc: 'お気に入りを累計10回登録・解除' },
  { id: 'truth_seeker',        name: '真理の探求者',  rarity: 'legendary', desc: '二つ名を15個以上獲得' },
  { id: 'invincible_one',      name: '一騎当千',      rarity: 'legendary', desc: '伝説の境地で、ただ一人の女優に100LPを捧げる' },
]

export const EPITHET_MAP = Object.fromEntries(EPITHET_DEFS.map(e => [e.id, e]))

export const RARITY_STYLE: Record<EpithetDef['rarity'], {
  label:     string
  textClass: string
  border:    string
  bg:        string
  glow:      string
}> = {
  common: {
    label:     'COMMON',
    textClass: 'text-slate-300',
    border:    'border-slate-400/35',
    bg:        'bg-slate-400/8',
    glow:      '',
  },
  rare: {
    label:     'RARE',
    textClass: 'text-sky-300',
    border:    'border-sky-400/50',
    bg:        'bg-sky-400/8',
    glow:      'shadow-[0_0_8px_rgba(56,189,248,0.22)]',
  },
  epic: {
    label:     'EPIC',
    textClass: 'text-purple-300',
    border:    'border-purple-400/50',
    bg:        'bg-purple-400/8',
    glow:      'shadow-[0_0_8px_rgba(168,85,247,0.28)]',
  },
  legendary: {
    label:     'LEGENDARY',
    textClass: 'text-amber-300',
    border:    'border-amber-400/60',
    bg:        'bg-amber-400/10',
    glow:      'shadow-[0_0_12px_rgba(251,191,36,0.32)]',
  },
}
