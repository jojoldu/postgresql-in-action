# [PostgreSQL] 각 Join 소개 및 사례


## 0. 테스트용 스키마 생성

```sql
-- Users 테이블
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    created_at DATE
);

-- Orders 테이블
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    order_date DATE,
    amount DECIMAL(10, 2)
);

-- Users 데이터
INSERT INTO users (name, email, created_at)
SELECT 
    'User ' || i,
    'user' || i || '@example.com',
    current_date - (random() * 1000)::int
FROM generate_series(1, 1000) i;

-- Orders 데이터
INSERT INTO orders (user_id, order_date, amount)
SELECT 
    (random() * 999 + 1)::int,
    current_date - (random() * 365)::int,
    (random() * 1000)::numeric(10,2)
FROM generate_series(1, 10000) i;
```

## 1. Nested Loop Join:

- 작동 방식: 외부 테이블의 각 행에 대해 내부 테이블을 스캔한다.
- 장점: 작은 데이터셋에 효율적, 인덱스가 잘 구성된 경우 빠르다.
- 단점: 큰 데이터셋에서는 성능이 저하될 수 있다.
- 적합한 경우: 작은 테이블 조인, 조인 조건에 좋은 인덱스가 있는 경우.
   
예시

```sql
SELECT u.name, o.order_date 
FROM users u 
JOIN orders o ON u.id = o.user_id 
WHERE u.id < 100;
```

이 쿼리에서 users 테이블이 작고 id에 인덱스가 있다면 Nested Loop Join이 효율적일 수 있다.

## 2. Hash Join:

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

- 작동 방식: EXISTS 또는 IN 서브쿼리에서 사용, 매칭되는 첫 행만 반환.
- 장점: 중복 제거 없이 빠른 결과 반환.
- 단점: 직접적인 구문이 없어 최적화기에 의존한다.
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

