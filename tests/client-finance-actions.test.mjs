import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../JavaScript/client_finance_fix.js',import.meta.url),'utf8');

test('client finance rows expose edit and confirmed delete actions',()=>{
  assert.match(source,/editCollection/);
  assert.match(source,/deleteCollection/);
  assert.match(source,/confirmDel\('حذف عملية التحصيل/);
});

test('editing and deleting collections updates linked financial state',()=>{
  assert.match(source,/tx\.amount=amount/);
  assert.match(source,/task\.paymentCollected=false/);
  assert.match(source,/reconcileInvoice\(S\(\),inv\)/);
  assert.match(source,/await root\.cloudSave\(S\(\)\)/);
});
