# AWS Aurora PostgreSQL 인스턴스 최적화 설정하기

AWS Aurora PostgreSQL 환경에서 여러 파라미터 그룹을 설정할때 참고하기 위해 내용들을 정리한다.  
가능한 상세하게 작성하기 위해 특정 인스턴스 사양 (`db.r6i.2xlarge`) 을 기준으로 작성되었다.

## 0. 인스턴스 스펙

`db.r6i.2xlarge` 의 인스턴스는 다음과 같은 스펙을 가지고 있다.

- vCPU: 8
- 메모리: 64 GB

이를 기준으로 설정한다.

## 1. 병렬 처리 설정

```sql
SET max_parallel_workers_per_gather = 4;  -- vCPU 수의 절반
SET max_parallel_workers = 8;  -- vCPU 수와 동일
```

- `max_parallel_workers`
  - 전체 시스템에서 동시에 활성화될 수 있는 최대 병렬 작업자 수를 지정한다.
  - 일반적인 계산 방식: **vCPU 수의 50% ~ 100%**
  - 예: 8 vCPU 시스템의 경우 4 ~ 8 사이의 값

- `max_parallel_workers_per_gather`
  - 단일 쿼리에서 사용할 수 있는 최대 병렬 작업자 수를 지정한다.
  - 데이터베이스 재시작이 필요 없다.
  - 일반적으로 0(병렬 쿼리 비활성화)부터 인스턴스의 vCPU 수까지 설정할 수 있다.
  - 일반적인 계산 방식: **vCPU 수의 25% ~ 50%**
  - 예: 8 vCPU 시스템의 경우 2 ~ 4 사이의 값


## 2. 메모리 관련 설정

```sql
SET work_mem = '16MB' or `32MB`;  -- 총 메모리의 약 4%
SET shared_buffers = '16GB';  -- 총 메모리의 약 25%
SET effective_cache_size = '48GB';  -- 총 메모리의 약 75%
SET maintenance_work_mem = '2GB';
SET wal_buffers = '16MB';
```


### 1. work_mem

work_mem은 정렬 작업이나 해시 테이블과 같은 복잡한 쿼리 작업에 사용되는 메모리 양을 지정한다.  


`work_mem` 파라미터는 내부 정렬 작업과 해시 테이블이 임시 디스크 파일로 넘어가기 전에 사용할 메모리 양을 정한다.  
이는 쿼리 단위가 아닌 정렬 및 해시 작업의 수에 따라 설정된다.

워크로드 특성에 따라 `work_mem` 설정을 조정해야 한다.  
간단한 조인과 최소한의 정렬 작업이 포함된 단기 실행 쿼리가 많은 경우엔 낮게 설정하는 것이 좋다.  
반면, 복잡한 조인 및 정렬이 포함된 활성 쿼리가 소수 있는 경우엔 높은 값으로 설정하는 것이 유리하다.

`work_mem`의 최적값을 찾는 것은 쉽지 않다.  
높은 메모리 사용률이나 메모리 부족 문제가 발생하면 `work_mem` 값을 줄이는 것을 고려해야 한다.  
  
`work_mem`의 **기본값은 4MB**다.  

[MS Azure 가이드](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-high-memory-utilization#work_mem) 에서는 `work_mem` 의 수치에 대해 아래 공식의 결과를 권장한다.

- `work_mem = 전체 RAM / max_connections / 16`

예를 들어

- RAM이 64GB 
- `max_connections` 가 300개
- 이럴 경우 `work_mem` 은 **13.6mb**가 적절할 수 있다.

[Tembo에서는 다음과 같은 공식](https://tembo.io/blog/optimizing-memory-usage#working-memory) 을 권장한다.  

- `(총 RAM의 80% - shared_buffers 메모리) / (max_connections) / 쿼리 평균 node 수`  

예를 들어
- RAM이 64GB 
- `shared_buffers` 가 4GB, 
- `max_connections` 가 300개
- 이럴 경우 **세션당 약 204mb**를 사용할 수 있다.  
- 쿼리들의 평균 node가 4라면 `work_mem` 은 **51mb**가 적절할 수 있다.


효과적인 `work_mem` 설정 전략은 사용량이 많은 시간대의 메모리 사용량을 모니터링하는 것이다.  
이 시간 동안 디스크 정렬이 발생하고 동시에 사용되지 않은 메모리가 많다면, 사용 가능한 메모리와 사용된 메모리 사이의 균형이 맞을 때까지 `work_mem`을 점진적으로 늘린다.  
반대로 메모리 사용량이 과도해 보이면 `work_mem` 값을 줄인다.  

work_mem이 너무 작은것은 아닌지 확인할 수 있는 방법은 다음과 같다.

```sql
SELECT datname, pg_size_pretty(temp_bytes / temp_files) AS overflow
  FROM pg_stat_database
 WHERE temp_files > 0;
```


### 2. shared_buffers
shared_buffers는 PostgreSQL이 데이터 캐싱에 사용하는 메모리 양을 지정한다.

설정값: '16GB'
총 메모리의 약 25%

이 값을 늘리면 디스크 I/O를 줄일 수 있어 성능이 향상될 수 있다.
그러나 너무 크게 설정하면 운영체제의 파일 시스템 캐시에 사용할 수 있는 메모리가 줄어들 수 있다.

### 3. effective_cache_size
effective_cache_size는 단일 쿼리에 사용할 수 있는 메모리의 양에 대한 플래너의 가정을 설정한다.

설정값: '48GB'
총 메모리의 약 75%


### 4. maintenance_work_mem
maintenance_work_mem은 VACUUM, CREATE INDEX, ALTER TABLE ADD FOREIGN KEY 등의 유지보수 작업에 사용되는 메모리 양을 지정한다.

설정값: '2GB'

이 값을 늘리면 대규모 유지보수 작업의 성능이 향상될 수 있다.
그러나 너무 크게 설정하면 메모리 부족 문제가 발생할 수 있으므로 주의가 필요하다.

예를 들어, autovacuum workers 가 동시에 실행되는 상황을 생각해보자. maintenance_work_mem이 1GB로 설정된 경우, 이 세 세션은 총 3GB의 메모리를 사용하게 된다.
높은 maintenance_work_mem 값과 함께 여러 세션에서 VACUUM, CREATE INDEX, ALTER TABLE ADD FOREIGN KEY 등을 동시에 실행하면 전체 메모리 사용률이 크게 증가할 수 있다.  
이런 이유로 파라미터의 최대값을 2GB로 제한하는 것이 좋다


### 5. wal_buffers
wal_buffers는 Write-Ahead Logging(WAL)에 사용되는 공유 메모리의 양을 지정한다.

설정값: '16MB'

이 값은 일반적으로 큰 영향을 미치지 않지만, 트랜잭션이 많은 워크로드에서는 약간의 성능 향상을 가져올 수 있다.
16MB 정도면 대부분의 시스템에 충분하다.

## 연결 및 Autovacuum 설정

- `max_connections`: Aurora 에서 인스턴스 스펙에 맞게 자동으로 설정을 해준다.
  - 다만, 그 이상으로 connections을 사용하고 싶다면 설정한다.
 
```sql
SET max_connections = 200;  -- 워크로드에 따라 조정
SET autovacuum_max_workers = 3;
SET autovacuum_naptime = '1min';
```

## 성능 최적화 설정

```sql
SET temp_file_limit = '5GB';
```