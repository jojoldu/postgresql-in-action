# Nested Loop Join을 HashJoin으로 개선하기

RDBMS를 사용하다보면 Nested Loop Join 으로 인해 성능 저하를 겪는 경우가 많다.  
일부 RDBMS는 특정 버전에 따라 Nested Loop Join만 지원되는 경우도 있다.  
다만, 요즘의 RDBMS는 대부분 Hash Join등 여러 Join 형태를 지원하고 있고 이를 통해 성능 개선이 가능하다.

> MySQL도 8.0.18 부터 Hash Join을 지원한다.

실제 사례로 성능 개선을 진행해보자.

## 1. 문제 쿼리

아래와 같이 여러 Join을 진행하는 실제 쿼리가 있다.

```sql
SELECT i.id, i.titles[?] AS title, i.icon_url 
FROM institutions i 
    INNER JOIN interested_corporations ic ON i.id = ic.institution_id 
    INNER JOIN vouchers v ON v.user_id = ic.user_id 
WHERE i.priority > ? AND i.id != ? AND i.type = ? AND ic.deleted_at IS ? AND v.course_id = ? AND v.deleted_at IS ? 
GROUP BY i.id;
```

이 쿼리의 실행 계획을 보면 다음과 같다.

```sql
Group  (cost=6267.30..6267.31 rows=1 width=552) (actual time=639.801..639.811 rows=17 loops=1)
  Group Key: i.id
  ->  Sort  (cost=6267.30..6267.31 rows=1 width=552) (actual time=639.795..639.799 rows=24 loops=1)
        Sort Key: i.id
        Sort Method: quicksort  Memory: 29kB
        ->  Nested Loop  (cost=2.46..6267.29 rows=1 width=552) (actual time=113.916..639.751 rows=24 loops=1)
              ->  Nested Loop  (cost=2.03..6255.88 rows=6 width=556) (actual time=0.057..126.423 rows=184852 loops=1)
                    ->  Bitmap Heap Scan on institutions i  (cost=1.60..24.50 rows=21 width=552) (actual time=0.028..0.170 rows=189 loops=1)
                          Recheck Cond: (((type)::text = 'CORPORATION'::text) AND (priority > 2))
                          Filter: (id <> 1)
                          Rows Removed by Filter: 1
                          Heap Blocks: exact=21
                          ->  Bitmap Index Scan on institutions_type_priority_index  (cost=0.00..1.59 rows=21 width=0) (actual time=0.016..0.016 rows=190 loops=1)
                                Index Cond: (((type)::text = 'CORPORATION'::text) AND (priority > 2))
                    ->  Index Scan using interest_institutions_institution_id_index on interested_corporations ic  (cost=0.42..296.56 rows=17 width=8) (actual time=0.010..0.587 rows=978 loops=189)
                          Index Cond: (institution_id = i.id)
                          Filter: (deleted_at IS NULL)
                          Rows Removed by Filter: 2
              ->  Index Only Scan using vouchers_user_id_course_id_index on vouchers v  (cost=0.43..1.89 rows=1 width=4) (actual time=0.002..0.002 rows=0 loops=184852)
                    Index Cond: ((user_id = ic.user_id) AND (course_id = 333377) AND (deleted_at IS NULL))
                    Heap Fetches: 18
Planning Time: 0.258 ms
Execution Time: 639.863 ms
```

(매번 쿼리가 **600ms 이상** 소요된다)

 
이 실행 계획을 보면 크게 3가지 문제가 있다.

- **Nested Loop 조인**
  - Nested Loop 조인은 각 행에 대해 반복적으로 다른 테이블을 스캔한다. 
  - 이 경우, `interested_corporations` 와 `vouchers` 간의 조인이 매우 많은 반복을 발생시켜 성능이 저하된다.
  - 특히, vouchers 테이블에서 user_id 와 course_id, deleted_at 조건을 만족하는 행을 찾기 위해 많은 반복 작업이 필요하다.
- **데이터 양**
  - `institutions` 테이블에서 189개의 행이 필터링된다. 
    - `Bitmap Heap Scan on institutions i  (cost=1.60..24.50 rows=21 width=552) (actual time=0.028..0.170 rows=189 loops=1)`
  - 이 중 각 행에 대해 `interested_corporations` 와 조인한 후, 결과적으로 184,852번의 `vouchers` 테이블 접근이 발생한다.
    - `Nested Loop  (cost=2.03..6255.88 rows=6 width=556) (actual time=0.057..126.423 rows=184852`
- Index Only Scan
  - `vouchers` 테이블에 대한 Index Only Scan이 반복되면서 많은 I/O 작업이 발생한다.

위 쿼리는 Nested Loop Join을 통해 많은 데이터 행을 반복적으로 스캔한다.  
가장 해결이 필요한 부분은 **184,852번의 vouchers 테이블 접근**이다.    
이 문제를 해결해보자.

## 2. 해결책
  
이를 해결하기 위해서는 **Nested Loop Join → Hash Join** 으로 변경하는 것이다.

Hash Join은 Nested Loop Join에 비해 **대량의 데이터 접근에서의 성능이 뛰어나다**.

- **데이터 스캔 횟수 감소**
  - Hash Join은 해시 테이블을 사용하여 한 번의 스캔으로 조인을 수행할 수 있다.
  - 반면, Nested Loop Join은 외부 테이블의 각 행에 대해 내부 테이블을 반복적으로 스캔해야 하므로 스캔 횟수가 많다.
- **일관된 성능**
  - Hash Join은 해시 테이블을 사용하여 조인을 수행하므로, 조인 키의 분포나 데이터의 크기에 관계없이 일정한 성능을 제공한다.
  - Nested Loop Join은 조인 키의 분포나 데이터 크기에 따라 성능이 크게 달라질 수 있다.

그래서 이 쿼리를 수정하여 Hash Join 이 수행되도록 한다. 

### 2-1. Join Subquery

가장 쉬운 방법은 직접적인 Join을 사용하지 않고,  
Subquery 를 통해 먼저 대량의 데이터를 필터링 하고, 필터링 된 결과물을 Join에 활용하는 것이다.

```sql
SELECT i.id, i.titles[1] AS title, i.icon_url
FROM institutions i
INNER JOIN interested_corporations ic ON i.id = ic.institution_id AND ic.deleted_at IS NULL
INNER JOIN (
    SELECT user_id
    FROM vouchers
    WHERE course_id = ? AND deleted_at IS NULL
    GROUP BY user_id
) fv ON fv.user_id = ic.user_id
WHERE i.priority > ?
  AND i.id != ?
  AND i.type = ?
GROUP BY i.id;
```

기존의 Join을 아래와 같이 Subquery 결과를 Join에 활용했다.

```sql
INNER JOIN (
    SELECT user_id
    FROM vouchers
    WHERE course_id = ? AND deleted_at IS NULL
    GROUP BY user_id
) fv ON fv.user_id = ic.user_id
```

이를 통해 데이터가 많은 `vouchers` 를 먼저 1차 필터링 하고, 그 결과를 Hash Join으로 사용할 수 있게 되었다.  
  
실행 계획을 수행해보면 다음과 같다.

```
Group  (cost=9601.65..9602.13 rows=21 width=552) (actual time=109.218..109.230 rows=17 loops=1)
  Group Key: i.id
  ->  Sort  (cost=9601.65..9601.89 rows=96 width=552) (actual time=109.211..109.217 rows=24 loops=1)
        Sort Key: i.id
        Sort Method: quicksort  Memory: 29kB
        ->  Hash Join  (cost=3344.61..9598.49 rows=96 width=552) (actual time=19.411..109.149 rows=24 loops=1)
              Hash Cond: (ic.user_id = vouchers.user_id)
              ->  Nested Loop  (cost=2.03..6255.88 rows=6 width=556) (actual time=0.073..99.533 rows=184852 loops=1)
                    ->  Bitmap Heap Scan on institutions i  (cost=1.60..24.50 rows=21 width=552) (actual time=0.030..0.131 rows=189 loops=1)
                          Recheck Cond: (((type)::text = 'CORPORATION'::text) AND (priority > 2))
                          Filter: (id <> 1)
                          Rows Removed by Filter: 1
                          Heap Blocks: exact=21
                          ->  Bitmap Index Scan on institutions_type_priority_index  (cost=0.00..1.59 rows=21 width=0) (actual time=0.018..0.019 rows=190 loops=1)
                                Index Cond: (((type)::text = 'CORPORATION'::text) AND (priority > 2))
                    ->  Index Scan using interest_institutions_institution_id_index on interested_corporations ic  (cost=0.42..296.56 rows=17 width=8) (actual time=0.009..0.460 rows=978 loops=189)
                          Index Cond: (institution_id = i.id)
                          Filter: (deleted_at IS NULL)
                          Rows Removed by Filter: 2
              ->  Hash  (cost=3302.59..3302.59 rows=3200 width=4) (actual time=0.111..0.112 rows=39 loops=1)
                    Buckets: 4096  Batches: 1  Memory Usage: 34kB
                    ->  HashAggregate  (cost=3238.59..3270.59 rows=3200 width=4) (actual time=0.088..0.105 rows=39 loops=1)
                          Group Key: vouchers.user_id
                          Batches: 1  Memory Usage: 121kB
                          ->  Index Scan using vouchers_course_id_index on vouchers  (cost=0.43..3230.52 rows=3229 width=4) (actual time=0.032..0.080 rows=39 loops=1)
                                Index Cond: (course_id = 333377)
                                Filter: (deleted_at IS NULL)
                                Rows Removed by Filter: 1
Planning Time: 1.053 ms
Execution Time: 109.388 ms
```

이 쿼리에서 서브쿼리는 `vouchers` 테이블에서 `user_id`를 필터링하여 그룹화한 결과를 생성한다.  
이 결과 셋은 Hash Table로 만들어지고, `interested_corporations` 테이블과 조인될 때 Hash Join이 사용된다.  
  
Nested Loop Join -> Hash Join으로 변경되었으며,  
수행 시간은 **109ms**로 **기존 대비 (600ms) 6배 성능 개선**이 된 것을 확인할 수 있다.

### 2-2. With 사용하기

두번째는 With를 사용하는 것이다.

WITH 구문은 공통 테이블 표현식(CTE, Common Table Expression)을 정의하는 데 사용되며, **복잡한 쿼리를 단순화하고 최적화할 수 있는 방법**을 제공한다.
  
With를 사용하여 `vouchers` 테이블을 미리 필터링하고 그룹화하여 `filtered_vouchers` 라는 임시 테이블을 생성한다.  
이 임시 테이블을 사용하여 나머지 조인을 수행하므로, 조인 과정에서의 불필요한 데이터 필터링을 줄일 수 있다.

```sql
WITH filtered_vouchers AS (
    SELECT user_id
    FROM vouchers
    WHERE course_id = ? AND deleted_at IS NULL
    GROUP BY user_id
)
SELECT i.id, i.titles[1] title, i.icon_url
	FROM institutions i
	INNER JOIN interested_corporations ic ON i.id = ic.institution_id
    JOIN filtered_vouchers fv ON fv.user_id = ic.user_id
	WHERE i.priority > ?
	  AND i.id != ?
	  AND i.type = ?
	  AND ic.deleted_at IS NULL
	GROUP BY i.id;
```


이를 실행 계획을 수행해보면 다음과 같다.

```sql
Group  (cost=9601.65..9602.13 rows=21 width=552) (actual time=114.565..114.579 rows=20 loops=1)
  Group Key: i.id
  ->  Sort  (cost=9601.65..9601.89 rows=96 width=552) (actual time=114.560..114.566 rows=34 loops=1)
        Sort Key: i.id
        Sort Method: quicksort  Memory: 31kB
        ->  Hash Join  (cost=3344.61..9598.49 rows=96 width=552) (actual time=3.858..114.523 rows=34 loops=1)
              Hash Cond: (ic.user_id = vouchers.user_id)
              ->  Nested Loop  (cost=2.03..6255.88 rows=6 width=556) (actual time=0.060..104.851 rows=184852 loops=1)
                    ->  Bitmap Heap Scan on institutions i  (cost=1.60..24.50 rows=21 width=552) (actual time=0.027..0.128 rows=189 loops=1)
                          Recheck Cond: (((type)::text = 'CORPORATION'::text) AND (priority > 2))
                          Filter: (id <> 1)
                          Rows Removed by Filter: 1
                          Heap Blocks: exact=21
                          ->  Bitmap Index Scan on institutions_type_priority_index  (cost=0.00..1.59 rows=21 width=0) (actual time=0.015..0.016 rows=190 loops=1)
                                Index Cond: (((type)::text = 'CORPORATION'::text) AND (priority > 2))
                    ->  Index Scan using interest_institutions_institution_id_index on interested_corporations ic  (cost=0.42..296.56 rows=17 width=8) (actual time=0.009..0.483 rows=978 loops=189)
                          Index Cond: (institution_id = i.id)
                          Filter: (deleted_at IS NULL)
                          Rows Removed by Filter: 2
              ->  Hash  (cost=3302.59..3302.59 rows=3200 width=4) (actual time=0.096..0.098 rows=47 loops=1)
                    Buckets: 4096  Batches: 1  Memory Usage: 34kB
                    ->  HashAggregate  (cost=3238.59..3270.59 rows=3200 width=4) (actual time=0.072..0.089 rows=47 loops=1)
                          Group Key: vouchers.user_id
                          Batches: 1  Memory Usage: 121kB
                          ->  Index Scan using vouchers_course_id_index on vouchers  (cost=0.43..3230.52 rows=3229 width=4) (actual time=0.015..0.061 rows=47 loops=1)
                                Index Cond: (course_id = 332736)
                                Filter: (deleted_at IS NULL)
                                Rows Removed by Filter: 1
Planning Time: 0.265 ms
Execution Time: 114.649 ms
```

수행 시간은 **114ms**로 **기존 대비 (600ms) 6배 성능 개선**이 되었다.
  
With(CTE)는 독립적으로 인덱스를 사용할 수 있다보니, 인덱스의 효율성이 높아질 수 있다.  
또한, 쿼리 계획이 단순해지면서 PostgreSQL이 더 나은 인덱스를 선택할 가능성이 커진다.


## 마무리

Hash Join은 일반적으로 큰 테이블 간의 조인에서 성능이 좋다.  
특히 일부 쿼리의 결과를 미리 필터링하여 필요한 데이터만 남기고, 이를 기반으로 조인을 수행하다보니 **조인 전에 데이터 양을 줄여서 조인 작업을 효율적으로** 만든다.  
  
특히, **별도의 인덱스 추가 없이 쿼리의 변경으로 Join 방식 변경만으로 성능 개선 효과**를 볼 수 있다.  
  
Join을 했더니 대량의 데이터를 반복적으로 스캔해야되어 성능 저하가 발생한다면 Hash Join으로 변경할 수 있도록 쿼리를 개선해보자.


