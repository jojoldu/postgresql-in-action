# PostgreSQL Index Skip Scan


 Oracle의 Index Skip Scan 기능은 인덱스의 첫 번째 컬럼이 쿼리의 WHERE 절에 없더라도 인덱스의 나머지 컬럼을 활용할 수 있게 해줍니다. PostgreSQL에서는 이와 같은 기능이 기본적으로 지원되지 않기 때문에, 유사한 효과를 내기 위해서는 다른 접근 방식을 사용해야 합니다. 여기서는 CTE (Common Table Expressions)와 재귀 쿼리를 활용하여 PostgreSQL에서 비슷한 성능 최적화를 이루는 사례를 설명합니다.

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
    AND EUR_VALUE  700;
 ```

 이 쿼리는 인덱스를 사용하지 않고 전체 테이블을 스캔하기 때문에 성능이 좋지 않았습니다. 실행 계획은 다음과 같았습니다:
 ```
 Seq Scan on sales (actual time=314.511..314.585 rows=212 loops=1)
 Filter: ((eur_value  '700'::numeric) AND (sale_date = '2021-03-29'::date))
 Rows Removed by Filter: 2206042
 Buffers: shared hit=5015 read=17730
 Planning Time: 0.134 ms
 Execution Time: 314.696 ms
 ```
 전체 테이블을 스캔하며 많은 블록 I/O가 발생했습니다.

 ### 통계 정보
 SALES 테이블의 통계 정보를 조회한 결과 `product_id` 컬럼의 distinct value가 26임을 확인했습니다. 이는 Oracle의 Index Skip Scan이 동작할 가능성이 높은 환경입니다:
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
     SELECT (SELECT MIN(PRODUCT_ID) FROM SALES A WHERE A.PRODUCT_ID  W.PRODUCT_ID)
     FROM W
     WHERE PRODUCT_ID IS NOT NULL
 )
 SELECT SALE_DATE, EUR_VALUE, EMPLOYEE_ID
 FROM SALES
 WHERE PRODUCT_ID IN (SELECT PRODUCT_ID FROM W)
   AND SALE_DATE = DATE '2021-03-29'
   AND EUR_VALUE  700;
 ```

 이 쿼리의 실행 계획은 다음과 같습니다:
 ```
 Nested Loop (actual time=0.361..0.600 rows=212 loops=1)
 Buffers: shared hit=357
 CTE w
 - Recursive Union (actual time=0.046..0.329 rows=27 loops=1)
 Buffers: shared hit=89
 - Result (actual time=0.045..0.046 rows=1 loops=1)
 Buffers: shared hit=4
 InitPlan 3 (returns $1)
 - Limit (actual time=0.042..0.043 rows=1 loops=1)
 Buffers: shared hit=4
 - Index Only Scan using sales_x01 on sales sales_1 (actual time=0.041..0.042 rows=1 loops=1)
 Index Cond: (product_id IS NOT NULL)
 Heap Fetches: 0
 Buffers: shared hit=4
 - WorkTable Scan on w w_1 (actual time=0.010..0.010 rows=1 loops=27)
 Filter: (product_id IS NOT NULL)
 Rows Removed by Filter: 0
 Buffers: shared hit=85
 SubPlan 2
 - Result (actual time=0.009..0.009 rows=1 loops=26)
 Buffers: shared hit=85
 InitPlan 1 (returns $3)
 - Limit (actual time=0.009..0.009 rows=1 loops=26)
 Buffers: shared hit=85
 - Index Only Scan using sales_x01 on sales a (actual time=0.008..0.008 rows=1 loops=26)
 Index Cond: ((product_id IS NOT NULL) AND (product_id  w_1.product_id))
 Heap Fetches: 6
 Buffers: shared hit=85
 - HashAggregate (actual time=0.351..0.358 rows=27 loops=1)
 Group Key: w.product_id
 Batches: 1 Memory Usage: 24kB
 Buffers: shared hit=89
 - CTE Scan on w (actual time=0.047..0.338 rows=27 loops=1)
 Buffers: shared hit=89
 - Index Scan using sales_x01 on sales (actual time=0.004..0.007 rows=8 loops=27)
 Index Cond: ((product_id = w.product_id) AND (sale_date = '2021-03-29'::date) AND (eur_value  '700'::numeric))
 Buffers: shared hit=268
 Planning Time: 0.263 ms
 Execution Time: 0.762 ms
 ```

 ### 결론
 튜닝 후 쿼리의 성능은 크게 향상되었습니다:
 - ELAPSED TIME: 314.696ms → 0.762ms
 - Block I/O: 4983+17762 (전체 테이블 스캔) → 357 (인덱스와 CTE 활용)

 이 방법은 인덱스 추가에 따른 부하를 피하면서 성능을 개선하는 좋은 예시입니다. 그러나 재귀 쿼리는 주의 깊게 사용해야 하며, 데이터베이스의 전체 성능에 미치는 영향을 모니터링하는 것이 중요합니다.




며칠 전 누군가 포럼에 질문을 올렸는데, 처음에는 오래되고 지루하고 식상한 질문처럼 보였습니다:

 뉴스 피드가 있습니다. 모든 뉴스는 10개 카테고리(정치, 스포츠, 자동차, 부동산 등)로 나뉩니다. 각 카테고리별로 시간 내림차순으로 정렬된 상위 4개의 뉴스를 하나의 쿼리로 가져와야 합니다. 결과를 정렬하면 4개의 정치 뉴스, 그 다음 4개의 스포츠 뉴스 등이 나와야 합니다.

하지만 이 과제를 최적화해야 했고, 일반적인 row_number를 사용하는 표준 솔루션은 특히 큰 테이블, 상대적으로 적은 수의 카테고리 및 불균형 분포 또는 전반적으로 낮은 선택성의 경우 최적화된 솔루션이라고 할 수 없었습니다.

그래서 저는 min()에서 시작하여 "인덱스 범위 스캔(min/max)"을 재귀적으로 사용하여 다음 값을 가져오는 아이디어를 생각해냈습니다. 이 기술에 적절한 이름을 찾지 못해, Jonathan Lewis가 부르는 "인덱스 바운시 스캔"이라고 부르기로 했습니다:

1. 인덱스에서 고유 값 가져오기

테이블에 "a" 열에 대한 인덱스가 있다고 가정해 봅시다:

```sql
create table xt_test(a not null, b not null, c);
select length(object_name), nvl(object_id, 0), o.OBJECT_NAME from dba_objects o;
create index ix_test_a on xt_test(a);
SQL select i.index_name, i.distinct_keys, i.num_rows, i.blevel, i.leaf_blocks, i.avg_leaf_blocks_per_key, i.avg_data_blocks_per_key from user_indexes i where i.table_name='XT_TEST';
```

이 필드는 매우 불균형한 값 분포를 가지고 있습니다:

| A  | COUNT(*) |
|----|----------|
| 1  | 11       |
| 2  | 20       |
| 3  | 59       |
| 4  | 92       |
| 5  | 178      |
| 6  | 251      |
| 7  | 521      |
| 8  | 640      |
| 9  | 570      |
| 10 | 636      |
| 11 | 962      |
| 12 | 970      |
| 13 | 1151     |
| 14 | 1544     |
| 15 | 1363     |
| 16 | 1692     |
| 17 | 2023     |
| 18 | 2021     |
| 19 | 2550     |
| 20 | 2606     |
| 21 | 3050     |
| 22 | 3171     |
| 23 | 3395     |
| 24 | 3472     |
| 25 | 4268     |
| 26 | 3698     |
| 27 | 3596     |
| 28 | 4130     |
| 29 | 3527     |
| 30 | 17063    |
| ALL| 69230    |

고유한 값을 사용한 표준 쿼리는 매우 비효율적입니다 - 인덱스에 고유 키는 30개뿐이지만 읽어야 할 블록은 135개입니다! IFS를 사용하면:

```sql
DB11G/XTENDER select /*+ INDEX(xt_test) */ distinct a from xt_test;
30 rows selected.
Elapsed: 00:00:00.02
Execution Plan
----------------------------------------------------------
Plan hash value: 3405466263
----------------------------------------------------------
| Id | Operation         | Name      | Rows | Bytes | Cost (%CPU)| Time     |
----------------------------------------------------------
| 0  | SELECT STATEMENT  |           | 30   | 90    | 140 (3)    | 00:00:02 |
| 1  | SORT UNIQUE NOSORT|           | 30   | 90    | 140 (3)    | 00:00:02 |
| 2  | INDEX FULL SCAN   | IX_TEST_A | 69230| 202K  | 137 (1)    | 00:00:02 |
----------------------------------------------------------
Statistics
----------------------------------------------------------
1 recursive calls
0 db block gets
138 consistent gets
0 physical reads
0 redo size
751 bytes sent via SQL*Net to client
431 bytes received via SQL*Net from client
3 SQL*Net roundtrips to/from client
0 sorts (memory)
0 sorts (disk)
30 rows processed
```

우리는 또한 필요한 블록만 방문하여 트리를 따라갈 수 있지만 모든 리프 블록을 방문하지는 않습니다! 그러나 Oracle은 이를 자체적으로 처리할 수 없으므로 약간의 변형이 필요합니다: IFS(min/max) 외에도 Oracle에는 범위와 경계를 잘 처리하는 IRS(min/max)도 있습니다. 재귀 쿼리를 사용하여 필요한 것만 읽도록 만들 수 있습니다!

```sql
DB11G/XTENDER with t_unique(a) as (
    select min(t1.a) from xt_test t1
    union all
    select (select min(t1.a) from xt_test t1 where t1.a  t.a)
    from t_unique t
    where a is not null
)
select * from t_unique where a is not null;
30 rows selected.
Elapsed: 00:00:00.00
Execution Plan
----------------------------------------------------------
Plan hash value: 2791305641
----------------------------------------------------------
| Id | Operation         | Name      | Rows | Bytes | Cost (%CPU)| Time     |
----------------------------------------------------------
| 0  | SELECT STATEMENT  |           | 2    | 26    | 4 (0)      | 00:00:01 |
|* 1 | VIEW              |           | 2    | 26    | 4 (0)      | 00:00:01 |
| 2  | UNION ALL         |           |      |       |            |          |
| 3  | SORT AGGREGATE    |           | 1    | 3     |            |          |
| 4  | INDEX FULL SCAN   | IX_TEST_A | 1    | 3     | 2 (0)      | 00:00:01 |
| 5  | SORT AGGREGATE    |           | 1    | 3     |            |          |
| 6  | FIRST ROW         |           | 1    | 3     | 2 (0)      | 00:00:01 |
|* 7 | INDEX RANGE SCAN  | IX_TEST_A | 1    | 3     | 2 (0)      | 00:00:01 |
|* 8 | RECURSIVE WITH PUMP|          |      |       |            |          |
----------------------------------------------------------
Predicate Information (identified by operation id):
---------------------------------------------------
1 - filter("A" IS NOT NULL)
7 - access("T1"."A"  :B1)
8 - filter("A" IS NOT NULL)
Statistics
----------------------------------------------------------
1 recursive calls
0 db block gets
36 consistent gets
0 physical reads
0 redo size
751 bytes sent via SQL*Net to client
431 bytes received via SQL*Net from client
3 SQL*Net roundtrips to/from client
32 sorts (memory)
0 sorts (disk)
30 rows processed
```

차이는 분명합니다: 30개의 값을 위해 36개의 일관된 읽기 대신 135개의 읽기가 필요합니다. 이 예제는 매우 작은 테이블이지만, 수백만 개의 항목에 대해서는 훨씬 큰 차이가 날 것입니다!

알고리즘 설명:
- 유니온 올의 첫 부분(플랜의 3-4 줄)에서 재귀를 시작할 위치를 지정하고, 특히 인덱스에서 최소(첫 번째) 값을 선택합니다.
- 이후에는 IRS(min/max)를 사용하여 이전 단계에서 선택한 값보다 큰 첫 번째 값을 선택합니다(플랜의 7-6-5 줄).
- 반복하여 재귀를 통해 값을 찾을 때까지 계속합니다.

다음으로 넘어갑니다:

2. 각 키 값에 대한 상위 N개 항목
이제 각 초기 값을 쉽게 가져올 수 있는 도구를 갖추었으므로, 각 값에 대한 상위 N을 쉽게 가져올 수 있습니다. 남은 유일한 문제는, row_number/rownum을 사용한 인라인 뷰를 사용할 수 없다는 점입니다. 상위 레벨의 조건이 푸시되지 않기 때문에, 단순 제한을 사용하여 필요한 액세스를 IRS 내림차순(암시적 정렬을 위해 필요하며, 인덱스_desc 힌트를 사용하여 정렬을 피합니다)으로 해야 합니다. 이를 위해서는 비공식적인 Lateral()을 사용하거나, 표준 table(multiset(...))을 사용해야 합니다. 또 다른 방법으로는 xmltable()을 사용하는 것입니다. 더 어려운 방법이지만, 위험하지 않습니다. 마지막으로 cursor()를 사용하여 푸시된 조건을 사용할 수 있습니다:

```sql
with t_unique(a) as (
    select min(t1.a)
    from xt_test t1
    union all
    select (select min(t1.a)
            from xt_test t1
            where t1.a  t.a)
    from t_unique t
    where a is not null
)
select cursor(select rid
              from (select tt.a, tt.rowid rid, row_number() over (partition by a order by b desc) rn
                    from xt_test tt
                    order by tt.b desc)
              where a=v.a and rn<=5)
from t_unique v;
```

이를 사용하여 원하는 결과를 얻을 수 있습니다. 실제로 커서로서 리턴된 결과를 가져오는 것이 아니라, 예상되는 결과와 동일하게 작동합니다. 이는 특히 필요한 것보다 더 많은 rowid를 수행하지 않으므로 안전합니다.

마지막으로 몇 가지 대안:

```sql
alter session set events '22829 trace name context forever';

with t_unique(a) as (
    select min(t1.a)
    from xt_test t1
    union all
    select (select min(t1.a)
            from xt_test t1
            where t1.a  t.a)
    from t_unique t
    where a is not null
)
select *
from t_unique v, table(cast(multiset(
    select tt.rowid rid
    from xt_test tt
    where tt.a=v.a and rownum <= 5
    order by tt.b desc
) as sys.odcivarchar2list)) rids, xt_test tt
where tt.rowid = rids.column_value
order by tt.a, tt.b desc;

with t_unique(a) as (
    select min(t1.a)
    from xt_test t1
    union all
    select (select min(t1.a)
            from xt_test t1
            where t1.a  t.a)
    from t_unique t
    where a is not null
)
select *
from t_unique v, lateral(
    select tt.*
    from xt_test tt
    where tt.a=v.a and rownum <= 5
    order by tt.a, tt.b desc) r
order by r.a, r.b desc;

with t_unique(a) as (
    select min(t1.a)
    from xt_test t1
    union all
    select (select min(t1.a)
            from xt_test t1
            where t1.a  t.a)
    from t_unique t
    where a is not null
)
select *
from t_unique v, xmltable(
    '/ROWSET/ROW'
    passing xmltype(dbms_xmlgen.getxml('select tt.rowid rid
                                       from xt_test tt
                                       where tt.a='||v.a||' and rownum <= 5
                                       order by tt.b desc'))
    columns rid rowid path 'RID'
) rids, xt_test tt
where tt.rowid = rids.rid
order by tt.a, tt.b desc;
```

이 예제는 매우 작은 테이블에서 수행되지만, 수백만 개의 항목에 대해서는 훨씬 큰 차이를 가져올 것입니다!

결론적으로, 이 "인덱스 바운시 스캔" 접근법은 상당히 효율적인 방법으로 고유 값을 찾고 각 고유 값에 대해 상위 N개 항목을 가져올 수 있습니다. 특히 매우 큰 데이터 세트와 비균형 분포를 가진 경우에 유용합니다.

### 질문과 피드백을 환영합니다!

