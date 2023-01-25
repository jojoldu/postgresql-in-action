# PostgreSQL (Aurora) 13 vs 14 Nested Loop Join 성능 비교


![aurora-versions](./images/aurora-versions.png)


> Amazon Aurora (RDS) 에서 파라미터가 Boolean이면 1 (ON) or 0 (OFF) 으로 설정한다.


## enable_memoize

```sql
SELECT current_setting('enable_memoize');
```

![console](./images/console.png)


## 실험

```sql
CREATE TABLE team AS
SELECT team_no, team_no % 5 AS department_no
FROM generate_series(1, 100000) AS team_no;

CREATE TABLE users AS
SELECT user_no, user_no % 20000 as department_no
FROM generate_series(1, 100000) AS user_no;

CREATE INDEX idx_user_department_no ON users (department_no);
```


```sql
EXPLAIN analyze
SELECT *
FROM team JOIN users ON team.department_no = users.department_no;
```

### 성능 테스트

