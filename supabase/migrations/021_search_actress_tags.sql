-- 記事タグから女優名候補を動的に検索するRPC関数
-- 女優マスターにヒットしない・少ない場合のフォールバック用
CREATE OR REPLACE FUNCTION search_actress_tags(keyword TEXT, max_results INT DEFAULT 10)
RETURNS TABLE(tag_name TEXT, article_count BIGINT) AS $$
SELECT tag_val, COUNT(*) AS cnt
FROM (
  SELECT unnest(tags) AS tag_val
  FROM articles
  WHERE is_active = true
    AND (tags::text) ILIKE '%' || keyword || '%'
) sub
WHERE tag_val ILIKE '%' || keyword || '%'
  AND char_length(tag_val) BETWEEN 2 AND 20
GROUP BY tag_val
ORDER BY cnt DESC
LIMIT max_results;
$$ LANGUAGE sql STABLE;
