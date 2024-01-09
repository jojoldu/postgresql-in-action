# PostgreSQL 에서 Tag 기능 구현하기

케이스1

```SQL
table doc_tags_text (
    doc_id int not null references documents(doc_id),
    tag text not null
)
unique index doc_tags_text_doc_id_tag on (doc_id, tag)
index doc_tags_text_tag on (tag)
```

케이스2
```SQL
table tags (
    tag_id serial not null primary key,
    tag text not null unique
)

table doc_tags_id (
    doc_id int not null references documents(doc_id),
    tag_id int not null references tags(tag_id)
)
unique index doc_tags_id_doc_id_tag_id on (doc_id, tag_id)
index doc_tags_id_tag_id on (tag_id)
```

케이스3

```SQL
table doc_tags_json (
    doc_id int not null references documents(doc_id),
    tags jsonb
)
unique index doc_tags_id_doc_id on (doc_id)
index doc_tags_id_tags using gin (tags)

table doc_tags_array (
    doc_id int not null references documents(doc_id),
    tags text[] not null default '{}'
)
unique index doc_tags_id_doc_id on (doc_id)
index doc_tags_id_tags using gin (tags)
```