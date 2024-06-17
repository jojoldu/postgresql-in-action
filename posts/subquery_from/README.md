# From 절의 SubQuery로 성능 개선하기


이 쿼리는 아주 간단한 수정만으로도 성능이 2배이상 개선 할 수 있다.

## 문제


```sql
explain analyze
select "p0"."id",
       "p0"."status",
       "p0"."title",
       "p0"."body",
       "p0"."cmt_cnt",
       "p0"."recommended_cnt",
       "p0"."is_spam",
       "p0"."bookmark_cnt",
       "p0"."deleted_at",
       "p0"."user_id",
       "p0"."course_id",
       "p0"."unit_id",
       "u1"."id"       as "u1__id",
       "c2"."id"       as "c2__id",
       "u3"."id"       as "u3__id",
       "u3"."name"     as "u3__name",
       "u3"."is_admin" as "u3__is_admin"
from "posts" as "p0"
         left join "units" as "u1" on "p0"."unit_id" = "u1"."id"
         left join "courses" as "c2" on "p0"."course_id" = "c2"."id"
         left join "users" as "u3" on "p0"."user_id" = "u3"."id"
where "p0"."type" = 'question'
  and ("p0"."deleted_at" is null or "p0"."cmt_cnt" > 0)
  and "p0"."is_spam" = false
order by "p0"."id" desc
limit 20 offset 33920;
```

이 쿼리의 실행 결과는 다음과 같다.

```
Execution Time: 416.560 ms
```

이 쿼리의 문제는 크게 2가지이다.

*   PK로 인한 Order by 선 수행
    
*   Where로 걸러지기 전 여러 테이블과의 Join
    

## 해결 

여기서 한번 더 성능 개선이 가능한데,  
**현재 쿼리는 조건식에서는 Join이 불필요**하다.

**SELECT문을 위한 Join이기 때문에 조회 조건으로 걸러낸 20개 기준으로 Join이 되도록** 개선하면 성능 개선이 가능하다.

```
explain analyze
select p0.*,
       "u1"."id"       as "u1__id",
       "c2"."id"       as "c2__id",
       "u3"."id"       as "u3__id",
       "u3"."name"     as "u3__name",
       "u3"."is_admin" as "u3__is_admin"
from (select "p0"."id",
             "p0"."status",
             "p0"."title",
             "p0"."body",
             "p0"."cmt_cnt",
             "p0"."recommended_cnt",
             "p0"."is_spam",
             "p0"."bookmark_cnt",
             "p0"."deleted_at",
             "p0"."user_id",
             "p0"."course_id",
             "p0"."unit_id"
      from "posts" as "p0"
      where "p0"."type" = 'question'
        and ("p0"."deleted_at" is null or "p0"."cmt_cnt" > 0)
        and "p0"."is_spam" = false
      order by "p0"."id" + 0 desc
      limit 20 offset 33920) as p0
         left join "units" as "u1" on "p0"."unit_id" = "u1"."id"
         left join "courses" as "c2" on "p0"."course_id" = "c2"."id"
         left join "users" as "u3" on "p0"."user_id" = "u3"."id";
```

Native 로 Join을 맺지 않고,

서브쿼리 (`from (~~) as p0`) 로 먼저 20개만 걸러낸뒤, 이 20개만으로 나머지 테이블들을 Join 맺도록 했다.

이에 대한 결과는

```
Execution Time: 151.693 ms
```

416ms → 151 ms로 **대략 170% 성능 개선**이 되었다.

## ORM


만약 특정 ORM에서 `from` 의 서브쿼리가 어렵다면 (ex-JPA) 이때는 서브쿼리가 아니라

**서브쿼리를 선 수행후 나온 결과물 (id 20개)를 where in 으로 하여 쿼리를 나눠서 수행**하면 된다.
