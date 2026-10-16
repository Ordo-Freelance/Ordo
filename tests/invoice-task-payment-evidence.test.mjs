import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');

test('invoice task paid and deposit badges require an explicit linked income transaction',()=>{
  assert.match(app,/function _invoiceTaskPaidAmount\(t\)/);
  assert.match(app,/tx\.linkedTaskId\|\|tx\.linkedProjTaskId/);
  assert.match(app,/return value>0&&paid>=value-0\.005/);
  assert.doesNotMatch(app,/return !!\(t && \(t\.paymentCollected/);
});
