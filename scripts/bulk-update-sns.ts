#!/usr/bin/env tsx
/**
 * SNS スクリーンネーム バルク更新スクリプト
 *
 * Usage:
 *   npx tsx scripts/bulk-update-sns.ts
 *
 * ① 下の UPDATES 配列に screenName を記入（空文字 '' はスキップ）
 * ② npx tsx scripts/bulk-update-sns.ts を実行
 * ③ 必要に応じて bash deploy.sh でフィード同期用のリストも反映
 *
 * ※ screenName は @ なしで入力（例: yua_mikami）
 */

import { createClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'

// ── env 読み込み ─────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SITE_URL    = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000'
const CRON_SECRET = process.env.CRON_SECRET ?? ''

// ══════════════════════════════════════════════════════════════════════════════
// ★ ここに X スクリーンネームを記入してください（@ なし）
//   screenName を空文字 '' にした行はスキップされます
// ══════════════════════════════════════════════════════════════════════════════
const UPDATES: { externalId: string; name: string; screenName: string }[] = [
  // ── ランキング上位（SNS実績あり） ─────────────────────────────────────────
  { externalId: 'dmm-actress-1092427', name: '北岡果林',       screenName: '' },
  { externalId: 'dmm-actress-1089946', name: '彩月七緒',       screenName: 'nao_satsuki' },
  { externalId: 'dmm-actress-1106862', name: '福田ゆあ',       screenName: 'yua_fucuda' },
  { externalId: 'dmm-actress-1030262', name: '三上悠亜',       screenName: 'yua_mikami' },
  { externalId: 'dmm-actress-1087624', name: '佐々木さき',     screenName: 'Sasaki_Saki' },
  { externalId: 'dmm-actress-1104926', name: '千咲ちな',       screenName: '' },
  { externalId: 'dmm-actress-1085289', name: '女神ジュン',     screenName: '' },
  { externalId: 'dmm-actress-1060677', name: '小野六花',       screenName: 'onorikka' },
  { externalId: 'dmm-actress-1088602', name: '逢沢みゆ',       screenName: 'Aizawa_miyu03' },
  // ── ポイント 0（SNS未確認） ───────────────────────────────────────────────
  { externalId: 'dmm-actress-1008887', name: 'AIKA',           screenName: '' },
  { externalId: 'dmm-actress-1092582', name: 'Himari',         screenName: '' },
  { externalId: 'dmm-actress-1004672', name: 'JULIA',          screenName: '' },
  { externalId: 'dmm-actress-15570',   name: 'KAORI',          screenName: '' },
  { externalId: 'dmm-actress-1069697', name: 'MINAMO',         screenName: '' },
  { externalId: 'dmm-actress-1069632', name: 'miru',           screenName: '' },
  { externalId: 'dmm-actress-1069257', name: 'Nia（伊東める）', screenName: '' },
  { externalId: 'dmm-actress-1044274', name: 'NIMO',           screenName: '' },
  { externalId: 'dmm-actress-1090552', name: 'RARA',           screenName: '' },
  { externalId: 'dmm-actress-1090830', name: 'riisa',          screenName: '' },
  { externalId: 'dmm-actress-1106361', name: 'Soa',            screenName: '' },
  { externalId: 'dmm-actress-23343',   name: 'あいぶらん',     screenName: '' },
  { externalId: 'dmm-actress-1102259', name: 'あいみ',         screenName: '' },
  { externalId: 'dmm-actress-1032774', name: 'あおいれな',     screenName: '' },
  { externalId: 'dmm-actress-1092584', name: 'あおい藍',       screenName: '' },
  { externalId: 'dmm-actress-1093154', name: 'あかね麗',       screenName: '' },
  { externalId: 'dmm-actress-1111297', name: 'アシュリー・アダムス', screenName: '' },
  { externalId: 'dmm-actress-1104165', name: 'あずま鈴',       screenName: '' },
  { externalId: 'dmm-actress-1088424', name: 'アテナ・アンダーソン', screenName: '' },
  { externalId: 'dmm-actress-1015712', name: 'あべみかこ',     screenName: '' },
  { externalId: 'dmm-actress-1089064', name: 'あべ藍',         screenName: '' },
  { externalId: 'dmm-actress-1039158', name: 'あまね弥生',     screenName: '' },
  { externalId: 'dmm-actress-1048558', name: 'あゆみ莉花',     screenName: '' },
  { externalId: 'dmm-actress-1111125', name: 'アリサ・ミラー', screenName: '' },
  { externalId: 'dmm-actress-1040117', name: 'アレックス・グレイ', screenName: '' },
  { externalId: 'dmm-actress-1098949', name: 'あんづ杏',       screenName: '' },
  { externalId: 'dmm-actress-1103118', name: 'アンバー・カワイ', screenName: '' },
  { externalId: 'dmm-actress-1108974', name: 'いいなりなお',   screenName: '' },
  { externalId: 'dmm-actress-1077613', name: 'いちか先生',     screenName: '' },
  { externalId: 'dmm-actress-1045438', name: 'イライザ・ジェーン', screenName: '' },
  { externalId: 'dmm-actress-1085384', name: 'ヴァネッサ・ヴェガ', screenName: '' },
  { externalId: 'dmm-actress-1074740', name: 'うんぱい',       screenName: 'unpai3' },
  { externalId: 'dmm-actress-1062811', name: 'エヴァ・キャッツ', screenName: '' },
  { externalId: 'dmm-actress-1102909', name: 'おりょう',       screenName: '' },
  { externalId: 'dmm-actress-1095070', name: 'おりん',         screenName: '' },
  { externalId: 'dmm-actress-1085385', name: 'カトリーナ・コルト', screenName: '' },
  { externalId: 'dmm-actress-1080669', name: 'ここな友紀',     screenName: '' },
  { externalId: 'dmm-actress-1111130', name: 'さくまつな',     screenName: '' },
  { externalId: 'dmm-actress-1062041', name: 'さつき芽衣',     screenName: 'satsuki_meisabu' },
  { externalId: 'dmm-actress-1073098', name: 'ジア・デルザ',   screenName: '' },
  { externalId: 'dmm-actress-1088425', name: 'ジアナ・ディオール', screenName: '' },
  { externalId: 'dmm-actress-1091975', name: 'しゃびー',       screenName: '' },
  { externalId: 'dmm-actress-1047541', name: 'シンディ・スターフォール', screenName: '' },
  { externalId: 'dmm-actress-1024057', name: 'スキン ダイアモンド', screenName: '' },
  { externalId: 'dmm-actress-1094368', name: 'スリムシック・ヴィック', screenName: '' },
  { externalId: 'dmm-actress-1084113', name: 'セアドラ・デイ', screenName: '' },
  { externalId: 'dmm-actress-1063631', name: 'ちなみん',       screenName: '' },
  { externalId: 'dmm-actress-1110615', name: 'ちゃんゆあ',     screenName: '' },
  { externalId: 'dmm-actress-1072395', name: 'つばさ舞',       screenName: '' },
  { externalId: 'dmm-actress-17802',   name: 'つぼみ',         screenName: '' },
  { externalId: 'dmm-actress-1015472', name: 'ティア',         screenName: '' },
  { externalId: 'dmm-actress-1066533', name: 'ななこ',         screenName: '' },
  { externalId: 'dmm-actress-1042431', name: 'ななせ麻衣',     screenName: '' },
  { externalId: 'dmm-actress-1078113', name: 'ひかり唯',       screenName: '' },
  { externalId: 'dmm-actress-1069961', name: 'ひなたなつ',     screenName: '' },
  { externalId: 'dmm-actress-1104815', name: 'ひなの花音',     screenName: '' },
  { externalId: 'dmm-actress-1046434', name: 'ブラック・パンサー', screenName: '' },
  { externalId: 'dmm-actress-1073111', name: 'ブルックリン・グレイ', screenName: '' },
  { externalId: 'dmm-actress-1047543', name: 'プレスリー・カーター', screenName: '' },
  { externalId: 'dmm-actress-1088427', name: 'ペイジ・オウェンス', screenName: '' },
  { externalId: 'dmm-actress-1088429', name: 'ベラ・ルッサ',   screenName: '' },
  { externalId: 'dmm-actress-1047027', name: 'ホープ',         screenName: '' },
  { externalId: 'dmm-actress-1000103', name: 'ましろ杏',       screenName: '' },
  { externalId: 'dmm-actress-1108973', name: 'マリアバレンタイン', screenName: '' },
  { externalId: 'dmm-actress-1092769', name: 'まんげつおちゃずけくも', screenName: '' },
  { externalId: 'dmm-actress-1008830', name: 'みなみ想',       screenName: '' },
  { externalId: 'dmm-actress-1086580', name: 'みなみ羽琉',     screenName: '' },
  { externalId: 'dmm-actress-1039995', name: 'みひな',         screenName: '' },
  { externalId: 'dmm-actress-1107342', name: 'むとうあやか',   screenName: '' },
  { externalId: 'dmm-actress-22574',   name: 'めぐり',         screenName: '' },
  { externalId: 'dmm-actress-1057827', name: 'メロディー・雛・マークス', screenName: '' },
  { externalId: 'dmm-actress-1055816', name: 'もなみ鈴',       screenName: '' },
  { externalId: 'dmm-actress-1103452', name: 'ももの真利奈',   screenName: '' },
  { externalId: 'dmm-actress-1108583', name: 'ゆうきすず',     screenName: '' },
  { externalId: 'dmm-actress-1111316', name: 'ゆうき希',       screenName: '' },
  { externalId: 'dmm-actress-592',     name: 'よしい美希',     screenName: '' },
  { externalId: 'dmm-actress-1047031', name: 'ライリー・リード', screenName: '' },
  { externalId: 'dmm-actress-1046432', name: 'ライリー・リッチマン', screenName: '' },
  { externalId: 'dmm-actress-1111126', name: 'ロッキー・スター', screenName: '' },
  { externalId: 'dmm-actress-1096319', name: 'わか菜ほの',     screenName: '' },
  { externalId: 'dmm-actress-1042432', name: '一ノ瀬恋',       screenName: 'koi_ichinose' },
  { externalId: 'dmm-actress-1075159', name: '一乃あおい',     screenName: '' },
  { externalId: 'dmm-actress-1110889', name: '一之瀬凪',       screenName: '' },
  { externalId: 'dmm-actress-1092657', name: '一二三ゆぅり',   screenName: '' },
  { externalId: 'dmm-actress-1078010', name: '一場れいか',     screenName: '' },
  { externalId: 'dmm-actress-1100717', name: '一宮るい',       screenName: '' },
  { externalId: 'dmm-actress-1044544', name: '一条みお',       screenName: '' },
  { externalId: 'dmm-actress-1017210', name: '一条綺美香',     screenName: '' },
  { externalId: 'dmm-actress-1088749', name: '一色さら',       screenName: '' },
  { externalId: 'dmm-actress-1036673', name: '一色なつ美',     screenName: '' },
  { externalId: 'dmm-actress-1037291', name: '一色桃子',       screenName: '' },
]
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  const targets = UPDATES.filter(u => u.screenName.trim() !== '')

  if (targets.length === 0) {
    console.log('⚠  screenName が記入されているエントリがありません。UPDATES 配列を確認してください。')
    return
  }

  console.log(`→ ${targets.length} 件を更新します\n`)

  let ok = 0; let fail = 0
  const addedToList: typeof targets = []

  for (const { externalId, name, screenName } of targets) {
    const { error } = await supabase
      .from('actresses')
      .update({ twitter_screen_name: screenName })
      .eq('external_id', externalId)

    if (error) {
      console.error(`  ✗ ${name} (${externalId}): ${error.message}`)
      fail++
    } else {
      console.log(`  ✓ ${name} → @${screenName}`)
      ok++
      addedToList.push({ externalId, name, screenName })
    }
  }

  console.log(`\n完了: ${ok} 件成功 / ${fail} 件失敗`)

  // socialFeedActresses.ts に未登録のものを追記
  if (addedToList.length > 0) {
    const listPath = path.join(__dirname, '..', 'src', 'lib', 'socialFeedActresses.ts')
    let content = fs.readFileSync(listPath, 'utf8')
    const newEntries: string[] = []

    for (const { name, screenName } of addedToList) {
      if (!content.includes(`'${screenName}'`) && !content.includes(`"${screenName}"`)) {
        newEntries.push(`  { name: '${name}',     screenName: '${screenName}'    },`)
      }
    }

    if (newEntries.length > 0) {
      const date    = new Date().toISOString().split('T')[0]
      const section = `  // ── バルク追加（${date}） ─────────────────────────────────────\n`
                    + newEntries.join('\n') + '\n'
      const lastBracket = content.lastIndexOf(']')
      content = content.slice(0, lastBracket) + section + content.slice(lastBracket)
      fs.writeFileSync(listPath, content)
      console.log(`\n✓ socialFeedActresses.ts に ${newEntries.length} 件追記しました`)
      console.log('  ⚠  bash deploy.sh を実行して本番へ反映してください')
    } else {
      console.log('\nℹ  socialFeedActresses.ts への追記なし（全件既登録）')
    }
  }

  // 同期キック
  if (ok > 0) {
    console.log('\n→ SNS 同期をキックしています...')
    try {
      const res  = await fetch(`${SITE_URL}/verity/api/revalidate-sns`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      })
      const body = await res.json() as Record<string, unknown>
      console.log(`✓ 同期レスポンス:`, body)
    } catch (e) {
      console.warn(`⚠  同期リクエスト失敗（サーバー起動確認）:`, (e as Error).message)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
