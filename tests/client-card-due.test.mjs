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

test('client profile lists project invoices and project invoice actions use safe ids',()=>{
  assert.match(source,/const cAllInvs = \(S\.invoices\|\|\[\]\)\.filter\(_matchClientInvoice\)/);
  assert.match(source,/const profileInvs=cAllInvs/);
  assert.match(source,/cProfileProjectIds\.has\(String\(inv\.project_id\|\|inv\.projectId/);
  assert.match(source,/_openClientProfileProjectInvoice\(this\.dataset\.projectId,event\)/);
  assert.match(source,/client_id: clientObj \? String\(clientObj\.id\) : ''/);
});
