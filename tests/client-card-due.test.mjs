import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');

test('client card total due subtracts partial invoice and task payments',()=>{
  assert.match(source,/invoiceTotal\(i\)-invoicePaidAmount\(i\)/);
  assert.match(source,/Math\.max\(\+\(t\.deposit\|\|0\),\+\(t\.depositAmount\|\|0\),\+\(t\.paidAmount\|\|0\)/);
  assert.match(source,/إجمالي المستحق/);
  assert.match(source,/dueCurrency/);
});
