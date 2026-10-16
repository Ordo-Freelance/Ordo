import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');

test('new invoices always start with zero paid in advance',()=>{
  assert.match(app,/document\.getElementById\('inv-deposit'\)\.value=0/);
});

test('prior collections are reminders and are not auto-applied',()=>{
  assert.match(app,/للمراجعة فقط؛ لن يُضاف أي مبلغ/);
  assert.match(app,/الدفعات السابقة تظهر كتذكير فقط/);
  assert.doesNotMatch(app,/depEl\.value\s*=\s*currentDep\s*\+/);
});
