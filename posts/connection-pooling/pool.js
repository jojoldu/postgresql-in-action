const { Pool } = require("pg");

const pool = new Pool({
  user: "사용자명",
  host: "127.0.0.1",
  database: "test",
  password: "test",
  port: 5432,
  max: 100,
});

const timeName = 'pg';

console.time(timeName);

Array(100).map(async (_, i) => {
  await pool.connect();
  await pool.end();
});

console.timeEnd(timeName);


