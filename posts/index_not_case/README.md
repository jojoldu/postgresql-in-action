# PostgreSQL 에서 인덱스 못타는 경우

PostgreSQL은 기본적으로 인덱스를 B-Tree 구조로 만듭니다.  


## Like에서 검색어 앞에 %를 쓸 경우

## 컬럼을 Casting 할 경우

## 부정형을 사용할 경우

부정형 (`<>`, `!=`, `not in`)은 인덱스를 사용할 수 없다.
