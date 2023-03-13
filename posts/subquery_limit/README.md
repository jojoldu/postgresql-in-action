# Left Join 쿼리 SubQuery 로 개선하기

```sql
SELECT u.*, 
gu.uuid,      
gu.name,     
gu.group_id,  
g.name,       
gu.department,
FROM users u
         LEFT JOIN groups_users gu ON gu.user_id = u.id AND gu.user_id IS NOT NULL AND gu.deleted_at IS NULL
         LEFT JOIN groups g ON g.id = gu.group_id AND g.deleted_at IS NULL
WHERE u.deleted_at IS NULL
  AND u.status = 'validated'
  AND u.allowed_marketing = TRUE
  AND u.id > 871312
ORDER BY u.id
LIMIT 2000;
```

```sql
SELECT limit_users.*, 
gu.uuid,      
gu.name,     
gu.group_id,  
g.name,       
gu.department,
from (select *
      from users u
      WHERE u.deleted_at IS NULL
        AND u.status = 'validated'
        AND u.allowed_marketing = TRUE
        AND u.id > 871312
      ORDER BY u.id
      LIMIT 2000) limit_users
         LEFT JOIN groups_users gu
                   ON gu.user_id = limit_users.id
                       AND gu.user_id IS NOT NULL
                       AND gu.deleted_at IS NULL
         LEFT JOIN groups g
                   ON g.id = gu.group_id
                       AND g.deleted_at IS NULL;
```