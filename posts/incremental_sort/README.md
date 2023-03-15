# WHERE + ORDER 같이 있을 경우 인덱스 (feat. Incremental Sort)

PostgreSQL 13부터 정렬에 한해서는 **증분 정렬**기능이 추가되었다.  

## 테스트 환경

- PostgreSQL 14
- 인덱스
  - `orders_pkey(id)`
  - `idx_orders_1 (created_at)`
 

## 기존 쿼리

실제 Slow가 발생한 쿼리는 다음과 같다.

```sql
SELECT "orders".*
FROM "orders" AS "orders"
WHERE (("pay_price" > 0 OR (reg_price > 0 AND pay_price = 0)) AND
      "created_at" AT TIME ZONE 'Asia/Seoul' BETWEEN to_date('2023-01-13', 'YYYY-MM-DD') AND to_date('2023-03-16', 'YYYY-MM-DD') AND
       (("buyer_email" ilike '%test@kakao.com%') OR
        "user_id" IN (SELECT "id" FROM "users" WHERE (("email" ilike '%test@kakao.com%') AND "deleted_at" IS NULL))) AND
       "deleted_at" IS NULL)
order by id desc
LIMIT 15 OFFSET 0;
```

### 결과

**2.5초**

```sql
Limit  (cost=42334.02..43782.26 rows=15 width=1009) (actual time=270.864..2571.487 rows=1 loops=1)
  ->  Index Scan Backward using orders_pkey on orders  (cost=42334.02..374173.02 rows=3437 width=1009) (actual time=270.862..2571.484 rows=1 loops=1)
"        Filter: ((deleted_at IS NULL) AND (((buyer_email)::text ~~* '%test@kakao.com%'::text) OR (hashed SubPlan 1)) AND ((pay_price > 0) OR ((reg_price > 0) AND (pay_price = 0))) AND ((created_at AT TIME ZONE 'Asia/Seoul'::text) >= to_date('2023-01-13'::text, 'YYYY-MM-DD'::text)) AND ((created_at AT TIME ZONE 'Asia/Seoul'::text) <= to_date('2023-03-16'::text, 'YYYY-MM-DD'::text)))"
        Rows Removed by Filter: 1867912
        SubPlan 1
          ->  Gather  (cost=1000.00..42333.33 rows=107 width=4) (actual time=246.537..248.063 rows=1 loops=1)
                Workers Planned: 4
                Workers Launched: 4
                ->  Parallel Seq Scan on users  (cost=0.00..41322.63 rows=27 width=4) (actual time=240.708..241.953 rows=0 loops=5)
                      Filter: ((deleted_at IS NULL) AND ((email)::text ~~* '%test@kakao.com%'::text))
                      Rows Removed by Filter: 217110
Planning Time: 0.331 ms
Execution Time: 2571.526 ms
```

### 문제점

이 쿼리는 크게 2가지 문제가 있다.

- `"created_at" AT TIME ZONE 'Asia/Seoul'` 
  - 이 쿼리에서 유일하게 인덱스가 적용 가능한 조건에 인덱스가 적용 안되었다
  - OR 조건은 인덱스가 적용되지 않는다
- `order by id desc`
  - 정렬에 id를 사용하여 다른 인덱스 조건이 적용 될 수 없다.

## 테스트 1

```sql
SELECT "orders".*
FROM "orders" AS "orders"
WHERE (("pay_price" > 0 OR (reg_price > 0 AND pay_price = 0)) AND
       "created_at"  BETWEEN '2023-01-13'AND '2023-03-16 23:59:59' AND
       (("buyer_email" ilike '%test@kakao.com%') OR
        "user_id" IN (SELECT "id" FROM "users" WHERE (("email" ilike '%test@kakao.com%') AND "deleted_at" IS NULL))) AND
       "deleted_at" IS NULL)
order by id desc
LIMIT 15 OFFSET 0;
```

- "created_at" BETWEEN '2023-01-13'AND '2023-03-16 23:59:59' 으로 변경해서 created_at이 인덱스를 타도록 설계

### 결과

**1.5초**

```sql
Limit  (cost=42334.02..42513.45 rows=15 width=1009) (actual time=254.663..1553.913 rows=1 loops=1)
  ->  Index Scan Backward using orders_pkey on orders  (cost=42334.02..355495.86 rows=26180 width=1009) (actual time=254.662..1553.910 rows=1 loops=1)
        Filter: ((deleted_at IS NULL) AND (created_at >= '2023-01-13 00:00:00+09'::timestamp with time zone) AND (created_at <= '2023-03-16 23:59:59+09'::timestamp with time zone) AND (((buyer_email)::text ~~* '%test@kakao.com%'::text) OR (hashed SubPlan 1)) AND ((pay_price > 0) OR ((reg_price > 0) AND (pay_price = 0))))
        Rows Removed by Filter: 1867912
        SubPlan 1
          ->  Gather  (cost=1000.00..42333.33 rows=107 width=4) (actual time=230.857..231.843 rows=1 loops=1)
                Workers Planned: 4
                Workers Launched: 4
                ->  Parallel Seq Scan on users  (cost=0.00..41322.63 rows=27 width=4) (actual time=223.761..225.085 rows=0 loops=5)
                      Filter: ((deleted_at IS NULL) AND ((email)::text ~~* '%test@kakao.com%'::text))
                      Rows Removed by Filter: 217111
Planning Time: 0.367 ms
Execution Time: 1553.950 ms
```

실제로 created_at 인덱스가 선택되지 않았다
인덱스는 테이블당 1개만 선택되는데 이미 pk 인덱스를 선택했기 때문에 (정렬에 사용) created_at 인덱스를 선택하지 못했다.



## 테스트 2

즉, 결론은 where와 order 에 모두 사용될 수 있는 인덱스를 선택하도록 해야한다.

```sql
SELECT "orders".*
FROM "orders" AS "orders"
WHERE (("pay_price" > 0 OR (reg_price > 0 AND pay_price = 0)) AND
       "created_at"  BETWEEN '2023-01-13'AND '2023-03-16 23:59:59' AND
       (("buyer_email" ilike '%test@kakao.com%') OR
        "user_id" IN (SELECT "id" FROM "users" WHERE (("email" ilike '%test@kakao.com%') AND "deleted_at" IS NULL))) AND
       "deleted_at" IS NULL)
order by created_at desc, id desc
LIMIT 15 OFFSET 0;
```

- `"created_at" BETWEEN '2023-01-13'AND '2023-03-16 23:59:59'` 으로 변경해서 created_at 인덱스가 조건식에도 적용되도록 개선
- `order by created_at desc, id desc` 으로 변경해서 created_at 인덱스로 정렬 하도록 개선 

이렇게 하면 PK로 정렬했을때와 비즈니스 상으로는 동일한 정렬 기준을 가지면서, created_at으로 where와 order by 모두에 적용될 수 있다.

### 결과

**0.3초**

```sql
Limit  (cost=42336.00..42349.68 rows=15 width=2434) (actual time=338.077..338.154 rows=1 loops=1)
  ->  Incremental Sort  (cost=42336.00..66217.93 rows=26180 width=2434) (actual time=338.076..338.152 rows=1 loops=1)
"        Sort Key: orders.created_at DESC, orders.id DESC"
        Presorted Key: orders.created_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 26kB  Peak Memory: 26kB
        ->  Index Scan Backward using idx_orders_1 on orders  (cost=42335.11..65044.10 rows=26180 width=2434) (actual time=257.727..338.142 rows=1 loops=1)
              Index Cond: ((created_at >= '2023-01-13 00:00:00+09'::timestamp with time zone) AND (created_at <= '2023-03-16 23:59:59+09'::timestamp with time zone))
              Filter: ((deleted_at IS NULL) AND (((buyer_email)::text ~~* '%test@kakao.com%'::text) OR (hashed SubPlan 1)) AND ((pay_price > 0) OR ((reg_price > 0) AND (pay_price = 0))))
              Rows Removed by Filter: 75125
              SubPlan 1
                ->  Gather  (cost=1000.00..42334.42 rows=107 width=4) (actual time=224.364..234.134 rows=1 loops=1)
                      Workers Planned: 4
                      Workers Launched: 4
                      ->  Parallel Seq Scan on users  (cost=0.00..41323.72 rows=27 width=4) (actual time=225.602..226.820 rows=0 loops=5)
                            Filter: ((deleted_at IS NULL) AND ((email)::text ~~* '%test@kakao.com%'::text))
                            Rows Removed by Filter: 217111
Planning Time: 0.566 ms
Execution Time: 338.196 ms
```
 

> Incremental Sort(증분 정렬)
> PostgreSQL 13부터 도입된 기능 
> 쿼리의 초기 단계 정렬을 활용하고 정렬되지 않은 증분 필드만 추가 정렬하는 증분 정렬이 도입되어 정렬의 성능 개선이 되었다.
다음과 같은 경우에 증분 정렬이 도움이 된다.
>- 데이터가 이미 부분적으로 정렬된 경우
> - 정렬해야 하는 데이터가 클 경우
> - 입력 데이터가 스트림으로 처리되는 경우


## 결론

WHRER + ORDER BY 모두에게 적용될 수 있는 인덱스를 찾아서 해당 인덱스가 적용될 수 있도록 쿼리를 개선해야한다.

테이블에는 1개의 인덱스만 적용된다.

조건 (WHERE) 과 정렬 (ORDER) 는 모두 다 쿼리 성능에 영향을 끼친다.

둘 다 적용될 수 있는지 먼저 확인해본다

둘 중 하나만 적용이 필요하다면

조건절로 걸러내고 남은 데이터가 적을 경우: WHERE 에 적용될 수 있는 인덱스를 선택해서, 정렬하는데 필요한 데이터를 최소화한다

조건절로 걸러내는게 거의 없는 경우 (전체 중에 1~2%만 걸러내지는 경우): ORDER에 적용될 수 있는 인덱스를 선택해서 정렬 성능을 올린다. 