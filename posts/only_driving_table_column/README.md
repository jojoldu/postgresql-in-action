# 단일 테이블 컬럼을 최대한 활용하기

> **PostgreSQL 14** 에서 진행되었다.

간혹 쿼리들을 보면 단일 테이블 (`from 테이블`)의 컬럼으로 모든 **조회 조건이 완성** 가능한데, `join 테이블` 의 조건을 함께 사용하여 성능 저하를 일으키는 경우가 종종 있다.  
  
데이터가 몇개 없을때는 큰 차이를 못 느끼지만, 수십만건 이상이 적재된 여러 테이블을 중첩 Join 할 경우 큰 차이가 느껴지게 된다.  
이를 비교해보자.

## 문제

아래의 쿼리는 `review` 테이블과 연관된 여러 테이블의 정보를 모으고, 이를 페이징 처리하여 제공해야하는 기능이다.  

```sql
select *
from "review" as review
left join "users" as "user" on review."user_id" = "user"."id"
left join "courses" as course on review."course_id" = course."id"
left join "files" as file on course."cover_file" = file."id"
where review."type" = ?
  and review."status" = ?
  and review."content" is not null
  and course."id" in (?)
order by review."id" + 0 desc
limit 10 offset 20;
```

이 쿼리의 특이점은 `where ~ and course."id" in (?)` 이다.  
`left join`의 대상인 `courses` 의 컬럼을 사용하여 조회 조건에 포함시킨 것이다.  
  
이 쿼리의 실행 계획은 다음과 같다.

```sql
Limit  (cost=1554.48..1554.50 rows=10 width=4845) (actual time=189.062..189.067 rows=10 loops=1)
  ->  Sort  (cost=1554.43..1555.11 rows=275 width=4845) (actual time=189.057..189.064 rows=30 loops=1)
        Sort Key: ((review.id + 0)) DESC
        Sort Method: top-N heapsort  Memory: 273kB
        ->  Nested Loop Left Join  (cost=1.56..1546.30 rows=275 width=4845) (actual time=0.105..136.710 rows=25047 loops=1)
              ->  Nested Loop  (cost=1.13..1313.55 rows=275 width=4174) (actual time=0.085..28.784 rows=25047 loops=1)
                    ->  Nested Loop Left Join  (cost=0.71..95.53 rows=19 width=3944) (actual time=0.029..0.363 rows=19 loops=1)
                          ->  Index Scan using courses_pkey on courses course  (cost=0.29..45.32 rows=19 width=2810) (actual time=0.014..0.158 rows=19 loops=1)
"                                Index Cond: (id = ANY ('{?,?,?,?,?}'::integer[]))"
                          ->  Index Scan using files_pkey on files file  (cost=0.42..2.64 rows=1 width=1134) (actual time=0.006..0.006 rows=1 loops=19)
                                Index Cond: (id = course.cover_file)
                    ->  Index Scan using idx_review_2 on review  (cost=0.42..63.50 rows=61 width=230) (actual time=0.023..1.093 rows=1318 loops=19)
                          Index Cond: (course_id = course.id)
                          Filter: ((content IS NOT NULL) AND ((type)::text = 'COURSE_REVIEW'::text) AND ((status)::text = 'PUBLIC'::text))
                          Rows Removed by Filter: 40
"              ->  Index Scan using users_pkey on users ""user""  (cost=0.43..0.84 rows=1 width=663) (actual time=0.003..0.003 rows=1 loops=25047)"
                    Index Cond: (id = review.user_id)
Planning Time: 0.852 ms
Execution Time: 189.201 ms
```

189ms가 느린 것은 아니지만, 각 테이블들의 크기에 비해 만족스럽지 못하다.  
여러 중첩 조인과 선 필터, PostgreSQL 14의 Memoize 등 성능 효과를 전혀 보지 못하고 있다.  
이를 개선해보자.

## 해결 

위 쿼리를 자세히 살펴보면 `left join "courses" as course on review."course_id" = course."id"` 와 `where ~ and course."id" in (?)` 를 통해 `courses.id`와 `review.course_id`가 동일한 값임을 알 수 있다.  
  
즉, **굳이 Join 테이블인 courses가 없어도 조회 조건이 완성 가능**하다.  
이를 통해 **Join 전에 필터링을 먼저 수행한 후 조인을 하여 성능 개선**을 할 수 있다.  

```sql
select *
from "review" as review
left join "users" as "user" on review."user_id" = "user"."id"
left join "courses" as course on review."course_id" = course."id"
left join "files" as file on course."cover_file" = file."id"
where review."type" = ?
  and review."status" = ?
  and review."content" is not null
  and review."course_id" in (?)
order by review."id" + 0 desc
limit 10 offset 20;
```

이에 대한 실행 계획은 다음과 같다.

```sql
Limit  (cost=14642.94..14662.08 rows=10 width=4845) (actual time=15.138..17.700 rows=10 loops=1)
  ->  Nested Loop Left Join  (cost=14604.67..63642.32 rows=25627 width=4845) (actual time=14.706..17.696 rows=30 loops=1)
        ->  Nested Loop Left Join  (cost=14604.24..54240.69 rows=25627 width=3703) (actual time=14.676..17.538 rows=30 loops=1)
              ->  Nested Loop Left Join  (cost=14603.94..51735.94 rows=25627 width=893) (actual time=14.645..17.345 rows=30 loops=1)
                    ->  Gather Merge  (cost=14603.50..17635.34 rows=25627 width=230) (actual time=14.599..17.062 rows=30 loops=1)
                          Workers Planned: 3
                          Workers Launched: 3
                          ->  Sort  (cost=13603.46..13624.13 rows=8267 width=230) (actual time=11.147..11.166 rows=143 loops=4)
                                Sort Key: ((review.id + 0)) DESC
                                Sort Method: quicksort  Memory: 3360kB
                                Worker 0:  Sort Method: quicksort  Memory: 2501kB
                                Worker 1:  Sort Method: quicksort  Memory: 2931kB
                                Worker 2:  Sort Method: quicksort  Memory: 3130kB
                                ->  Parallel Bitmap Heap Scan on review  (cost=308.21..13065.56 rows=8267 width=230) (actual time=0.599..7.222 rows=6262 loops=4)
"                                      Recheck Cond: (course_id = ANY ('{?,?,?,?,?}'::integer[]))"
                                      Filter: ((content IS NOT NULL) AND ((type)::text = 'COURSE_REVIEW'::text) AND ((status)::text = 'PUBLIC'::text))
                                      Rows Removed by Filter: 191
                                      Heap Blocks: exact=1838
                                      ->  Bitmap Index Scan on idx_review_2  (cost=0.00..301.75 rows=26405 width=0) (actual time=1.512..1.513 rows=25850 loops=1)
"                                            Index Cond: (course_id = ANY ('{?,?,?,?,?}'::integer[]))"
                    ->  Memoize  (cost=0.44..1.61 rows=1 width=663) (actual time=0.009..0.009 rows=1 loops=30)
                          Cache Key: review.user_id
                          Cache Mode: logical
                          Hits: 3  Misses: 27  Evictions: 0  Overflows: 0  Memory Usage: 10kB
"                          ->  Index Scan using users_pkey on users ""user""  (cost=0.43..1.60 rows=1 width=663) (actual time=0.007..0.007 rows=1 loops=27)"
                                Index Cond: (id = review.user_id)
              ->  Memoize  (cost=0.30..0.75 rows=1 width=2810) (actual time=0.005..0.005 rows=1 loops=30)
                    Cache Key: review.course_id
                    Cache Mode: logical
                    Hits: 16  Misses: 14  Evictions: 0  Overflows: 0  Memory Usage: 26kB
                    ->  Index Scan using courses_pkey on courses course  (cost=0.29..0.74 rows=1 width=2810) (actual time=0.006..0.006 rows=1 loops=14)
                          Index Cond: (id = review.course_id)
        ->  Memoize  (cost=0.43..1.78 rows=1 width=1134) (actual time=0.004..0.004 rows=1 loops=30)
              Cache Key: course.cover_file
              Cache Mode: logical
              Hits: 16  Misses: 14  Evictions: 0  Overflows: 0  Memory Usage: 12kB
              ->  Index Scan using files_pkey on files file  (cost=0.42..1.77 rows=1 width=1134) (actual time=0.005..0.005 rows=1 loops=14)
                    Index Cond: (id = course.cover_file)
Planning Time: 0.876 ms
Execution Time: 18.506 ms
```

단일 테이블로 선 필터링을 하게 되어 **Join 대상이 줄어듬**과 동시에 [Memoize](https://jojoldu.tistory.com/700) 등 캐시 효과도 볼 수 있게 되었다.  

189ms → 18 ms로 **대략 1,000% 성능 개선**이 되었다.

## 마무리

복잡한 쿼리를 작성하다보면 나도 모르게 여러 테이블의 컬럼을 활용하여 조건문을 완성할때가 있다.  
Join의 조건을 보고 단일 테이블의 컬럼을 최대한 활용할 수 있다면 이를 최대한 활용하자.
