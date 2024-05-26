# With로 성능 개선하기

```sql
SELECT i.id, i.titles[?] AS title, i.icon_url 
FROM institutions i 
    INNER JOIN interested_corporations ic ON i.id = ic.institution_id 
    INNER JOIN vouchers v ON v.user_id = ic.user_id 
WHERE i.priority > ? AND i.id != ? AND i.type = ? AND ic.deleted_at IS ? AND v.course_id = ? AND v.deleted_at IS ? 
GROUP BY i.id;
```

```sql
WITH filtered_institutions AS (
    SELECT id, titles, icon_url
    FROM institutions
    WHERE priority > ? 
      AND id != ? 
      AND type = ?
),
filtered_interested_corporations AS (
    SELECT institution_id, user_id
    FROM interested_corporations
    WHERE deleted_at IS ?
),
filtered_vouchers AS (
    SELECT user_id
    FROM vouchers
    WHERE course_id = ? AND deleted_at IS ?
)
SELECT fi.id, fi.titles[?] AS title, fi.icon_url
FROM filtered_institutions fi
JOIN filtered_interested_corporations fic ON fi.id = fic.institution_id
JOIN filtered_vouchers fv ON fv.user_id = fic.user_id
GROUP BY fi.id;

```

WITH 구문을 사용하여 쿼리를 개선할 수 있는 이유는 여러 가지가 있다.  
WITH 구문은 공통 테이블 표현식(CTE, Common Table Expression)을 정의하는 데 사용되며, 복잡한 쿼리를 단순화하고 최적화할 수 있는 방법을 제공한다.

이유 1: 쿼리 분할
WITH 구문을 사용하면 복잡한 쿼리를 여러 단계로 나눌 수 있다. 각 단계는 별도의 CTE로 정의되며, PostgreSQL은 각 CTE를 독립적으로 최적화할 수 있다.  
이를 통해 쿼리의 가독성이 향상되고, 각 부분을 최적화하는 데 도움이 된다.

이유 2: 재사용 가능성
CTE는 쿼리 내에서 여러 번 재사용될 수 있다. 동일한 계산이나 데이터 필터링을 여러 번 수행해야 하는 경우, 이를 CTE로 정의하면 쿼리가 단순화되고 중복된 계산을 피할 수 있다.

이유 3: 조인 순서 제어
CTE를 사용하면 조인의 순서를 명시적으로 제어할 수 있다. 이를 통해 더 나은 실행 계획을 유도할 수 있으며, 특정 조인 순서가 성능에 미치는 영향을 줄일 수 있다.

이유 4: 쿼리 계획 단순화
CTE를 사용하면 각 단계의 결과를 독립적으로 최적화할 수 있기 때문에, PostgreSQL이 더 효율적인 실행 계획을 수립할 수 있다.  
예를 들어, filtered_institutions, filtered_interested_corporations, filtered_vouchers 각각에 대한 조건을 미리 필터링하여 데이터의 양을 줄인 후 조인하게 된다.  
이는 전체 쿼리 성능을 크게 향상시킬 수 있다.

이유 5: 인덱스 활용 증가
각 CTE는 독립적으로 인덱스를 사용할 수 있으며, 데이터 양이 줄어들기 때문에 인덱스의 효율성이 높아질 수 있다.  
또한, 쿼리 계획이 단순해지면서 PostgreSQL이 더 나은 인덱스를 선택할 가능성이 커진다.