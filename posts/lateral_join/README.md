# LATERAL JOIN 으로 성능 개선하기

[PostgreSQL 공식 문서](https://www.postgresql.org/docs/15/sql-select.html) 에서는 LATERAL Join에 대해 다음과 같이 설명한다.

> LATERAL 키워드는 하위 `SELECT FROM` 항목 앞에 올 수 있다.  
> 이렇게 하면 **하위 `SELECT가 FROM` 목록에서 그 앞에 나타나는 `FROM` 항목의 열을 참조**할 수 있다.  
> (LATERAL이 없으면 각 하위 SELECT는 독립적으로 평가되므로 다른 FROM 항목을 상호 참조할 수 없다.)
> FROM 항목에 LATERAL 상호 참조가 포함된 경우 평가는 다음과 같이 진행된다.  
> 상호 참조된 열을 제공하는 FROM 항목의 각 행 또는 열을 제공하는 여러 FROM 항목의 행 집합에 대해 해당 행 또는 행 집합의 열 값을 사용하여 LATERAL 항목이 평가된다.  
> 결과 행은 평소와 같이 계산된 행과 조인된다.  
> 이 작업은 열 소스 테이블의 각 행 또는 행 집합에 대해 반복된다.

정리하면 LATERAL JOIN은 다음과 같은 특징을 갖고 있다.

- 서브쿼리는 LATERAL JOIN을 사용하여 외부 쿼리에서 참조할 수 있다.
- 각 행에 대해 서브쿼리가 실행되므로, 동적으로 계산된 값을 결합할 수 있다.

LATERAL JOIN은 각 행에 대해 서브쿼리를 실행할 수 있게 해주는 특별한 형태의 JOIN이다.  
**일반적인 JOIN에서는 JOIN 조건이 테이블 간의 결합에 사용되지만, LATERAL JOIN은 각 행에 대해 서브쿼리를 실행하여 그 결과를 결합**할 수 있다.

즉, LATERAL JOIN은 **결과 집합의 각 행을 반복하고 해당 행을 매개변수로 사용하여 하위 쿼리를 평가하는 SQL foreach 루프**와 유사하다.

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
SELECT mentor.id, mentor.name, mentor.created_at, (
    SELECT MAX(created_at)
    FROM mentoring
    WHERE mentoring.mentor_id = mentor.id AND mentoring.status = 'active'
) AS latest_mentoring_created_at
FROM mentor
WHERE mentor.created_at >= '2023-01-01'
ORDER BY latest_mentoring_created_at DESC
LIMIT 20;
```

```sql
EXPLAIN ANALYZE
SELECT mentor.id, mentor.name, mentor.created_at, latest_mentoring.created_at AS latest_mentoring_created_at
FROM mentor
JOIN (
    SELECT mentor_id, MAX(created_at) AS created_at
    FROM mentoring
    WHERE status = 'active'
    GROUP BY mentor_id
) AS latest_mentoring ON mentor.id = latest_mentoring.mentor_id
WHERE mentor.created_at >= '2023-01-01'
ORDER BY latest_mentoring.created_at DESC
LIMIT 20;

```

```sql
EXPLAIN ANALYZE
SELECT mentor.id, mentor.name, mentor.created_at AS mentor_created_at, latest_mentoring.created_at AS latest_mentoring_created_at
FROM mentor
LEFT JOIN LATERAL (
    SELECT created_at
    FROM mentoring
    WHERE mentoring.mentor_id = mentor.id AND mentoring.status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
) AS latest_mentoring ON true
WHERE mentor.created_at >= '2023-01-01'
ORDER BY latest_mentoring.created_at DESC
LIMIT 20;

```

- 중첩 서브쿼리
  - 각 멘토에 대해 서브쿼리가 반복 실행되므로, 많은 행을 처리할 때 성능이 저하
- LATERAL JOIN
  - 서브쿼리를 한 번만 실행하고 결과를 결합하므로, 중복된 연산을 줄여 성능을 향상시킨다.

