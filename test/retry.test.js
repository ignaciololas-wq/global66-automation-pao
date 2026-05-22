import { test } from 'node:test';
import assert from 'node:assert';
import { retry } from '../src/retry.js';

test('retry returns on first success', async () => {
  let n = 0;
  const r = await retry(async () => { n++; return 'ok'; });
  assert.equal(r, 'ok');
  assert.equal(n, 1);
});

test('retry retries on 500 then succeeds', async () => {
  let n = 0;
  const r = await retry(async () => {
    n++;
    if (n < 3) { const e = new Error('boom'); e.status = 500; throw e; }
    return 'ok';
  }, { retries: 5, minDelay: 1 });
  assert.equal(r, 'ok');
  assert.equal(n, 3);
});

test('retry throws on non-retriable 400', async () => {
  let n = 0;
  await assert.rejects(
    retry(async () => { n++; const e = new Error('bad req'); e.status = 400; throw e; }, { retries: 5, minDelay: 1 }),
    /bad req/,
  );
  assert.equal(n, 1);
});

test('retry gives up after max retries', async () => {
  let n = 0;
  await assert.rejects(
    retry(async () => { n++; const e = new Error('500'); e.status = 500; throw e; }, { retries: 2, minDelay: 1 }),
    /500/,
  );
  assert.equal(n, 3);
});
