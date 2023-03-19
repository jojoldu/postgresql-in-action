# PostgreSQL Log Parameter 설정

DB를 활용한 365/24시간 서비스에서 가장 중요한 설정 중 하나가 **DB 로그를 어떻게 남기고 관리할 것인가**이다.  

MySQL을 주로 사용하다가 PostgreSQL 을 사용하게 되면서 PostgreSQL에서 지원하는 다양한 로그 파라미터들을 알게 되었다.  
아래는 사내에서 적용하고 있는 PostgreSQL 의 필수 로그 파라미터 값들이다.

> ChatGPT 가 나와서 이제 이런 파라미터값들이 무엇을 하는지 정리하는게 의미가 있나 싶지만...ㅠ

## 파라미터

각 설정들은 [공식 문서](https://www.postgresql.org/docs/14/runtime-config-logging.html) 를 확인해보면 더 자세하게 확인할 수 있다.

> 각 설정을 남길 경우 발생되는 로그 메세지 샘플도 첨부했다.
> 해당 로그 메세지를 파싱하여 Slack 알람 등을 보내는 Lambda 함수를 만드는데 활용하면 좋다.

### log_temp_files

권장: `1024`

- 설정된 값(KB) 이상의 임시 파일을 사용하는 SQL 쿼리를 기록
- 대부분의 경우 전체 테이블 스캔에 해당
  - ex) 대용량 테이블의 해시 조인을 사용한 경우 등

### Log_min_messages

권장: `error`

- 로그에 기록되는 메시지 종류를 필터링하여 원하는 유형의 메시지만 로그에 남길 수 있도록 한다.
- `error` 로 설정하면 warning 또는 notice 메세지는 기록되지 않는반면, error / log / fatal / panic 로그는 남긴다.

### log_lock_waits

권장: `1`
- 교착 상태 감지를 위해 설정
  - ex) 하나의 트랜잭션이 다른 트랜잭션을 block 할 경우에 대한 로깅 기준
- 설정된 기간(기본값 1초)보다 긴 기간 동안 잠긴 상태로 유지되는 세션을 로깅할 수 있다. 
- 해당 로그 발생시 blocking 혹은 blocked session 을 중지 해야한다

### log_statement

권장: `ddl`
기본값은 `none` 

- 어떤 로그들을 남길 것인지 설정할 수 있는 값
- 아래 4개의 옵션을 선택할 수 있다
  - `ddl`
    - 모든 DDL(ex: CREATE, ALTER 및 DROP)을 로깅
  - `mod` 
    - 모든 DDL 및 DML(ex: INSERT, UPDATE 및 DELETE)을 로깅
  - `all`
    - 실행 시간에 상관없이 모든 쿼리를 로깅
  - `none`
    - 기본값이자, 아무것도 로깅하지 않는 옵션

해당 옵션을 `ddl`로 설정하면 다음과 같이 `insert`, `update`, `delete` 를 남긴다.

```sql
2023-03-10 04:08:47 UTC:10.0.0.123(52834):inflab@testdb:[20175]:LOG: statement: ALTER TABLE testdb DROP COLUMN created_at;
```

### log_min_duration_statement

권장: `1000` 혹은 `100`

- 지정된 시간 (ms) 이상의 시간이 소요된 쿼리들을 로깅
- 예를 들어, `log_min_duration_statement` 값을 500으로 설정하면 쿼리 유형에 상관없이 완료 시간이 0.5초보다 긴 모든 쿼리를 로깅 
- slow query에 대해 정의하는 기준이 된다.

우리팀의 경우 `100` (0.1초) 로 설정해서 사용한다.  
100ms 의 쿼리들이 다건으로 발생해서 문제가 되는 경우가 종종 발생했고, 우리 정도의 데이터 양에서는 100ms 만 걸려도 이후 서비스가 성장함에 따라 충분히 수초의 쿼리가 될수도 있기 때문이다.  
  
다만, **이걸 100으로 설정하면 너무 많은 쿼리들이 로깅될 수 있어 로깅 자체가 DB의 부하**를 줄 수도 있기 때문에 본인 서비스에 맞게 설정이 필요하다.  
  
해당 값을 설정하면 다음과 같은 로그를 확인할 수 있다.

```sql
2023-03-10 07:09:17 UTC:10.0.0.123(52834):inflab@testdb:[20175]:LOG: duration: 1087.507 ms statement: SELECT count(*) FROM orders where created_at > '2023-03-01 00:00:00';
```

### log_autovacuum_min_duration

권장: `1000`

- 지정된 시간(ms) 이상 실행되는 autovacuum 및 autoanalyze 을 로깅한다.
- 0으로 설정 하면 **모든 autovacuum 및 autoanalyze을 로깅**한다.

auto-vacuum 은 PostgreSQL에서 중요한 작업이지만 CPU, 메모리, IO 리소스 사용량 측면에서 비용이 발생한다.  
이로 인해 대형 장애가 발생하기도 하는데 ([대표적인 예](https://tech.inflab.com/202201-event-postmortem/)), 이런 장애들에 대한 정보를 확인할 수 있는 귀중한 로깅이다.

설정하면 다음과 같은 로그를 확인할 수 있다.

```sql
2023-03-10 07:09:17 UTC::@:[29679]:LOG: automatic vacuum of table "inflab.public.orders": index scans: 0
pages: 0 removed, 10811 remain, 0 skipped due to pins, 0 skipped frozen
tuples: 1000001 removed, 1000000 remain, 0 are dead but not yet removable, oldest xmin: 113942594
buffer usage: 21671 hits, 0 misses, 1 dirtied
avg read rate: 0.000 MB/s, avg write rate: 0.003 MB/s
system usage: CPU: user: 0.12 s, system: 0.00 s, elapsed: 2.30 s
2023-03-10 07:09:17 UTC::@:[29679]:LOG: automatic analyze of table "inflab.public.orders" system usage: CPU: user: 0.06 s, system: 0.00 s, elapsed: 1.17 s
```

- auto vacuum가 실행된 시간, 완료하는 데 걸린 시간 등을 남긴다.  
- 특정 시간대의 높은 I/O 또는 CPU 부하, Lock 으로 인해 auto vacuum 가 오래된 행을 처리할 수 없어 테이블의 찌꺼기 데이터가 증가하는 등의 성능 이슈를 해결하는데 이용할 수 있다.

### rds.force_autovacuum_logging_level

권장: `log`
기본값: `disabled`

- 만약 설정한다면 `log_autovacuum_min_duration` 이 설정한 값에 따라 실행되는 autovacuum 및 autoanalyze 을 로깅한다.
- 즉, 해당 옵션이 `log` 일 경우 `log_autovacuum_min_duration` 이상 수행되는 auto vacuum 일때는 `log` 레벨 이상의 로그들을 남긴다.

바로 위에서 소개한 `log_autovacuum_min_duration` 와 `rds.force_autovacuum_logging_level` 는 항상 함께 고려한다. 

### auto_explain.log_min_duration

권장: `1000`

- Query 실행 시간이 지정된 시간(ms) 이상이면 실행 계획을 로깅한다.
- [공식 문서](https://www.postgresql.org/docs/current/auto-explain.html) 를 참고하면 `auto_explain` 에 대해 자세히 알 수 있다.

설정하면 다음과 같은 로그를 확인할 수 있다.

```sql
2023-03-10 07:09:17 UTC:10.0.0.123(53094):inflab@testdb:[18387]:LOG: duration: 2376.049 ms plan:
Query Text: select * from courses c join vocuhers on v.courses_id = c.id where v.user_id=12312 and v.deleted_at is null;
Nested Loop  (cost=1.40..74738.03 rows=16154 width=8) (actual time=1.940..3420.203 rows=9596 loops=1)
  ->  Nested Loop  (cost=0.97..67403.74 rows=16333 width=8) (actual time=1.923..798.090 rows=9623 loops=1)
        ->  Index Only Scan using courses_pkey on courses c  (cost=0.41..16.62 rows=10 width=4) (actual time=0.022..0.099 rows=10 loops=1)
"              Index Cond: (id = ANY (''::integer[]))"
              Heap Fetches: 34
        ->  Index Scan using vouchers_course_id_index on vouchers v  (cost=0.56..6657.56 rows=8115 width=8) (actual time=1.778..79.711 rows=962 loops=10)
              Index Cond: (course_id = c.id)
              Filter: (deleted_at IS NULL)
              Rows Removed by Filter: 43
  ->  Index Scan using users_pkey on users u  (cost=0.43..0.45 rows=1 width=4) (actual time=0.272..0.272 rows=1 loops=9623)
        Index Cond: (id = v.user_id)
        Filter: (deleted_at IS NULL)
        Rows Removed by Filter: 0
```

아래 항목들을 모두 확인할 수 있다.

- 수행한 쿼리
- 수행시간
- 실행 계획

### shared_preload_libraries

권장: `auto_explain`

- `auto_explain` 이면 자동으로 로깅 된다.
- `auto_explain` 을 설정해야 `auto_explain.log_min_duration` 를 초과하는 쿼리들에 대해 로그를 남길 수 있다.

위에서 언급한 `auto_explain.log_min_duration` 와 `shared_preload_libraries` 역시 항상 함께 설정한다.

### rds.force_admin_logging_level

권장: `log`

- 마스터 사용자의 활동들에 대한 로깅 레벨
- 예를 들어, 마스터 사용자의 비밀번호를 잊어버려서 재설정하려는 경우 설정한 로깅 레벨에 맞게 로그를 남긴다. 
- 마스터 관리자가 실행한 모든 쿼리를 로그로 남겨준다

## 주의할 점

- `log_statement`를 `all` 혹은 `mod`로 설정하면 **DML 쿼리들의 duration이 출력되지 않는다**.

이는 중복적으로 쿼리 로그가 생기지 않기 위함인데, `log_statement` 를 `all` 혹은 `mod`로 설정하면 모든 쿼리 혹은 DML 쿼리까지 로깅 대상이 되다보니 `log_min_duration_statement` 을 통한 쿼리 로깅 시간이 포함된 로그가 남겨지지 않는다.

## 마무리

데이터베이스의 로그 관련 파라미터들을 잘 남겨야 모니터링, 장애 알림, 장애 로그 등을 좀 더 정교하게 구성하여 시스템 장애를 해결할 수 있다.  
위와 같이 남긴 로그들을 기반으로 ELK 혹은 CloudWatch 대시보드 등의 모니터링 시스템을 구성하거나 남겨진 로그들을 원하는 형태로 파싱하여 Slack 알람등을 구성해도 된다.  
  
어떤 장애 대응도 가장 먼저 **로그 관리**부터 시작이다.