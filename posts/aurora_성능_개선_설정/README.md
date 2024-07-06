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