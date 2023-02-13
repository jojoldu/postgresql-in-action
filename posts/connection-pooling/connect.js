const { Client } = require("pg");

const client = new Client({
  user: "사용자명",
  host: "127.0.0.1",
  database: "test",
  password: "test",
  port: 5432,
});

const timeName = 'client';

console.time(timeName);

Array(100).map(async (_, i) => {
  await client.connect();
  await client.end();
});

console.timeEnd(timeName);


