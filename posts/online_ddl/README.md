# PostgreSQL Online DDL

Aurora MySQL 5.7까지만 써본 경험에서 Online DDL 은 여전히 부담스럽다.  
그럼에도 대량의 데이터가 쌓인 테이블에 DDL을 수행하는 것은 서비스를 운영하다보면 피할 수 없다.  
  
100GB 이상의 테이블에 Online DDL로 컬럼을 추가해도 1시간이 넘도록 수행되던 경험을 해보면 가능한 기존 테이블에 컬럼을 추가하는 등의 DDL 작업은 피하고 싶어진다.    

다만, MySQL과 다르게 PostgreSQL에서는 오래 전부터 **일부 ALTER 작업에 대해서는 잠금 없는 변경**이 가능하다.  

이는 MySQL에서는 **테이블 구조를 변경할때 전체 테이블의 데이터를 새로운 구조로 복사하는 방식**을 취해서 테이블의 크기가 큰 경우 오래 걸리는 것과 다르게 PostgreSQL에서는 테이블 구조 변경 작업시 **meta data를 저장하는 시스템 카탈로그에 추가된 정보만 반영한다**.  
즉, 테이블 데이터를 새로 복사하지 않고 메타데이터만 업데이트 하기 때문에 테이블의 크기와 관계 없이 빠른 작업이 가능하다.  

> 물론 여기에 더하여 PostgreSQL에서는 Alter Table은 트랜잭션을 지원해서 변경사항을 롤백할 수 있다거나 MVCC로 인해 테이블 변경 작업에도 테이블 읽기가 차단되지 않는 동시성 등의 장점이 존재한다.

여기에 더해 PG 11 버전 부터는 `default value` & `Not Null` 값을 포함한 컬럼 추가에서도 성능 개선이 있었다.
  
이번 시간에는 `alter table` 과 `alter table with defaul value` 를 각각 10, 11버전에서를 비교해본다.

## 1. 성능 비교

개인 PC에 Docker를 통해 PG 10, 11을 각각 수행한다.

- 2020 M1 Mac Mini
- 16GB Memory

테스트할 테이블은 다음과 같이 **1천만건**을 생성해둔다.

```sql
CREATE TABLE team AS
SELECT team_no, team_no % 100 AS department_no
FROM generate_series(1, 10000000) AS team_no;
```

테이블의 크기는 1.7GB이다.

```sql
SELECT pg_size_pretty(pg_total_relation_size('"public"."team"'));
```

![size](./images/table_size.png)

각 버전별로 이제 테스트를 해보자.
### PG 10

**alter table**

```sql
ALTER TABLE team ADD COLUMN credits bigint;
```

![10_1](./images/10_1.png)

**5ms**로 즉시 적용되었다.  
이번엔 `not null & default value` 을 포함해서 진행해본다.

**alter table with not null & default value**

```sql
ALTER TABLE team ADD COLUMN credits2 bigint NOT NULL DEFAULT 0;
```

그럼 다음과 같이 **3.5초**가 걸린다.

![10_2](./images/10_2.png)

ms로 변환하면 3,500ms 인데, 단순 `alter table` 과 비교하면 **700배**의 성능 차이가 발생했다.  
  
이는 PostgreSQL 이 실제로 전체 테이블을 다시 작성하여 각 행에 열을 추가하고 기본값으로 채우기 때문이다.
  
반면에 11버전에서는 어떻게 될까?

### PG 11

[PostgreSQL 11의 릴리즈 노트](https://www.postgresql.org/docs/11/release-11.html) 를 보면 **Alter Table에 기본값과 non null 옵션을 포함해서 컬럼을 추가하는 작업의 성능이 개선**되었다는 내용이 나온다.

> Many other useful performance improvements, including the ability to avoid a table rewrite for ALTER TABLE ... ADD COLUMN with a non-null column default

실제로 그런지 한번 확인해보자.  
  
**alter table**

![11_1](./images/11_1.png)

당연하지만 일반적인 컬럼 추가는 **4ms**로 즉시 적용되었다.  
  
본론인 `not null & default value` 을 포함해서 진행해본다.  
  
**alter table with not null & default value**

![11_2](./images/11_2.png)

**not null & default value**가 포함되었음에도 4ms로 일반적인 컬럼추가와 비슷한 성능이 도출되었다.  
  
왜 그런걸까?

## 2. PostgreSQL 11 에서의 성능 개선

이전에는 PostgreSQL에서 새로운 컬럼을 추가하고 해당 컬럼에 non-null 기본값을 설정하려면 전체 테이블을 재작성해야 했다.  
이는 모든 행에 대해 새로운 컬럼 값을 저장해야 했기 때문이다.  
이런 방식은 매우 큰 테이블에 대해 시간 소모적이고, 공간을 많이 사용하며, 동시에 테이블에 대한 액세스를 제한할 수 있다.  
  
그러나 PostgreSQL 11에서는 이를 개선하기 위한 방법을 도입했다.  
새 컬럼이 추가될 때 기본값이 즉시 모든 행에 적용되는 대신, 이 값은 메타데이터로 저장되며 실제 데이터는 필요에 따라 "on the fly"로 생성된다.  
즉, 각 행이 처음으로 새 컬럼을 액세스하면 기본값이 실제로 생성되고 저장된다.

이 방식의 장점은 새로운 컬럼을 추가하는 동작이 즉시 완료되고, 실제 데이터의 채우는 과정이 백그라운드에서 점진적으로 이루어지며, 이로 인해 테이블 잠금 시간을 크게 줄일 수 있다는 것이다.

이와 관련해서 PostgreSQL 11의 - [커밋](https://git.postgresql.org/gitweb/?p=postgresql.git;a=commitdiff;h=16828d5c0273b4fe5f10f42588005f16b415b2d8) 내용을 살펴 보면 다음과 같은 이야기가 있다.  

현재 `non-NULL default` 으로 테이블에 컬럼을 추가하면 테이블 전체를 다시 작성하게 된다.  
큰 테이블의 경우 이는 비용이 많이 들고 방해가 될 수 있다.  
이 패치는 기본값이 변동성이 없는 경우 테이블 재작성의 필요성을 제거한다.  
ALTER TABLE 시점에 기본 표현식이 평가되고 그 결과가 pg_attribute의 새로운 열(`attmissingval`)에 저장되며, 새로운 열(`atthasmissing`)이 true로 설정된다.  
기존 컬럼을 가져올 때는 `attmissingval` 이 제공된다.  
새 컬럼은 제공된 값이나 기본값을 가지므로 `attmissingval` 이 필요하지 않게 된다.

테이블이 다시 작성될 때마다, 모든 속성에 대한 `atthasmissing`과 `attmissingval` 설정이 제거되는데, 이들은 더 이상 필요하지 않기 때문이다.

이로 인한 가장 눈에 띄는 코드 변경은 `heap_attisnull` 에서 볼 수 있는데, 이 함수는 세 번째 인자로 `TupleDesc` 를 받게 되어, 만약 있을 경우 누락된 값을 감지할 수 있게 한다.  
이 인자가 필요 없는 많은 경우(예를 들어, 카탈로그 관계)에는 이 인자에 NULL을 전달할 수 있다.

데이터베이스의 모든 열에 대한 정보를 추적하는 시스템 테이블인 pg_attribute에 두 개의 새로운 필드를 추가했습니다:

atthasmissing: 누락된 기본값이 있을 경우 true로 설정됩니다.
attmissingval: 누락된 값을 포함합니다.
스캔은 행을 반환하면서 이 새로운 필드를 확인하고, 필요한 곳에 누락된 값을 반환합니다. 테이블에 새로 삽입된 행들은 생성될 때 기본값을 가져와서, 그들의 내용을 반환할 때 atthasmissing을 확인할 필요가 없게 됩니다.

pg_attribute 필드는 필요한 동안에만 사용됩니다. 테이블이 언제든지 다시 작성되면, PostgreSQL는 모든 행에 기본값을 삽입하고 atthasmissing과 attmissingval을 해제하는 기회를 가집니다.

attmissingval의 상대적인 간단함 때문에, 이 최적화는 기본값과 비휘발성 함수 호출에만 작동합니다. random()과 같은 변동성 함수를 사용하면 atthasmissing이 설정되지 않고 기본값을 추가하려면 테이블을 다시 작성해야 합니다. 비휘발성 함수 호출은 잘 작동합니다. 예를 들어, DEFAULT now()를 추가하면 트랜잭션의 현재 now() 값이 atthasmissing에 들어가고 모든 기존 행이 이를 상속하게 되지만, 새로 삽입된 행은 예상대로 현재 now() 값이 됩니다.





## 번외 - not null 선언이 필요할까?

문서 저장소, 키/값 저장소 및 기타 덜 정교한 저장 기술보다 관계형 데이터베이스를 선호하는 가장 큰 이유 중 하나는 데이터 무결성이다. 열은 INT, DECIMAL 또는 TIMESTAMPTZ와 같은 강력한 타입으로 입력된다. 값은 NOT NULL, VARCHAR(길이) 또는 CHECK 제약 조건으로 제약된다. 외래 키 제약 조건은 참조 무결성을 보장한다.

스키마 설계가 잘 되어 있으면 데이터베이스가 이를 보장하기 때문에 데이터의 품질이 높은 상태임을 확신할 수 있다. 이렇게 하면 쿼리 또는 변경이 더 쉬워지고, 예기치 않은 상태의 데이터로 인해 발생하는 애플리케이션 수준의 버그 전체를 방지할 수 있다. 저와 같은 애호가들은 항상 강력한 데이터 제약 조건에 찬성해 왔지만, 대규모로 실행되는 Postgres에서는 새로운 null이 아닌 필드를 만들 수 없는 경우가 많다는 사실도 알고 있었다.



## 참고

- https://tool.lu/en_US/article/3j3/preview
- https://brandur.org/postgres-default