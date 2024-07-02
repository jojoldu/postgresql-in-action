# [PostgreSQL] pg_stats 으로 테이블 분석하기 (null_frac, n_distinct 등)

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




#### 주의사항
- **n_distinct의 정확성**: `ANALYZE` 명령어를 통해 최신 통계를 유지해야 한다. 부정확한 `n_distinct` 값은 잘못된 쿼리 플래닝을 초래할 수 있다.
- **인덱스의 존재**: 인덱스 스킵 스캔을 사용하려면 해당 열에 인덱스가 있어야 한다.

`n_distinct`는 인덱스 스킵 스캔 적용 여부를 판단하는 중요한 지표로, 적절히 활용하면 데이터베이스 성능 최적화에 큰 도움이 된다.

`n_distinct`가 낮다는 것은 특정 열에 대해 고유 값의 수가 적다는 것을 의미하며, 이는 해당 열에 인덱스를 사용할 때 효율적일 수 있음을 나타낸다.  
`n_distinct`가 낮을 때 Index Skip Scan을 적용하는 이유는 특정 상황에서 효율성을 높일 수 있기 때문이다.  
다만, `n_distinct` 값이 낮다는 것이 반드시 Index Skip Scan이 항상 적용되어야 한다는 것을 의미하지는 않는다.


### `n_distinct`와 인덱스 사용의 관계

**일반적인 인덱스 스캔**: `n_distinct`가 낮을 때, 해당 열의 고유 값이 적으므로 인덱스 스캔이 효율적일 수 있다.  
인덱스를 사용하면 특정 값들을 빠르게 찾을 수 있다.

**Index Skip Scan**: `n_distinct`가 낮을 때, 인덱스 스킵 스캔은 고유 값들만 선택적으로 스캔하여 효율성을 높일 수 있다.  
이는 특히 `DISTINCT`나 `GROUP BY`와 같은 쿼리에서 유용하다.


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
