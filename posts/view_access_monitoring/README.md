# PostgreSQL 에서 모든 View Table의 접근 모니터링 하기 (레거시 리팩토링)

View Table을 적극적으로 사용하는 시스템에서 View Table의 의존성을 줄이고, 모든 Database의 진입점을 영속성 프레임워크로 옮겨 **액세스 캡슐화**가 필요할때가 있다.

보통 특정 데이터에 대한 접근이 있을때마다 액션을 넣을때 가장 흔하게 사용되는 것이 Trigger이다.
하지만 아쉽게도 PostgreSQL에서는 View Table에서 Select 쿼리에 대한 Trigger가 적용되진 않는다.

그래서 다른 방법을 고려해야 한다.

```sql
WITH views AS (
    SELECT viewname FROM pg_views WHERE schemaname = 'public' -- 'public' 스키마에 있는 뷰만 대상으로 함
)

SELECT
    pg_stat_statements.*
FROM
    pg_stat_statements,
    views
WHERE
    query LIKE '%' || views.viewname || '%'
ORDER BY
    total_time DESC;
```
