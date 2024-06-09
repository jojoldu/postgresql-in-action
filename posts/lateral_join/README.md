# LATERAL Join

LATERAL JOIN은 각 행에 대해 서브쿼리를 실행할 수 있게 해주는 특별한 형태의 JOIN이다.  
일반적인 JOIN에서는 JOIN 조건이 테이블 간의 결합에 사용되지만, LATERAL JOIN은 각 행에 대해 서브쿼리를 실행하여 그 결과를 결합할 수 있다.

주요 특징
- 서브쿼리는 LATERAL JOIN을 사용하여 외부 쿼리에서 참조할 수 있다.
- 각 행에 대해 서브쿼리가 실행되므로, 동적으로 계산된 값을 결합할 수 있다.

LATERAL JOIN의 장점
- 동적 서브쿼리
  - 각 행에 대해 동적으로 서브쿼리를 실행할 수 있다.
  - 이전 행의 값을 사용하여 다음 행의 서브쿼리를 실행할 수 있다.
- 복잡한 계산의 단순화
  - LATERAL JOIN을 사용하면 복잡한 서브쿼리를 단순하게 작성할 수 있다.
  - 서브쿼리에서 외부 쿼리의 값을 참조하여 더 효율적으로 계산할 수 있다.
- 성능 최적화
  - 중첩된 서브쿼리를 피할 수 있으며, 데이터베이스 최적화 엔진이 LATERAL JOIN을 효율적으로 처리할 수 있다.

```sql
CREATE TABLE mentor (
    id BIGSERIAL PRIMARY KEY,
    name varchar(255),
    created_at TIMESTAMP
);

CREATE TABLE mentoring (
    id BIGSERIAL PRIMARY KEY,
    mentor_id INT,
    status varchar(255),
    created_at TIMESTAMP,
    FOREIGN KEY (mentor_id) REFERENCES mentor (id)
);
```

```sql
-- mentor 테이블에 10만 건 데이터 삽입
INSERT INTO mentor (name, created_at)
SELECT 'Mentor ' || g, NOW() - (g || ' days')::interval
FROM generate_series(1, 100000) AS g;

-- mentoring 테이블에 10만 건 데이터 삽입
INSERT INTO mentoring (mentor_id, status, created_at)
SELECT (g % 100000) + 1, 'active', NOW() - (g || ' minutes')::interval
FROM generate_series(1, 100000) AS g;
```


```sql
EXPLAIN ANALYZE
SELECT mentor.id, mentor.name, mentor.created_at AS mentor_created_at, (
    SELECT created_at
    FROM mentoring
    WHERE mentoring.mentor_id = mentor.id
    ORDER BY created_at DESC
    LIMIT 1
) AS latest_mentoring_created_at
FROM mentor
ORDER BY latest_mentoring_created_at DESC
LIMIT 10;
```

```sql
EXPLAIN ANALYZE
SELECT mentor.id, mentor.name, mentor.created_at AS mentor_created_at, latest_mentoring.created_at AS latest_mentoring_created_at
FROM mentor
LEFT JOIN LATERAL (
    SELECT created_at
    FROM mentoring
    WHERE mentoring.mentor_id = mentor.id
    ORDER BY created_at DESC
    LIMIT 1
) AS latest_mentoring ON true
ORDER BY latest_mentoring.created_at DESC
LIMIT 10;

```

```sql
EXPLAIN ANALYZE
SELECT mentor.id, mentor.name, mentor.created_at
FROM mentor
WHERE mentor.id IN (
    SELECT mentor_id
    FROM mentoring
    WHERE status = 'active'
);
```

```sql
EXPLAIN ANALYZE
SELECT mentor.id, mentor.name, mentor.created_at
FROM mentor
JOIN LATERAL (
    SELECT 1
    FROM mentoring
    WHERE mentoring.mentor_id = mentor.id AND mentoring.status = 'active'
    LIMIT 1
) AS active_mentoring ON true;

```

- 중첩 서브쿼리
  - 각 멘토에 대해 서브쿼리가 반복 실행되므로, 많은 행을 처리할 때 성능이 저하
- LATERAL JOIN
  - 서브쿼리를 한 번만 실행하고 결과를 결합하므로, 중복된 연산을 줄여 성능을 향상시킨다.
