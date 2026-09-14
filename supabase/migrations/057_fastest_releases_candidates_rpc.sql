-- ══════════════════════════════════════════════════════════════════════════════
-- 057_fastest_releases_candidates_rpc.sql — 最新作最速更新情報 Refresh Phase 1
-- ══════════════════════════════════════════════════════════════════════════════
-- 【背景】既存実装(src/lib/fastestReleases.ts)は対象8メーカーに対して
--   メーカーごとに2クエリ(MAX(fetched_at)特定 → 完全一致行取得)を実行していた。
--   対象を57メーカー(src/lib/makers.ts の MAKERS 全件)へ拡張すると、この方式は
--   最大114クエリ・57個の独立unstable_cacheエントリへ膨張し、N+1問題として
--   実質的なリスクレベルに達する（過去のanalytics incident同様のパターン）。
--
--   本RPCは、対象メーカーID群を受け取り、各メーカーにつき
--   「fetched_at降順で上位N件」をwindow function(row_number)で1クエリで
--   まとめて返す。返却された行群から、
--     - 各メーカーの「最新batch」(同一fetched_at値の行群)
--     - 「batch未満の場合の補完候補プール」(batchより前の行)
--   をアプリ側のpure logic(src/lib/fastestReleasesSelection.mjs の
--   selectFastestCardsVariable)が構成する。DB側は「候補を集めて返す」だけに
--   留め、5〜10件可変表示・floor決定・同一作品dedupeのロジックはSQL化しない
--   (既存のpure/testable な設計方針を維持するため)。
--
-- 【対象メーカー抽出の仕組み】
--   articles.metadata の maker 配列は 043_weekly_rankings_maker_fix.sql で
--   確認済みの実構造 `metadata->'maker'->0->>'id'` (DMM APIのmaker配列の
--   先頭要素のid)を等価抽出に使う。DB側でintキャストは行わない
--   (万一想定外の非数値データが混入していてもRPC全体がエラーにならないよう、
--   text比較に統一する安全側の設計)。呼び出し側(アプリ)がmaker idを
--   text配列に変換して渡す。
--
-- 【Pre-Production Review反映】
--   A. p_limit_per_maker に上限が無かった(BLOCKER)。本RPCはanonへGRANTされ
--      PostgREST経由で直接呼び出し可能なため、任意の巨大な値(例: 1000000)を
--      渡すと実データ規模(articles全体)まで結果セットが膨らみ得た。
--      effective_limit = LEAST(GREATEST(COALESCE(p_limit_per_maker,40),10),100)
--      で 10〜100 の範囲へclampする。アプリ本体は常に40を渡すため通常時の
--      挙動は変化しない(GREATEST(40,10)=40, LEAST(40,100)=40)。
--      COALESCEを入れているのは、Postgresの引数DEFAULTは「引数を省略した
--      呼び出し」にのみ適用され、呼び出し側が明示的にNULLを渡した場合は
--      DEFAULTが効かずNULLのまま関数本体に渡るため(公式ドキュメント通りの
--      挙動)。GREATEST/LEAST単体はNULLをスキップして残りの引数で比較する
--      ためNULL単体では機能するが、COALESCEで先に既定値へ倒す方が意図が
--      明示的で読みやすいと判断した。
--   B. SECURITY DEFINER→SECURITY INVOKERへ変更。articlesは001_initial_schema.sqlで
--      「is_active=true行のSELECTをanon/authenticatedへ既にGRANT+RLS許可済み」
--      であり、本RPCが読むのはこの範囲のみ(他テーブル参照・RLSバイパスが
--      必要な処理は無い)。SECURITY INVOKERで呼び出し元(anon/authenticated)
--      自身の権限のまま実行しても同じ結果になることをRLS/GRANT定義から
--      確認済み。INVOKERの方が「将来この関数が改修されて別テーブルを
--      参照するようになった場合にもRLSが自動的に効く」という多層防御の
--      観点で保守的なため、今回変更する(031/053のget_top_works_ranked等は
--      既存のDEFINER方針のまま・本migrationでは変更しない)。
--      search_path固定はSECURITY INVOKERでも同様に有効なため維持する。
-- 【冪等性】CREATE OR REPLACE FUNCTION のみ。DROPなし。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_fastest_releases_candidates(
  p_maker_ids text[],
  p_limit_per_maker int DEFAULT 40
)
RETURNS TABLE(
  maker_id      text,
  external_id   text,
  title         text,
  slug          text,
  image_url     text,
  metadata      jsonb,
  published_at  timestamptz,
  fetched_at    timestamptz
)
LANGUAGE sql SECURITY INVOKER SET search_path = public STABLE AS $$
  SELECT maker_id, external_id, title, slug, image_url, metadata, published_at, fetched_at
  FROM (
    SELECT
      (a.metadata -> 'maker' -> 0 ->> 'id') AS maker_id,
      a.external_id, a.title, a.slug, a.image_url, a.metadata, a.published_at, a.fetched_at,
      row_number() OVER (
        PARTITION BY (a.metadata -> 'maker' -> 0 ->> 'id')
        ORDER BY a.fetched_at DESC, a.external_id DESC
      ) AS rn
    FROM public.articles a
    WHERE a.is_active
      AND (a.metadata ->> 'floor') IN ('videoa', 'dvd')
      AND (a.metadata -> 'maker' -> 0 ->> 'id') = ANY (p_maker_ids)
  ) ranked
  WHERE rn <= LEAST(GREATEST(COALESCE(p_limit_per_maker, 40), 10), 100)
  ORDER BY maker_id, fetched_at DESC, external_id DESC;
$$;

-- 匿名含む公開Homepage/一覧ページから直接呼ばれるため、既存の公開系RPC
-- (get_top_works_ranked 等)と同じ権限モデル(anon/authenticated/service_role)にする。
-- articles自体も001_initial_schema.sqlのRLSで匿名にis_active行のSELECTを
-- 既に許可しているため、本RPCは新たな権限拡大を行わない
-- (SECURITY INVOKERへの変更後もこの権限範囲は変わらない)。
GRANT EXECUTE ON FUNCTION public.get_fastest_releases_candidates(text[], int) TO anon, authenticated, service_role;
