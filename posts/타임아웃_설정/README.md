# PostgreSQL에서 타임아웃 설정하기

보통은 Application Driver 에서 statement timeout을 설정해서 쿼리를 종료시킬 수 있지만, 간혹 애플리케이션에서 실행을 종료했지만 실제 데이터베이스에서는 여전히 좀비프로세스처럼 쿼리가 남아있을때가 있다.
이럴때를 위해 데이터베이스에서도 

PostgreSQL에서 statement_timeout과 idle_in_transaction_session_timeout는 모두 세션 타임아웃 설정이며, 각각 다른 용도로 사용된다.

statement_timeout: SQL 쿼리의 실행 시간을 초과하면 해당 세션을 종료한다. 이 설정은 각 SQL 쿼리에 대해 개별적으로 적용되며, SET statement_timeout = <timeout_in_ms>와 같은 형식으로 설정할 수 있다.

idle_in_transaction_session_timeout: 트랜잭션이 시작된 후, 지정된 시간이 지나면 해당 세션을 종료한다. 이 설정은 트랜잭션이 블로킹되거나 잠겨있을 때 유용한다. 일반적으로 이 설정은 긴 시간 동안 활성화되지 않은 트랜잭션을 종료하고 세션 리소스를 반환하는 데 사용된다. SET idle_in_transaction_session_timeout = <timeout_in_ms>와 같은 형식으로 설정할 수 있다.

즉, statement_timeout은 특정 SQL 쿼리의 실행 시간을 제한하고, idle_in_transaction_session_timeout은 트랜잭션이 종료되지 않고 일정 시간이 지나면 해당 세션을 종료한다. 이러한 설정은 시스템에 대한 부하를 줄이거나, 세션 리소스를 효율적으로 관리하고자 할 때 유용하다.

## 쿼리 타임아웃

```sql
statement_timeout
```

## 트랜잭션 타임아웃

```sql
idle_in_transaction_session_timeout
```

유휴 트랜잭션 상태의 연결은 다른 쿼리 또는 트랜잭션을 차단하는 잠금을 보유할 수 있다.  
또한 이 상태에서는 자동 진공을 포함한 VACUUM이 다음과 같은 작업을 수행하지 못할 수 있다:

- Cleaning up dead rows 
  - 이로 인해 인덱스 또는 테이블 크기가 증가할 수 있다.
- Freezing rows 
  - 이로 인해 트랜잭션 ID가 래핑될 수 있다.


```sql
FATAL: terminating connection due to idle in transaction timeout
```