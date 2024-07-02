# [PostgreSQL] n_distinct 와 Index Skip Scan

PostgreSQL에는 `PG_STATS` 을 통해 테이블의 통계 정보를 제공한다. 
이를 쿼리 플래너가 최적의 쿼리 실행 계획을 세우는 데 사용한다.  
  
이 중 주요 컬럼 중 하나는 `n_distinct`로, 이는 해당 열의 고유 값의 수에 대한 통계치를 나타낸다.

- `n_distinct`: [해당 열의 고유 값의 수에 대한 추정치](https://www.postgresql.org/docs/current/view-pg-stats.html)

> 물론 이 외에도 다양한 정보를 제공하기도 한다.
> - `null_frac`: 열 값이 NULL인 비율
> - `avg_width`: 열의 평균 바이트 길이
> - `most_common_vals`: 가장 흔한 값들
> - `most_common_freqs`: 가장 흔한 값들의 빈도

`n_distinct` 의 수치는 다음을 의미한다.

- 양수: **고유값의 수**
  - 열에 가능한 값의 수가 고정되어 있는 것으로 보이는 경우
- 음수: **고유 값의 수를 행 수에 대한 비율**
  - 예를 들어, `-0.5`는 전체 행의 절반이 고유 값이며 `-1` 은 전체가 고유 값임을 의미한다.
  - **테이블이 커짐에 따라 고유 값의 수가 증가할 것으로 예상**되는 경우에 사용

`n_distinct` 가 어느정도일때 인덱스 적용이 수월할까?

- 매우 낮은 n_distinct (1 ~ 수십)
  - 고유 값의 수가 매우 적을 때 인덱스는 매우 효율적으로 작동한다.
  - 예: 성별 (남/여)처럼 고유 값이 적은 열.
  - 인덱스 스캔과 Index Skip Scan 모두 효율적일 수 있다.

- 낮은 n_distinct (수십 ~ 수백)
  - 고유 값의 수가 적으므로 인덱스가 여전히 효율적으로 작동할 수 있다.
  - 예: 소수의 부서 코드 또는 등급.
  - 인덱스 스캔이 적절하며, 필요에 따라 Index Skip Scan이 유용할 수 있다.

- 중간 n_distinct (수백 ~ 수천)
  - 고유 값의 수가 중간 정도일 때 인덱스의 효율성은 데이터의 분포와 쿼리 패턴에 따라 달라질 수 있다.
  - 예: 특정 카테고리 코드.
  - 인덱스 스캔이 일반적으로 효율적이지만, 특정 경우에만 Index Skip Scan이 유용할 수 있다.

- 높은 n_distinct (수천 ~ 수만 이상)
  - 고유 값의 수가 매우 많으면 인덱스의 효율성이 떨어질 수 있다.
  - 예: 유저 ID, 주문 번호.
  - 전체 인덱스 스캔이 필요할 수 있으며, Index Skip Scan의 효율성이 떨어질 수 있다.

> 쿼리 최적화 관점에서 고유 값이 적을 때 인덱스를 사용한 범위 검색이 매우 효율적이다.
> DISTINCT나 GROUP BY와 같은 쿼리에서 고유 값이 적을 때 인덱스 스킵 스캔이 유용하다.

이를 활용해 기존 쿼리를 분석하고 개선해보자.


### 예시

다음은 `employees` 테이블의 `department` 열에 대한 통계 정보를 확인하는 예시이다.

#### 1. 샘플 테이블 생성 및 데이터 삽입

```sql
create table posts (
    id serial primary key,
    course_id integer,
    type              varchar(255),
    is_spam           boolean                  default false,
    deleted_at        timestamp with time zone
);

create index idx_posts_1 on posts (type, course_id, is_spam, deleted_at);
```

#### 2. 통계 수집

```sql
ANALYZE employees;
```

#### 3. `PG_STATS`에서 통계 정보 조회

```sql
SELECT
    schemaname,
    tablename,
    attname,
    null_frac,
    avg_width,
    n_distinct,
    most_common_vals,
    most_common_freqs
FROM
    pg_stats
WHERE
    tablename = 'employees' AND attname = 'department';
```

### 예시 결과 해석

결과는 다음과 같을 수 있다.

| schemaname | tablename | attname    | null_frac | avg_width | n_distinct | most_common_vals      | most_common_freqs    |
|------------|-----------|------------|-----------|-----------|------------|-----------------------|----------------------|
| public     | employees | department | 0.0       | 10        | -0.428571  | {HR,Engineering,Marketing} | {0.428571, 0.285714, 0.285714} |

- `null_frac`가 0.0이므로 `department` 열에 NULL 값은 없다.
- `avg_width`는 10으로, `department` 열의 평균 길이가 10바이트이다.
- `n_distinct`가 -0.428571이므로, 전체 행의 약 42.8571%가 고유한 `department` 값을 가진다.
- `most_common_vals`는 `HR`, `Engineering`, `Marketing`이며, 각각의 빈도는 42.8571%, 28.5714%, 28.5714%이다.

이 정보를 통해 쿼리 플래너는 `department` 열을 포함하는 쿼리의 실행 계획을 최적화할 수 있다.  
`n_distinct`와 같은 통계 정보는 데이터베이스 성능 최적화에 매우 중요한 역할을 한다.

#### `n_distinct`와 Index Skip Scan의 관계

`n_distinct` 값이 작으면, 즉 해당 열의 고유 값의 수가 적으면 Index Skip Scan이 더 효율적일 수 있다.  
이는 인덱스를 사용하여 고유 값을 빠르게 찾을 수 있기 때문이다.  
반면, `n_distinct` 값이 크면 Index Skip Scan의 효율성이 떨어질 수 있다.

#### 예시
다음은 `employees` 테이블에서 `department` 열의 `n_distinct` 값을 이용한 Index Skip Scan 적용 예시이다.

1. **샘플 테이블 생성 및 데이터 삽입**
```sql
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    department VARCHAR(50)
);

INSERT INTO employees (name, department) VALUES
('Alice', 'HR'),
('Bob', 'Engineering'),
('Charlie', 'Engineering'),
('David', 'HR'),
('Eve', 'Marketing'),
('Frank', 'HR'),
('Grace', 'Marketing');
```

2. **인덱스 생성**
```sql
CREATE INDEX idx_department ON employees(department);
```

3. **통계 수집**
```sql
ANALYZE employees;
```

4. **`PG_STATS`에서 `n_distinct` 확인**
```sql
SELECT
    schemaname,
    tablename,
    attname,
    n_distinct
FROM
    pg_stats
WHERE
    tablename = 'employees' AND attname = 'department';
```

위 쿼리 결과에서 `n_distinct` 값이 -0.428571이라면, 이는 `department` 열의 고유 값이 전체 행의 약 42.8571%에 해당함을 의미한다.

5. **Index Skip Scan 적용 쿼리**
```sql
EXPLAIN ANALYZE
SELECT DISTINCT department FROM employees;
```

이 쿼리를 실행하면 쿼리 플래너는 인덱스 스킵 스캔을 사용할지 결정한다.  
`n_distinct` 값이 작으므로, 인덱스 스킵 스캔이 적용될 가능성이 크다.

#### Index Skip Scan의 장점

- **효율성**: 필요한 값들만 선택적으로 스캔하여 I/O 비용을 절감한다.
- **성능 향상**: 대용량 데이터베이스에서 쿼리 성능을 크게 향상시킬 수 있다.

#### 주의사항
- **n_distinct의 정확성**: `ANALYZE` 명령어를 통해 최신 통계를 유지해야 한다. 부정확한 `n_distinct` 값은 잘못된 쿼리 플래닝을 초래할 수 있다.
- **인덱스의 존재**: 인덱스 스킵 스캔을 사용하려면 해당 열에 인덱스가 있어야 한다.

`n_distinct`는 인덱스 스킵 스캔 적용 여부를 판단하는 중요한 지표로, 적절히 활용하면 데이터베이스 성능 최적화에 큰 도움이 된다.

`n_distinct`가 낮다는 것은 특정 열에 대해 고유 값의 수가 적다는 것을 의미하며, 이는 해당 열에 인덱스를 사용할 때 효율적일 수 있음을 나타낸다.  
`n_distinct`가 낮을 때 Index Skip Scan을 적용하는 이유는 특정 상황에서 효율성을 높일 수 있기 때문이다.  
다만, `n_distinct` 값이 낮다는 것이 반드시 Index Skip Scan이 항상 적용되어야 한다는 것을 의미하지는 않는다.

### Index Skip Scan의 개념
Index Skip Scan은 특정 인덱스에서 원하는 값을 건너뛰며 스캔하는 방법이다. 이는 특정 쿼리에서 유용할 수 있다.  
예를 들어, `DISTINCT`나 `GROUP BY` 쿼리에서 고유 값만을 찾기 위해 사용될 수 있다.

### `n_distinct`와 인덱스 사용의 관계

**일반적인 인덱스 스캔**: `n_distinct`가 낮을 때, 해당 열의 고유 값이 적으므로 인덱스 스캔이 효율적일 수 있다.  
인덱스를 사용하면 특정 값들을 빠르게 찾을 수 있다.

**Index Skip Scan**: `n_distinct`가 낮을 때, 인덱스 스킵 스캔은 고유 값들만 선택적으로 스캔하여 효율성을 높일 수 있다.  
이는 특히 `DISTINCT`나 `GROUP BY`와 같은 쿼리에서 유용하다.

### 예시
다음은 `employees` 테이블에서 `department` 열의 `n_distinct` 값이 낮을 때 Index Skip Scan이 적용되는 예시이다.

#### 샘플 데이터
```sql
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    department VARCHAR(50)
);

INSERT INTO employees (name, department) VALUES
('Alice', 'HR'),
('Bob', 'Engineering'),
('Charlie', 'Engineering'),
('David', 'HR'),
('Eve', 'Marketing'),
('Frank', 'HR'),
('Grace', 'Marketing');
```

#### 통계 수집
```sql
ANALYZE employees;
```

#### `PG_STATS`에서 `n_distinct` 확인
```sql
SELECT
    schemaname,
    tablename,
    attname,
    n_distinct
FROM
    pg_stats
WHERE
    tablename = 'employees' AND attname = 'department';
```

#### `EXPLAIN ANALYZE`를 통해 쿼리 플랜 확인
```sql
EXPLAIN ANALYZE
SELECT DISTINCT department FROM employees;
```

### `n_distinct`가 낮을 때의 장점
- **빠른 검색**: 인덱스를 사용하면 고유 값을 빠르게 검색할 수 있다.
- **효율적 스캔**: Index Skip Scan은 필요한 고유 값들만 선택적으로 스캔하므로, 불필요한 스캔을 줄일 수 있다.
- **성능 최적화**: 데이터가 클 경우, 고유 값이 적다면 Index Skip Scan을 통해 쿼리 성능을 최적화할 수 있다.

### 결론
- `n_distinct`가 낮을 때, 일반적인 인덱스 스캔뿐만 아니라 Index Skip Scan도 효율적으로 적용될 수 있다.
- 실제로 적용 여부는 쿼리 플래너가 데이터와 쿼리의 특성을 고려하여 결정한다.
- 쿼리 성능을 최적화하기 위해서는 `EXPLAIN ANALYZE`를 사용하여 쿼리 플랜을 확인하고, 적절한 인덱스 전략을 선택하는 것이 중요하다.

`n_distinct`가 낮다는 것은 특정 열에 대해 고유 값의 수가 적다는 것을 의미하며, 이는 해당 열에 인덱스를 사용할 때 효율적일 수 있음을 나타낸다.  
`n_distinct`가 낮을 때 Index Skip Scan을 적용하는 이유는 특정 상황에서 효율성을 높일 수 있기 때문이다.  
다만, `n_distinct` 값이 낮다는 것이 반드시 Index Skip Scan이 항상 적용되어야 한다는 것을 의미하지는 않는다.

## 구체적 사례

Index Skip Scan 기능은 인덱스의 첫 번째 컬럼이 쿼리의 WHERE 절에 없더라도 인덱스의 나머지 컬럼을 활용할 수 있게 해준다. PostgreSQL에서는 이와 같은 기능이 기본적으로 지원되지 않기 때문에, 유사한 효과를 내기 위해서는 다른 접근 방식을 사용해야 합니다.  
여기서는 CTE (Common Table Expressions)와 재귀 쿼리를 활용하여 PostgreSQL에서 비슷한 성능 최적화를 이루는 사례를 설명합니다.

### 기존 상황

먼저, 주어진 `sales` 테이블과 인덱스 구조는 다음과 같다.

```sql
create table posts (
    id serial primary key,
    course_id integer,
    type              varchar(255),
    is_spam           boolean                  default false,
    deleted_at        timestamp with time zone
);

create index idx_posts_1 on posts (type, course_id, is_spam, deleted_at);

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


이 쿼리는 인덱스를 사용하지 않고 전체 테이블을 스캔하기 때문에 성능이 좋지 않다.  
실행 계획은 다음과 같다.

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
튜닝 후 쿼리의 성능은 크게 향상되었다.


- ELAPSED TIME: 314.696ms -> 0.762ms
- Block I/O: 4983+17762 (전체 테이블 스캔) -> 357 (인덱스와 CTE 활용)


이 방법은 인덱스 추가에 따른 부하를 피하면서 성능을 개선하는 좋은 예시이다.  
다만, 이 방식은 재귀 쿼리를 사용하므로 데이터베이스의 전체 성능에 영향을 줄 수도 있다.  
그래서 해당 쿼리를 적용 후, 데이터베이스의 성능 모니터링을 꼭 수행해야 한다.  


### 성능 개선의 이유

이 방법이 성능을 크게 개선하는 이유는 다음과 같.

- **효과적인 인덱스 사용**: 인덱스의 첫 번째 컬럼인 `product_id`를 사용하여 인덱스를 효과적으로 사용할 수 있습니다. 이를 통해 전체 테이블 스캔을 피하고, 인덱스만으로도 필요한 데이터를 빠르게 조회할 수 있습니다.
- **블록 I/O 감소**: 전체 테이블을 스캔하는 대신 인덱스를 활용하여 필요한 데이터만 읽으므로, 블록 I/O가 크게 감소합니다. 이는 쿼리의 실행 시간을 단축시키는 주요 요인입니다.
- **재귀 쿼리의 효율성**: 재귀 쿼리를 사용하여 `product_id`의 distinct 값을 순차적으로 가져오므로, 필요 없는 데이터를 읽지 않습니다. 이 또한 성능을 향상시키는 데 기여합니다.

### 요약

PostgreSQL에서 인덱스를 효과적으로 사용하지 못하는 문제를 해결하기 위해, 재귀 쿼리와 CTE를 사용하여 인덱스를 활용할 수 있게 한 것이다.    
이로 인해 전체 테이블 스캔 대신 인덱스만을 사용하여 필요한 데이터를 조회하게 되어 성능이 크게 개선되었다.

MySQL에서는 비슷한 상황이 발생할 수 있지만, MySQL의 쿼리 최적화 방식이나 인덱스 사용 방법이 PostgreSQL과 다를 수 있다.  
따라서 MySQL에서 동일한 문제를 해결하려면 MySQL의 최적화 기능과 인덱스 사용 방식을 이해하고, 이에 맞는 쿼리 최적화 방법을 적용해야 한다.

