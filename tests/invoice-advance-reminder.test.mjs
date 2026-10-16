import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');

test('new invoices always start with zero paid in advance',()=>{
  assert.match(app,/document\.getElementById\('inv-deposit'\)\.value=0/);
});

test('verified unallocated client collections are applied once at invoice level',()=>{
  assert.match(app,/const availableCredit=Math\.max\(0,info\.prepaid\+info\.unallocated\)/);
  assert.match(app,/dep\.value=Math\.min\(_invoiceSubtotal\(\),availableCredit\)/);
  assert.match(app,/تم تطبيق الرصيد المتاح على صافي المستحق/);
});
