# [PostgreSQL] Merge Join 발생시 Scan 범위 좁히기

scan 의 범위를 좁힌 조건을 추가하지 않으면 병렬 조인의 경우 전체 테이블을 스캔하게 된다.