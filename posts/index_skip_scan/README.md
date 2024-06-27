# PostgreSQL Index Skip Scan

Index Skip Scan 기능은 인덱스의 첫 번째 컬럼이 쿼리의 WHERE 절에 없더라도 인덱스의 나머지 컬럼을 활용할 수 있게 해준다. PostgreSQL에서는 이와 같은 기능이 기본적으로 지원되지 않기 때문에, 유사한 효과를 내기 위해서는 다른 접근 방식을 사용해야 합니다.  
여기서는 CTE (Common Table Expressions)와 재귀 쿼리를 활용하여 PostgreSQL에서 비슷한 성능 최적화를 이루는 사례를 설명합니다.

### 기존 상황

먼저, 주어진 `sales` 테이블과 인덱스 구조는 다음과 같습니다:
```sql
CREATE TABLE sales (
    sale_id numeric NOT NULL,
    employee_id numeric NOT NULL,
    subsidiary_id numeric NOT NULL,
    sale_date date NOT NULL,
    eur_value numeric(17,2) NOT NULL,
    product_id bigint NOT NULL,
    quantity integer NOT NULL,
    channel character varying(4) NOT NULL
);
CREATE INDEX sales_x01 ON sales USING btree (product_id, sale_date, eur_value);
```

튜닝 전의 SQL 쿼리는 아래와 같습니다:

```sql
SELECT SALE_DATE, EUR_VALUE, EMPLOYEE_ID
  FROM SALES
 WHERE SALE_DATE = DATE '2021-03-29'
   AND EUR_VALUE 700;
```


이 쿼리는 인덱스를 사용하지 않고 전체 테이블을 스캔하기 때문에 성능이 좋지 않았습니다. 실행 계획은 다음과 같았습니다:

```sql
Seq Scan on sales (actual time=314.511..314.585 rows=212 loops=1)
Filter: ((eur_value '700'::numeric) AND (sale_date = '2021-03-29'::date))
Rows Removed by Filter: 2206042
Buffers: shared hit=5015 read=17730
Planning Time: 0.134 ms
Execution Time: 314.696 ms
```

전체 테이블을 스캔하며 많은 블록 I/O가 발생했습니다.

### 통계 정보

SALES 테이블의 통계 정보를 조회한 결과 `product_id` 컬럼의 distinct value가 26임을 확인했습니다.  
이는 Oracle의 Index Skip Scan이 동작할 가능성이 높은 환경입니다.

```sql
SELECT tablename, attname, n_distinct FROM PG_STATS WHERE TABLENAME='sales';
```

결과:

```
tablename    attname       n_distinct
sales        sale_id       -1.0
sales        employee_id   143.0
sales        subsidiary_id 1.0
sales        sale_date     3129.0
sales        eur_value     94470.0
sales        product_id    26.0
sales        quantity      6.0
sales        channel       2.0
```

### 성능 개선

PostgreSQL에서 Index Skip Scan과 유사한 효과를 얻기 위해 CTE와 재귀 쿼리를 사용하여 `product_id`의 distinct 값을 빠르게 추출했습니다:

```sql
WITH RECURSIVE W AS (
    SELECT MIN(PRODUCT_ID) AS PRODUCT_ID
    FROM SALES
    UNION ALL
    SELECT (SELECT MIN(PRODUCT_ID) FROM SALES A WHERE A.PRODUCT_ID W.PRODUCT_ID)
    FROM W
    WHERE PRODUCT_ID IS NOT NULL
)
SELECT SALE_DATE, EUR_VALUE, EMPLOYEE_ID
FROM SALES
WHERE PRODUCT_ID IN (SELECT PRODUCT_ID FROM W)
  AND SALE_DATE = DATE '2021-03-29'
  AND EUR_VALUE 700;
```

이 쿼리의 실행 계획은 다음과 같습니다:

```sql
Nested Loop (actual time=0.361..0.600 rows=212 loops=1)
Buffers: shared hit=357
CTE w
-Recursive Union (actual time=0.046..0.329 rows=27 loops=1)
Buffers: shared hit=89
-Result (actual time=0.045..0.046 rows=1 loops=1)
Buffers: shared hit=4
InitPlan 3 (returns $1)
-Limit (actual time=0.042..0.043 rows=1 loops=1)
Buffers: shared hit=4
-Index Only Scan using sales_x01 on sales sales_1 (actual time=0.041..0.042 rows=1 loops=1)
Index Cond: (product_id IS NOT NULL)
Heap Fetches: 0
Buffers: shared hit=4
-WorkTable Scan on w w_1 (actual time=0.010..0.010 rows=1 loops=27)
Filter: (product_id IS NOT NULL)
Rows Removed by Filter: 0
Buffers: shared hit=85
SubPlan 2
-Result (actual time=0.009..0.009 rows=1 loops=26)
Buffers: shared hit=85
InitPlan 1 (returns $3)
-Limit (actual time=0.009..0.009 rows=1 loops=26)
Buffers: shared hit=85
-Index Only Scan using sales_x01 on sales a (actual time=0.008..0.008 rows=1 loops=26)
Index Cond: ((product_id IS NOT NULL) AND (product_id w_1.product_id))
Heap Fetches: 6
Buffers: shared hit=85
-HashAggregate (actual time=0.351..0.358 rows=27 loops=1)
Group Key: w.product_id
Batches: 1 Memory Usage: 24kB
Buffers: shared hit=89
-CTE Scan on w (actual time=0.047..0.338 rows=27 loops=1)
Buffers: shared hit=89
-Index Scan using sales_x01 on sales (actual time=0.004..0.007 rows=8 loops=27)
Index Cond: ((product_id = w.product_id) AND (sale_date = '2021-03-29'::date) AND (eur_value '700'::numeric))
Buffers: shared hit=268
Planning Time: 0.263 ms
Execution Time: 0.762 ms
```

### 결론
튜닝 후 쿼리의 성능은 크게 향상되었습니다:
- ELAPSED TIME: 314.696ms → 0.762ms
- Block I/O: 4983+17762 (전체 테이블 스캔) → 357 (인덱스와 CTE 활용)

이 방법은 인덱스 추가에 따른 부하를 피하면서 성능을 개선하는 좋은 예시입니다. 그러나 재귀 쿼리는 주의 깊게 사용해야 하며, 데이터베이스의 전체 성능에 미치는 영향을 모니터링하는 것이 중요합니다.

### 성능 개선의 이유
이 방법이 성능을 크게 개선하는 이유는 다음과 같습니다:

- **효과적인 인덱스 사용**: 인덱스의 첫 번째 컬럼인 `product_id`를 사용하여 인덱스를 효과적으로 사용할 수 있습니다. 이를 통해 전체 테이블 스캔을 피하고, 인덱스만으로도 필요한 데이터를 빠르게 조회할 수 있습니다.
- **블록 I/O 감소**: 전체 테이블을 스캔하는 대신 인덱스를 활용하여 필요한 데이터만 읽으므로, 블록 I/O가 크게 감소합니다. 이는 쿼리의 실행 시간을 단축시키는 주요 요인입니다.
- **재귀 쿼리의 효율성**: 재귀 쿼리를 사용하여 `product_id`의 distinct 값을 순차적으로 가져오므로, 필요 없는 데이터를 읽지 않습니다. 이 또한 성능을 향상시키는 데 기여합니다.

### 요약

PostgreSQL에서 인덱스를 효과적으로 사용하지 못하는 문제를 해결하기 위해, 재귀 쿼리와 CTE를 사용하여 인덱스를 활용할 수 있게 한 것입니다. 이로 인해 전체 테이블 스캔 대신 인덱스만을 사용하여 필요한 데이터를 조회하게 되어 성능이 크게 개선되었습니다.

MySQL에서는 비슷한 상황이 발생할 수 있지만, MySQL의 쿼리 최적화 방식이나 인덱스 사용 방법이 PostgreSQL과 다를 수 있습니다. 따라서 MySQL에서 동일한 문제를 해결하려면 MySQL의 최적화 기능과 인덱스 사용 방식을 이해하고, 이에 맞는 쿼리 최적화 방법을 적용해야 합니다.

