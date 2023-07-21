# PostgreSQL Online DDL

Aurora MySQL 5.7까지만 써본 경험에서 Online DDL 은 여전히 부담스럽다.  
그럼에도 수억건의 테이블에 DDL을 수행하는 것은 언제나 서비스 운영시에 필요한 사항이다.


데이터가 많은 만큼 시간소요 예측도 힘들고 만약 작업이 실패하는 경우 rollback 작업에 따른 위험도도 크기 때문입니다.

> 백업데이터로 테스트를 진행하지만 막상 라이브 환경에서는 시간소요가 더 오래 걸리는 경우도 많음

Aurora PostgreSQL에서는 약 200G 테이블에 인덱스, 컬럼 추가를 해본 결과 100G만 넘어도 인덱스 생성에 1시간이 넘는 Aurora MySQL과는 다르게 40여 분 만에 인덱스가 생성되었습니다! 컬럼 추가는 바로 되네요

PostgreSQL의 online ddl 컬럼 추가는 meta data를 저장하는 시스템 카탈로그에 추가된 정보만 반영하기 때문에 아주 빠른 작업이 가능합니다.


Craig Ringer가 언급 했듯이 PostgreSQL은 오래 전부터 잠금 없이 일부 ALTER 작업을 지원하기 시작했습니다.

그러나 버전 11 ALTER TABLE ... ADD COLUMN ... DEFAULT ... NOT NULL 에서는 테이블 재작성(및 긴 잠금)도 방지하므로 마이그레이션에 안전하게 사용할 수 있습니다.

## Alter Table

오래전부터 PostgreSQL은 테이블의 스키마를 변경하는 것이지만, 최신 데이터베이스는 이 작업을 거의 즉시 수행할 수 있을 만큼 충분히 정교합니다. 테이블의 기존 표현을 다시 작성하는 대신(따라서 기존의 모든 데이터를 막대한 비용을 들여 복사해야 함), 새 열에 대한 정보가 시스템 카탈로그에 추가되므로 비용이 저렴합니다. 따라서 새 열에 대한 값으로 새 행을 작성할 수 있으며, 시스템은 이전에 값이 없었던 현재 행에 대해 NULL을 반환할 수 있을 만큼 똑똑합니다.

### 성능비교

```sql
CREATE TABLE team AS
SELECT team_no, team_no % 100 AS department_no
FROM generate_series(1, 50000000) AS team_no;
```

- 5천만건

```sql
SELECT pg_size_pretty(pg_total_relation_size('"public"."team"'));
```

![size](./images/table_size.png)

**alter table**

```sql
ALTER TABLE team ADD COLUMN credits bigint;
```

**alter table with default value**

```sql
ALTER TABLE team ADD COLUMN credits2 bigint NOT NULL DEFAULT 0;
```

#### PostgreSQL 10

#### PostgreSQL 11

#### PostgreSQL 12

#### PostgreSQL 13
## Alter Table with Default Value

[PostgreSQL 11의 릴리즈 노트](https://www.postgresql.org/docs/11/release-11.html) 를 보면 **Alter Table에 기본값이 포함되어도 빠르게 생성할 수 있다**는 내용이 나온다.

> Many other useful performance improvements, including the ability to avoid a table rewrite for ALTER TABLE ... ADD COLUMN with a non-null column default




ALTER TABLE .. ADD COLUMNnull이 아닌 열을 기본값으로 더 빠르게 만드는 것을 포함하여 다른 많은 유용한 성능 향상

새 릴리스의 주력 기능은 아니지만 Postgres가 수년 동안 수행한 더 중요한 운영 개선 사항 중 하나입니다. 비록 그 이유가 즉시 명확하지 않을 수 있지만 말입니다. 짧은 버전은 스키마 디자인의 정확성을 어렵게 만드는 제한 사항을 제거한 것이지만 세부 사항을 살펴보겠습니다.

변경 및 독점 잠금
테이블에 새 열을 추가하는 가장 간단한 데이터베이스 문 중 하나를 잠시 고려하십시오.

ALTER TABLE users
    ADD COLUMN credits bigint;
테이블의 스키마를 변경하고 있지만 최신 데이터베이스는 이 작업을 거의 즉각적으로 수행할 수 있을 만큼 정교합니다. 테이블의 기존 표현을 다시 작성하는 대신(따라서 모든 기존 데이터를 강제로 복사해야 함) 새 열에 대한 정보가 저렴한 시스템 카탈로그에 추가됩니다. 이를 통해 새 열에 대한 값으로 새 행을 작성할 수 있으며 시스템은 NULL이전에 값이 없었던 현재 행에 대해 반환할 만큼 충분히 똑똑합니다.

DEFAULT그러나 동일한 명령문에 절을 추가하면 상황이 복잡해집니다 .

ALTER TABLE users
    ADD COLUMN credits bigint NOT NULL DEFAULT 0;
SQL은 거의 동일할 정도로 유사해 보이지만 이전 작업이 사소했다면 이 작업은 이제 테이블과 모든 인덱스를 완전히 다시 작성해야 한다는 점에서 훨씬 더 비쌉니다. 이제 null이 아닌 값이 포함되기 때문에 데이터베이스는 돌아가서 모든 기존 행에 데이터 무결성을 주입하여 데이터 무결성을 보장합니다.

그 비용에도 불구하고 Postgres는 여전히 재작성을 효율적으로 수행할 수 있으며 더 작은 데이터베이스에서는 즉시 발생하는 것처럼 보입니다.


## 참고

- https://tool.lu/en_US/article/3j3/preview
- https://brandur.org/postgres-default