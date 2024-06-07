# GREATEST Order by 성능개선

```sql
SELECT mentors.id, mentors.title, mentors.duration, mentors.price, mentors.company_name, mentors.expose_company, mentors.job_group, mentors.job, mentors.job_level, mentors.user_id 
FROM mentors AS mentors 
WHERE ( is_active = ? AND ( ( title ilike ? ) OR ( ( company_name ilike ? ) AND expose_company = ? ) OR ( user_id in ( 
    select id 
    from users 
    where ( name ilike ? ) 
) ) ) AND user_id IN ( 
    SELECT u.id 
    FROM users u 
        INNER JOIN mentors m on u.id = m.user_id 
    WHERE u.deleted_at IS ? AND u.inactive_at IS ? 
) ) 
ORDER BY GREATEST ( mentors.created_at, ( 
    SELECT created_at 
    FROM mentorings 
    WHERE mentor_id = mentors.id AND status = ? 
    ORDER BY created_at DESC 
    LIMIT ? 
) ) DESC 
LIMIT ? OFFSET ?
```


- 서브쿼리의 중첩 사용
  - `(user_id in ( select id from users where ( name ilike ? ) ))` 와 같이 서브쿼리가 중첩
  - `user_id IN (SELECT u.id FROM users u INNER JOIN mentors m on u.id = m.user_id WHERE u.deleted_at IS ? AND u.inactive_at IS ? )` 
  - `GREATEST` 함수 안에 서브쿼리를 사용
- 비효율적인 정렬 및 제한
  - `ORDER BY GREATEST (mentors.created_at, ( SELECT created_at FROM mentorings WHERE mentor_id = mentors.id AND status = ? ORDER BY created_at DESC LIMIT ? ) ) DESC` 

```sql
SELECT mentors.id, mentors.title, mentors.duration, mentors.price, mentors.company_name, mentors.expose_company, mentors.job_group, mentors.job, mentors.job_level, mentors.user_id 
FROM mentors 
INNER JOIN users ON users.id = mentors.user_id 
LEFT JOIN LATERAL (
    SELECT created_at 
    FROM mentorings 
    WHERE mentorings.mentor_id = mentors.id AND mentorings.status = ?
    ORDER BY created_at DESC 
    LIMIT 1
) AS latest_mentoring ON true 
WHERE 
    mentors.is_active = ? 
    AND ( mentors.title ILIKE ? 
        OR ( mentors.company_name ILIKE ? AND mentors.expose_company = ? ) 
        OR users.name ILIKE ? 
    ) 
    AND users.deleted_at IS NULL 
    AND users.inactive_at IS NULL 
ORDER BY GREATEST(mentors.created_at, COALESCE(latest_mentoring.created_at, '1970-01-01')) DESC 
LIMIT ? OFFSET ?;
```

- JOIN 사용
  - INNER JOIN과 LEFT JOIN LATERAL을 사용하여 서브쿼리를 제거하고 JOIN으로 대체
  - LATERAL JOIN을 사용하여 최신 mentoring을 선택
- 서브쿼리 제거
  - IN 서브쿼리를 JOIN으로 대체
- 정렬 최적화
  - GREATEST 함수의 인자를 COALESCE를 사용하여 NULL 처리

문제점: GREATEST 함수 내부에 서브쿼리를 사용하는 경우, 각 행에 대해 서브쿼리가 반복 실행될 수 있다.  
이는 불필요한 부하를 유발
해결책: LATERAL JOIN을 사용하여 서브쿼리를 한 번만 실행하고 결과를 사용 
이렇게 하면 필요한 데이터만 가져오고 불필요한 반복을 피할 수 있음


```sql

```