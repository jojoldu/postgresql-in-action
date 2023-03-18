# PostgreSQL Log Parameter 설정

로깅하려는 쿼리에 따라 log_statement 또는 log_min_duration_statement를 활성화할 수 있습니다. 

## 필수 로깅 파라미터

- `log_temp_files`
  - 권장: `1024`
  - 설정된 값(KB) 이상의 임시 파일을 사용하는 SQL 쿼리를 기록
  - 대부분의 경우 전체 테이블 스캔에 해당
    - ex - 대용량 테이블의 해시 조인을 사용한 경우 등
- `Log_min_messages`
  - 권장: `error`
  - 로그에 기록되는 메시지 종류를 필터링하여 원하는 유형의 메시지만 로그에 남길 수 있도록 한다.
  - error로 설정하면 warning 또는 notice 메세지는 기록되지 않는반면, error / log / fatal / panic 로그는 남긴다.
- `log_lock_waits`
  - 권장: `1`
  - session lock 상태에서 deadlock_timeout(기본값 1초)보다 오래 대기하는 경우 로그를 기록
  - 해당 로그 발생시 blocking 혹은 blocked session 을 중지 해야한다
- `log_statement`
  - `ddl`
- `log_min_duration_statement`
  - 권장: `100` 혹은 `1000`
  - 지정된 시간 (ms) 이상의 시간이 소요된 쿼리들을 로깅한다.
  - slow query에 대해 정의하는 기준이 된다.
- `log_autovacuum_min_duration`
  - 권장: `1000`
  - 지정된 시간(ms) 이상 실행되는 autovacuum 및 autoanalyze 을 로깅한다.
- `rds.force_autovacuum_logging_level`
  - 권장: `log`
  - `log_autovacuum_min_duration` 이 설정한 값에 따라 실행되는 autovacuum 및 autoanalyze 의 로깅 레벨을 설정한다.
  - 해당 로그를 통해 어떤 테이블에 vacuumed 되었는지 알 수 있다.
- `shared_preload_libraries`
  - 권장: `auto_explain`
  - 실행 계획을 자동으로 로깅할 수 있다. 
  - `auto_explain` 이면 자동으로 로깅 된다.
- `auto_explain.log_min_duration`
  - `1000`
  - Query 실행 시간이 지정된 시간(ms) 이상이면 실행 계획을 로깅한다.

## 주의할 점

- `log_statement`를 `all` 혹은 `mod`로 설정하면 **DML 쿼리들의 duration이 출력되지 않는다**


임계값(밀리초 단위)을 설정하려면 log_min_duration_statement를 수정합니다. 그러면 설정된 파라미터 값보다 더 오래 걸리는 모든 쿼리를 로깅할 수 있습니다. 예를 들어, log_min_duration_statement 값을 500으로 설정하면 Amazon RDS는 쿼리 유형에 상관없이 완료 시간이 0.5초보다 긴 모든 쿼리를 로깅합니다. 마찬가지로 이 파라미터를 2000으로 설정하면, Amazon RDS는 완료 시간이 2초보다 긴 모든 쿼리를 로깅합니다. 파라미터 값을 -1로 설정하면 파라미터가 비활성화되고 Amazon RDS는 완료 시간을 기준으로 쿼리를 로깅하지 않습니다. 파라미터 값을 0으로 설정하면 Amazon RDS가 모든 쿼리를 로깅합니다.
참고: log_min_duration_statement 파라미터는 log_statement 파라미터에 종속되거나 이를 간섭하지 않습니다.

로깅되는 SQL 문을 제어하려면 log_statement를 수정합니다. 기본값은 none이며, 이 파라미터의 값은 다음과 같이 수정할 수 있습니다.

ddl은 모든 DDL(데이터 정의 언어) 문(예: CREATE, ALTER 및 DROP)을 로깅합니다.
mod는 모든 DDL 및 DML(데이터 수정 언어) 문(예: INSERT, UPDATE 및 DELETE)을 로깅합니다.
all은 실행 시간에 상관없이 모든 쿼리를 로깅합니다.

> log_statement 및 log_min_duration_statement에서 설정한 값에 상관없이 쿼리는 로그에 두 번 기록되지 않습니다.

- log_statement를 입력하고 값을 ddl로 변경합니다.
- log_min_duration_statement를 입력하고 값을 1000으로 변경
- 1초 넘게 걸리는 모든 쿼리와 모든 DDL 명령문

https://aws.amazon.com/ko/premiumsupport/knowledge-center/rds-postgresql-query-logging/