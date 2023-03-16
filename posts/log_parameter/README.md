# PostgreSQL Log Parameter 설정

로깅하려는 쿼리에 따라 log_statement 또는 log_min_duration_statement를 활성화할 수 있습니다. 

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