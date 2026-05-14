-- actresses に is_recommended カラムを追加（2026-05-13）
-- RECOMMENDED_ACTRESS_NAMES（src/lib/recommendedActresses.ts）と同期して初期シード

ALTER TABLE public.actresses
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS actresses_is_recommended_idx
  ON public.actresses (is_recommended)
  WHERE is_recommended = true;

-- 初期シード: recommendedActresses.ts の RECOMMENDED_ACTRESS_NAMES と一致させる
-- この UPDATE は冪等。名前を追加・削除する際は対応する UPDATE/SET を追記すること。
UPDATE public.actresses
SET is_recommended = true
WHERE name IN (
  '石川澪', '小野六花', '本庄鈴', '石原希望', '白石透羽', '三咲まゆ', '佐々木さき',
  '瀬戸環奈', '河北彩伽', '逢沢みゆ', '福田ゆあ', '北岡果林', '井上もも', '八木奈々',
  '博多彩葉', '本郷愛', '美園和花', '伊藤舞雪', '羽月乃蒼', '早坂奏音', '日向由奈',
  '青空ひかり', '乙アリス', '波多野結衣', '楪カレン', '松本いちか', 'MINAMO',
  '莉々はるか', '彩月七緒', '柏木こなつ', '宍戸里帆', '東條なつ', '川越にこ',
  '百田光稀', '花守夏歩', '月野かすみ'
);
