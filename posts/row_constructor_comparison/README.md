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

성능 차이의 이유
두 번째 쿼리가 더 나은 성능을 보이는 이유는 다음과 같습니다:

단일 비교 연산:

첫 번째 쿼리는 두 개의 조건을 사용하여 비교를 수행합니다. 즉, Posts.CreateAt와 Posts.Id를 별도로 비교합니다. 이로 인해 PostgreSQL이 각 행에 대해 두 번의 비교를 수행해야 합니다.
두 번째 쿼리는 행 생성자(row constructor)를 사용하여 단일 비교 연산을 수행합니다. (Posts.CreateAt, Posts.Id) > (?1, ?2)는 사전식 순서로 두 열의 값을 한 번에 비교하므로 비교 연산이 단순화됩니다.
인덱스 활용:

PostgreSQL은 다중 열 인덱스를 효과적으로 사용할 수 있습니다. 예를 들어, CREATE INDEX idx ON Posts (CreateAt, Id); 인덱스가 있다고 가정하면, 두 번째 쿼리는 이 인덱스를 사용하여 (CreateAt, Id)의 조합을 빠르게 찾을 수 있습니다.
첫 번째 쿼리는 인덱스를 사용할 때 두 조건을 평가해야 하므로, 인덱스를 효율적으로 활용하기 어려울 수 있습니다.

두 개의 쿼리를 사용하여 동일한 테이블을 필터링한다고 가정해 봅시다. Posts 테이블에 다음과 같은 데이터가 있다고 가정하겠습니다:

Id	CreateAt
1	2023-01-01 00:00:00
2	2023-01-01 00:01:00
3	2023-01-02 00:00:00

여기서 ?1 = '2023-01-01 00:00:00'이고 ?2 = 1이라고 가정하면:

첫 번째 쿼리는 CreateAt > '2023-01-01 00:00:00' 또는 CreateAt = '2023-01-01 00:00:00' AND Id > 1을 만족하는 행을 찾습니다.
두 번째 쿼리는 (CreateAt, Id) > ('2023-01-01 00:00:00', 1)을 만족하는 행을 찾습니다.
두 번째 쿼리는 단일 비교 연산을 통해 바로 행을 찾을 수 있어 더 빠르고 효율적입니다.

따라서 두 번째 쿼리는 단일 비교 연산과 인덱스 활용 측면에서 성능이 더 좋습니다. 이는 특히 대용량 데이터셋에서 더 큰 성능 차이를 보일 수 있습니다.





