# AWS Aurora PostgreSQL 인스턴스 최적화 설정하기

AWS Aurora PostgreSQL `db.r6i.2xlarge` 인스턴스를 사용할 때 성능을 최적화하기 위한 설정을 

## 인스턴스 스펙

`db.r6i.2xlarge` 의 인스턴스는 다음과 같은 스펙을 가지고 있다.

- vCPU: 8
- 메모리: 64 GiB

이를 기준으로 설정한다.

## 주요 파라미터 설정

### 병렬 처리 설정

```sql
SET max_parallel_workers_per_gather = 4;  -- vCPU 수의 절반
SET max_parallel_workers = 8;  -- vCPU 수와 동일
```

### 메모리 관련 설정

```sql
SET work_mem = '256MB';  -- 총 메모리의 약 4%
SET shared_buffers = '16GB';  -- 총 메모리의 약 25%
SET effective_cache_size = '48GB';  -- 총 메모리의 약 75%
SET maintenance_work_mem = '2GB';
SET wal_buffers = '16MB';
```


#### 1. work_mem
work_mem은 정렬 작업이나 해시 테이블과 같은 복잡한 쿼리 작업에 사용되는 메모리 양을 지정한다.

설정값: '256MB'
총 메모리의 약 4%

이 값은 각 쿼리 실행 계획의 노드마다 할당될 수 있으므로, 너무 높게 설정하면 전체 메모리 사용량이 급증할 수 있다.
동시 실행되는 쿼리 수를 고려하여 설정해야 한다.

#### 2. shared_buffers
shared_buffers는 PostgreSQL이 데이터 캐싱에 사용하는 메모리 양을 지정한다.

설정값: '16GB'
총 메모리의 약 25%

이 값을 늘리면 디스크 I/O를 줄일 수 있어 성능이 향상될 수 있다.
그러나 너무 크게 설정하면 운영체제의 파일 시스템 캐시에 사용할 수 있는 메모리가 줄어들 수 있다.

#### 3. effective_cache_size
effective_cache_size는 단일 쿼리에 사용할 수 있는 메모리의 양에 대한 플래너의 가정을 설정한다.

설정값: '48GB'
총 메모리의 약 75%


#### 4. maintenance_work_mem
maintenance_work_mem은 VACUUM, CREATE INDEX, ALTER TABLE ADD FOREIGN KEY 등의 유지보수 작업에 사용되는 메모리 양을 지정한다.

설정값: '2GB'

이 값을 늘리면 대규모 유지보수 작업의 성능이 향상될 수 있다.
그러나 너무 크게 설정하면 메모리 부족 문제가 발생할 수 있으므로 주의가 필요하다.

#### 5. wal_buffers
wal_buffers는 Write-Ahead Logging(WAL)에 사용되는 공유 메모리의 양을 지정한다.

설정값: '16MB'

이 값은 일반적으로 큰 영향을 미치지 않지만, 트랜잭션이 많은 워크로드에서는 약간의 성능 향상을 가져올 수 있다.
16MB 정도면 대부분의 시스템에 충분하다.

### 연결 및 Autovacuum 설정

- `max_connections`: Aurora 에서 인스턴스 스펙에 맞게 자동으로 설정을 해준다.
  - 다만, 그 이상으로 connections을 사용하고 싶다면 설정한다.
 
```sql
SET max_connections = 200;  -- 워크로드에 따라 조정
SET autovacuum_max_workers = 3;
SET autovacuum_naptime = '1min';
```

### 성능 최적화 설정

```sql
SET temp_file_limit = '5GB';
```