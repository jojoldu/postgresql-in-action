const { Client } = require("pg");

const config = {
  host: "localhost",
  user: "test",
  database: "test",
  password: "test",
  port: 5432,
};

const timeName = 'client';
test
console.time(timeName);

Promise.all(Array(100).fill(0).map(async (_, i) => {
  const client = new Client(config);
  await client.connect();
  await client.query('SELECT NOW()');
  await client.end();
})).then(() => console.log('client end'));

console.timeEnd(timeName);

