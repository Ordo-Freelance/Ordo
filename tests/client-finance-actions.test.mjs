import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../JavaScript/client_finance_fix.js',import.meta.url),'utf8');
const financeSource=fs.readFileSync(new URL('../JavaScript/finance_rebuild.js',import.meta.url),'utf8');

test('client finance rows expose edit and confirmed delete actions',()=>{
  assert.match(source,/editCollection/);
  assert.match(source,/deleteCollection/);
  assert.match(source,/confirmDel\('حذف عملية التحصيل/);
});

test('inline finance actions HTML-escapes quoted JavaScript arguments',()=>{
  assert.match(source,/function jsArg\(v\)\{ return esc\(JSON\.stringify\(v\)\); \}/);
  assert.match(source,/editCollection\('\+jsArg\(String\(r\.id\)\)/);
  assert.doesNotMatch(source,/editCollection\('\+JSON\.stringify\(String\(r\.id\)\)/);
  assert.match(financeSource,/editTransaction\('\+jsArg\(String\(t\.id\)\)/);
});

test('main finance table uses id-safe transaction edit and delete actions',()=>{
  assert.match(financeSource,/OrdoClientFinanceFix\.editTransaction/);
  assert.match(financeSource,/OrdoClientFinanceFix\.deleteTransaction/);
  assert.doesNotMatch(financeSource,/openIncomeModal'\)\+'\(\\''\+esc\(t\.id\)/);
});

test('editing and deleting collections updates linked financial state',()=>{
  assert.match(source,/tx\.amount=amount/);
  assert.match(source,/task\.paymentCollected=false/);
  assert.match(source,/reconcileInvoice\(S\(\),inv\)/);
  assert.match(source,/await root\.cloudSave\(S\(\)\)/);
});

test('legacy collected tasks get one finance ledger transaction and count in collected totals',()=>{
  assert.match(source,/task-collection-ledger:/);
  assert.match(source,/ensureCollectionTransactions\(bundle\)/);
  assert.match(source,/collectionTimeUnknown/);
});

test('deleted collections return archived tasks to client unpaid totals',()=>{
  assert.match(source,/arr\(s\.tasks\)\.concat\(archived\.filter/);
  assert.match(source,/arr\(s\.project_tasks\)\.concat\(archived\.filter/);
  assert.match(source,/function uniqueTasks/);
});
