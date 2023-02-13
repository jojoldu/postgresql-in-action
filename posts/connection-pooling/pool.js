const { Pool } = require("pg");

const pool = new Pool({
  user: "test",
  host: "localhost",
  database: "test",
  password: "test",
  port: 5432,
  max: 100,
});

const timeName = 'pg';

console.time(timeName);

Promise.all(Array(100).fill(0).map(async (_, i) => {
  await pool.connect();
  await pool.query('SELECT NOW()');
  await pool.end();
})).then(() => console.log('client end'));

console.timeEnd(timeName);


