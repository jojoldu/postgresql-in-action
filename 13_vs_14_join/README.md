# PostgreSQL (Aurora) 13 vs 14 Nested Loop Join 성능 비교

PostgreSQL에서는 3가지의 Join을 지원한다.

- Nested loop join
- Hash join
- Merge join

Join 테이블 중 하나라도 행이 적은 경우 Nested loop join이 주로 적용된다.  
Nested loop join 은 조인 조건이 동일 연산자를 사용하지 않는 경우에도 유일한 옵션으로 사용된다.

외부 집합에는 예상대로 두 개의 행(실제 행=2)이 포함됩니다. 내부 인덱스 스캔 노드는 두 번 호출되었고(루프=2) 매번 평균적으로 4개의 행을 반환했습니다(실제 행=4). 총계는 8행입니다(실제 행=8).

주로 출력을 읽을 수 있도록 유지하기 위해 단계별 타이밍을 껐지만 일부 플랫폼에서는 타이밍 기능으로 인해 실행 속도가 상당히 느려질 수 있다는 점에 주목할 가치가 있습니다. 그러나 타이밍을 다시 켜면 행 수와 같이 타이밍이 평균화되는 것을 볼 수 있습니다. 여기에서 타이밍에 루프 수를 곱하여 전체 추정치를 얻을 수 있습니다.



## Memoization (Row caching)

동일한 매개변수를 사용하여 내부 집합 행을 반복적으로 스캔하고 (결과적으로) 매번 동일한 결과를 얻는다면 더 빠른 액세스를 위해 행을 캐시하는 것이 좋습니다.

이것은 Memoize 노드의 도입으로 PostgreSQL 14에서 가능해졌습니다. Memoize 노드는 어떤 면에서 Materialize 노드와 비슷하지만 매개변수화된 조인에 맞게 특별히 조정되었으며 내부적으로는 훨씬 더 복잡합니다.

Materialize는 단순히 하위 노드의 모든 행을 구체화하는 반면 Memoize는 각 매개변수 값에 대해 별도의 행 인스턴스를 저장합니다.

최대 저장 용량에 도달하면 Materialise는 디스크의 추가 데이터를 오프로드하지만 Memoize는 그렇지 않습니다(캐싱의 이점이 무효화되기 때문).

먼저 플래너   는 캐싱 목적으로 work_mem  ×  hash_mem_multiplier 프로세스 메모리를 할당합니다. 두 번째 매개변수  hash_mem_multiplier  (기본적으로 1.0)는 노드가 해시 테이블(이 경우 열린 주소 지정 포함)을 사용하여 행을 검색한다는 힌트를 제공합니다. 매개변수(또는 매개변수 세트)는 캐시 키로 사용됩니다.

그 외에도 모든 키가 목록에 포함됩니다. 목록의 한쪽 끝에는 "콜드" 키(한동안 사용되지 않음)가 저장되고 다른 쪽 끝에는 "핫" 키(최근에 사용됨)가 저장됩니다.

Memoize 노드가 호출될 때마다 전달된 매개변수 값에 해당하는 행이 이미 캐시되었는지 확인합니다. 그렇다면 Memoize는 자식 노드를 호출하지 않고 부모 노드(Nested Loop)로 반환합니다. 또한 캐시 키를 키 목록의 핫 엔드에 넣습니다.

필요한 행이 아직 캐시되지 않은 경우 Memoize는 자식 노드에서 행을 요청하고 캐시한 다음 위쪽으로 전달합니다. 새 캐시 키도 목록의 핫 엔드에 배치됩니다.

캐시가 가득 차면 할당된 메모리가 부족할 수 있습니다. 그런 일이 발생하면 Memoize는 목록에서 가장 차가운 항목을 제거하여 공간을 확보합니다. 알고리즘은 버퍼 캐시에서 사용되는 알고리즘과 다르지만 동일한 목표를 제공합니다.

매개변수가 너무 많은 행과 일치하여 다른 모든 항목이 제거되더라도 캐시에 들어갈 수 없는 경우 매개변수의 행은 단순히 캐시되지 않습니다. 다음 번에 매개변수가 나타날 때 Memoize가 전체 출력을 얻기 위해 하위 노드를 호출해야 하기 때문에 부분 출력을 캐싱하는 것은 의미가 없습니다.

여기서 카디널리티 및 비용 추정치  는 이전에 본 것과 유사합니다.

여기서 주목할만한 점은 계획의 메모이즈 노드 비용이 자식 노드의 비용에  cpu_tuple_cost  를 더한 값일 뿐이며 큰 의미가 없다는 것입니다.

노드를 원하는 유일한 이유는 이 비용을 줄이기 위해서입니다. Materialize 노드는 동일한 불확실성을 겪고 있습니다. "실제" 노드 비용은  계획에 나열되지 않은 반복 스캔 비용 입니다.

Memoize 노드의 반복 스캔 비용은 사용 가능한 메모리 양과 캐시에 액세스하는 방식에 따라 다릅니다. 또한 내부 세트 스캔 수를 결정하는 예상 고유 매개변수 값의 수에 따라 크게 달라집니다. 이러한 모든 변수를 사용하여 캐시에서 주어진 행을 찾을 확률과 캐시에서 주어진 행을 제거할 확률을 계산할 수 있습니다. 첫 번째 값은 예상 비용을 감소시키고 다른 값은 증가시킵니다.

이 계산의 세부 사항은 이 문서의 주제와 관련이 없습니다.

지금  EXPLAIN ANALYZE 은 Memoize 노드가 있는 계획이 어떻게 실행되는지 확인하기 위해 즐겨 사용하는 명령을 사용하겠습니다.

이 예제 쿼리는 특정 비행 경로 및 특정 항공기 유형과 일치하는 모든 비행을 선택하므로 캐시 키는 모든 Memoize 호출에 대해 동일합니다. 필요한 행은 초기 호출 시 캐시되지 않지만(Misses: 1) 모든 반복 호출(Hits: 112)에는 캐시됩니다. 캐시 자체는 총 1KB의 메모리를 모두 차지합니다.

두 개의 0 값인 Evictions 및 Overflows에 유의하십시오. 전자는 캐시에서 제거된 횟수이고 후자는 메모리 오버플로 횟수입니다. 여기서 주어진 매개변수 값에 대한 전체 출력은 할당된 메모리 크기보다 커서 캐시할 수 없습니다.

높은 제거 및 오버플로 값은 할당된 캐시 크기가 충분하지 않음을 나타냅니다. 이는 가능한 매개변수 값의 추정치가 올바르지 않을 때 자주 발생합니다. 이 경우 Memoize 노드를 사용하는 데 비용이 많이 들 수 있습니다. 최후의 수단으로  enable_memoize  매개변수를  off 로 설정하여 캐시 사용을 비활성화할 수 있습니다 .



[memoize](https://postgresqlco.nf/doc/en/param/enable_memoize/)

![aurora-versions](./images/aurora-versions.png)


> Amazon Aurora (RDS) 에서 파라미터가 Boolean이면 1 (ON) or 0 (OFF) 으로 설정한다.


### enable_memoize

```sql
SELECT current_setting('enable_memoize');
```

![console](./images/console.png)


## 성능 테스트

```sql
CREATE TABLE team AS
SELECT team_no, team_no % 100 AS department_no
FROM generate_series(1, 10000) AS team_no;

CREATE TABLE users AS
SELECT user_no, user_no % 20000 as department_no
FROM generate_series(1, 5000000) AS user_no;

CREATE INDEX idx_user_department_no ON users (department_no);
```

- `team`
  - 10,000 row (1만건)
  - 1 ~ 100개의 `department_no`
- `users`
  - 5,000,000 row (500만건)
  - 1 ~ 20,000 개의 `department_no`
  - Join 성능 향상을 위한 index (`department_no`)

위와 같이 테이블을 생성 한 뒤, 이제 실험을 진행한다.

성능 테스트에 사용할 쿼리는 다음과 같다.

```sql
SELECT *
FROM team JOIN users on team.department_no = users.department_no
where team.department_no between 50 and 100;
```

해당 쿼리는 

- `team.department_no between 50 and 100` 는 `seq` 로 탐색하고
- `team.department_no = users.department_no` 는 `index` 로 탐색한다.


성능 테스트를 위해 아래와 같이 반복문으로 **총 10번의 쿼리를 수행하고, 총 수행시간**을 합산한다.

```sql
DO $$
DECLARE
  v_ts TIMESTAMP;
  rec RECORD;
BEGIN

  FOR r IN 1..10 LOOP
    v_ts := clock_timestamp();

      FOR rec IN (
        SELECT *
        FROM team JOIN users on team.department_no = users.department_no
        where team.department_no between 50 and 100
      ) LOOP
        NULL;
      END LOOP;

    RAISE INFO 'Run %, timestamp: %', r, (clock_timestamp() - v_ts);
  END LOOP;
END$$;
```


### PG 13

PG 13에서는 다음과 같은 실행 계획을 가진다.

그리고 실행 결과는 

![pg13_1](./images/pg13_1.png)

- 1회 평균 `285ms` 
- 10회 총합은 `2.855s` 이다.

### PG 14

PG 14는 2가지 종류로 진행된다.

- `enable_memoize` 를 `ON` 한 경우
- `enable_memoize` 를 `OFF` 한 경우

#### enable_memoize ON

![pg14_1](./images/pg14_1.png)

- 1회 평균 `263ms` 
- 10회 총합은 `2.632s` 이다.

#### enable_memoize OFF

![pg14_1_2](./images/pg14_1_2.png)

- 1회 평균 `281ms` 
- 10회 총합은 `2.814s` 이다.

PG13에서 14로 업데이트후, `enable_memoize` 이 도입됨으로 **Nested Loop Join은 10%의 성능 개선**이 되었다.

## LATERAL 

https://www.heap.io/blog/postgresqls-powerful-new-join-type-lateral