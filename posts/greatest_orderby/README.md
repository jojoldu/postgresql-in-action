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