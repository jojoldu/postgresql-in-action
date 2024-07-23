# [PostgreSQL] Join 알고리즘 소개


## 0. 테스트용 스키마 생성

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    created_at DATE
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    order_date DATE,
    amount DECIMAL(10, 2)
);
```

```sql
INSERT INTO users (name, email, created_at)
SELECT 
    'User ' || i,
    'user' || i || '@example.com',
    current_date - (random() * 1000)::int
FROM generate_series(1, 1000) i;

INSERT INTO orders (user_id, order_date, amount)
SELECT 
    (random() * 999 + 1)::bigint,
    current_date - (random() * 365)::int,
    (random() * 1000)::numeric(10,2)
FROM generate_series(1, 10000) i;
```

## 1. Nested Loop Join

- 작동 방식: 외부 테이블의 각 행에 대해 내부 테이블을 스캔한다.
- 장점: 작은 데이터셋에 효율적, 인덱스가 잘 구성된 경우 빠르다.
- 단점: 큰 데이터셋에서는 성능이 저하될 수 있다.
- 적합한 경우: 작은 테이블 조인, 조인 조건에 활용할 수 있는 적합한 인덱스가 있는 경우.
   
예시

```sql
SELECT u.name, o.order_date 
FROM users u 
JOIN orders o ON u.id = o.user_id 
WHERE u.id < 100;
```

이 쿼리에서 users 테이블이 작고 id에 인덱스가 있다면 Nested Loop Join이 효율적일 수 있다.

## 2. Hash Join

- 작동 방식: 작은 테이블로 해시 테이블을 만들고, 큰 테이블을 스캔하며 매칭한다.
- 장점: 큰 데이터셋에 효율적, 동등 조인에 좋다.
- 단점: 해시 테이블 생성에 메모리와 시간이 필요하다.
- 적합한 경우: 큰 테이블 간 동등 조인, 인덱스가 없는 경우.

예시

```sql
SELECT u.name, COUNT(o.id) as order_count
FROM users u 
JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;
```
두 테이블이 크고 product_id에 인덱스가 없다면 Hash Join이 선택될 수 있다.

## 3. Merge Join

- 작동 방식: 두 정렬된 테이블을 병합하며 조인한다.
- 장점: 대용량 데이터에 효율적, 정렬된 데이터에 최적화.
- 단점: 정렬되지 않은 데이터는 사전 정렬이 필요하다.
- 적합한 경우: 이미 정렬된 큰 데이터셋, 범위 조인.

예시

```sql
SELECT u.name, o.order_date 
FROM users u 
JOIN orders o ON u.id = o.user_id 
ORDER BY u.id, o.order_date;
```
dept_id로 정렬된 인덱스가 있다면 Merge Join이 효율적일 수 있다.

## 4. Semi Join

SQL의 맥락에서, 안티 조인 및 세미 조인은 데이터를 쿼리하고 조작하는 데 사용되는 관계형 데이터베이스의 두 가지 필수 작업이다.  
이러한 작업은 관련된 두 테이블의 데이터를 비교하는 데 중점을 두지만, 서로 다른 용도로 사용된다.  

세미 조인은 관계에 적용되어 관련 열을 기반으로 관계를 조인하는 조인의 한 유형이다.  
세미 조인이 적용되면 한 테이블에서 다른 관련 테이블에 일치하는 레코드가 있는 행을 반환한다. 

- 세미 조인은 왼쪽 테이블에서 오른쪽 테이블에 일치하는 행이 있는 행을 반환한다. 
- 두 테이블의 일치하는 행을 모두 포함하는 일반 조인과 달리 세미 조인은 결과에 왼쪽 테이블의 열만 포함된다.

한 테이블의 행이 다른 테이블에 존재하는지 여부만 확인하는 조인 방식
결과에는 첫 번째 테이블의 행만 포함되며, 중복은 제거된다.

- 작동 방식: EXISTS 또는 IN 서브쿼리에서 사용, 매칭되는 첫 행만 반환.
- 장점: 중복 제거 없이 빠른 결과 반환.
- 단점: Semi Join을 명시적으로 표현하는 키워드가 없어서, 데이터베이스 엔진의 쿼리 최적화기가 이를 자동으로 감지하고 최적화해야 한다.
- 적합한 경우: 존재 여부만 확인하는 경우.

예시

```sql
SELECT u.name 
FROM users u 
WHERE EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.user_id = u.id AND o.amount > 500
);
```

> SQL 표준에는 Semi Join과 Anti Join을 직접적으로 표현하는 문법이 없다.
대신 EXISTS, NOT EXISTS, IN, NOT IN 등의 서브쿼리 형태로 이러한 조인 로직을 표현한다.

## 5. Anti Join

- 작동 방식: NOT EXISTS 또는 NOT IN 서브쿼리에서 사용, 매칭되지 않는 행 반환.
- 장점: 부정 조건을 효율적으로 처리.
- 단점: Semi Join과 마찬가지로 직접적인 구문이 없다.
- 적합한 경우: 특정 조건을 만족하지 않는 데이터 검색.

예시

```sql
SELECT u.name 
FROM users u 
WHERE NOT EXISTS (
    SELECT 1 
    FROM orders o 
    WHERE o.user_id = u.id
);
```

