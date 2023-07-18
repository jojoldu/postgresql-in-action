# PostgreSQL Online DDL

Aurora MySQL 5.7까지만 써본 경험에서 Online DDL 은 여전히 부담스럽다.  
그럼에도 수억건의 테이블에 DDL을 수행하는 것은 언제나 서비스 운영시에 필요한 사항이다.


데이터가 많은 만큼 시간소요 예측도 힘들고 만약 작업이 실패하는 경우 rollback 작업에 따른 위험도도 크기 때문입니다.

> 백업데이터로 테스트를 진행하지만 막상 라이브 환경에서는 시간소요가 더 오래 걸리는 경우도 많음

Aurora PostgreSQL에서는 약 200G 테이블에 인덱스, 컬럼 추가를 해본 결과 100G만 넘어도 인덱스 생성에 1시간이 넘는 Aurora MySQL과는 다르게 40여 분 만에 인덱스가 생성되었습니다! 컬럼 추가는 바로 되네요

PostgreSQL의 online ddl 컬럼 추가는 meta data를 저장하는 시스템 카탈로그에 추가된 정보만 반영하기 때문에 아주 빠른 작업이 가능합니다.


Craig Ringer가 언급 했듯이 PostgreSQL은 오래 전부터 잠금 없이 일부 ALTER 작업을 지원하기 시작했습니다.

그러나 버전 11 ALTER TABLE ... ADD COLUMN ... DEFAULT ... NOT NULL 에서는 테이블 재작성(및 긴 잠금)도 방지하므로 마이그레이션에 안전하게 사용할 수 있습니다.

이 기사에서 이에 대한 자세한 내용을 읽을 수 있습니다. 기본값으로 빠른 열 생성

## 참고

- https://tool.lu/en_US/article/3j3/preview
- https://brandur.org/postgres-default