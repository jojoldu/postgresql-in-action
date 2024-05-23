# row constructor comparison로 성능 개선하기

```sql
SELECT Posts.*
  FROM Posts 
  WHERE
    Posts.CreateAt > ?1
    OR
    (Posts.CreateAt = ?1 AND Posts.Id > ?2)
  ORDER BY Posts.CreateAt ASC, Posts.Id ASC
  LIMIT ?3;
```

```sql
SELECT Posts.*,
  FROM Posts 
  WHERE (Posts.CreateAt, Posts.Id) > (?1, ?2)
  ORDER BY Posts.CreateAt ASC, Posts.Id ASC
  LIMIT ?3;
```

[EXPLAIN (ANALYZE, BUFFERS)](https://willj.net/posts/buffer-analysis-when-using-explain-analyse-in-postgres/)

