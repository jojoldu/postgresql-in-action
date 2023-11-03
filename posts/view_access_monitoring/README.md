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
    calls DESC;
```

```sql
CREATE OR REPLACE VIEW old_name AS
    WITH qry AS MATERIALIZED (SELECT view_access_log('old_name') AS logged)
  SELECT vw.* FROM vw_new_name vw, qry WHERE qry.logged > 0;
```

```sql
CREATE SEQUENCE seq_view_consumer;
CREATE OR REPLACE FUNCTION view_access_log(text) 
RETURNS int
LANGUAGE PLPGSQL AS
$$
BEGIN
 RETURN nextval('seq_view_consumer');
END
$$;
```

```sql
CREATE TABLE view_access_log
(
    id bigint GENERATED ALWAYS AS IDENTITY,
    accessed_at      timestamp WITH TIME ZONE DEFAULT NOW(),
    view_name   varchar(255),
    call_stack  text
);
```

```sql
CREATE FUNCTION touch_view(view_str text) RETURNS integer
    LANGUAGE plpgsql
AS
$$
DECLARE
    s_stack text;
BEGIN
    -- GET CURRENT DIAGNOSTICS s_stack = PG_CONTEXT;  /* Uncomment this to log the call stack.  Too intense originally! */
 
    INSERT INTO public.view_access_log (view_name, call_stack) VALUES(view_str, s_stack);
    RETURN 1;
END
$$;
```


## 첫 번째 쿼리: 뷰 생성

```sql
CREATE OR REPLACE VIEW old_name AS
WITH qry AS MATERIALIZED (SELECT view_access_log('old_name') AS logged)
SELECT vw.* FROM vw_new_name vw, qry WHERE qry.logged > 0;
```

이 명령문은 old_name이라는 이름의 뷰를 생성하거나 기존에 존재하는 경우 대체합니다. 이 뷰는 공통 테이블 표현식 (CTE)을 사용합니다. CTE의 이름은 qry이며, 이것은 view_access_log 함수를 호출한 결과를 저장하는 데 사용되는데, MATERIALIZED 키워드가 붙어 있어 쿼리 실행 중에 물리적으로 임시 저장됩니다.

view_access_log 함수는 'old_name' 문자열을 인자로 받아 호출됩니다. 함수의 반환 값은 logged라는 이름의 칼럼에 저장됩니다.

뷰 old_name은 vw_new_name (아마도 다른 뷰 또는 테이블일 것입니다)의 모든 컬럼을 선택하여 결과 집합을 구성합니다. 이때, qry의 logged 값이 0보다 클 때만 해당하는 vw_new_name의 행들을 결과에 포함시킵니다.

## 두 번째 쿼리: 시퀀스와 함수 생성

```sql
CREATE SEQUENCE seq_view_consumer;
CREATE OR REPLACE FUNCTION view_access_log(text)
RETURNS int
LANGUAGE PLPGSQL AS
$$
BEGIN
RETURN nextval('seq_view_consumer');
END
$$;
```
먼저 seq_view_consumer라는 이름의 시퀀스를 생성합니다. 시퀀스는 데이터베이스 내에서 순차적으로 증가하는 숫자를 생성하기 위해 사용됩니다.

그 다음에는 view_access_log라는 이름의 함수를 생성하거나 기존에 존재하는 경우 대체합니다. 이 함수는 하나의 텍스트 파라미터를 받고, 정수를 반환합니다. 함수 본문은 PL/pgSQL 언어로 작성되어 있으며, nextval 함수를 호출하여 seq_view_consumer 시퀀스의 다음 값을 반환합니다.

## 상호 작용
첫 번째 쿼리에서 정의된 old_name 뷰는 view_access_log 함수를 호출합니다. 두 번째 쿼리에서 정의된 view_access_log 함수는 seq_view_consumer 시퀀스의 다음 값을 반환하므로, 매번 이 함수가 호출될 때마다 고유한 증가하는 정수를 반환합니다.

결과적으로, old_name 뷰는 vw_new_name에서 행을 선택할 때마다 view_access_log 함수를 통해 시퀀스에서 새 값을 받습니다. 만약 이 값이 0보다 크면 (시퀀스는 일반적으로 1에서 시작하므로 항상 0보다 클 것입니다), 해당 vw_new_name의 행들은 old_name 뷰에 포함됩니다.

이 로직을 사용함으로써, old_name 뷰에 접근할 때마다 '접근 로그'가 남는 것처럼 동작하게 만들 수 있습니다. 단, 실제 '로그'가 남지는 않으며, 이 시퀀스 값은 단지 뷰를 통해 데이터가 요청될 때마다 증가할 뿐입니다.
