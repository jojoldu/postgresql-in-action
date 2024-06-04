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