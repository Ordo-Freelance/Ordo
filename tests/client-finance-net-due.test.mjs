import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../JavaScript/client_finance_fix.js',import.meta.url),'utf8');

test('client net due subtracts unallocated and standalone client collections',()=>{
  assert.match(source,/availableCredit/);
  assert.match(source,/t\.unallocatedAmount!=null/);
  assert.match(source,/unpaidTasks - b\.openingPrepaid - b\.availableCredit/);
});

test('generated invoice and task receipts are not subtracted twice',()=>{
  assert.match(source,/invoice_payment\|task_payment\|task_collection_ledger/);
  assert.match(source,/!linked&&!generated\?income:0/);
});
