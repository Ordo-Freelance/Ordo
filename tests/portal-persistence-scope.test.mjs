import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');

test('published portal data matches legacy name-linked finance records',()=>{
  assert.match(source,/x\.client\|\|x\.client_name\|\|x\.clientName\|\|x\.source/);
  assert.match(source,/invoices:invoices,statements:\(data\.statements\|\|\[\]\)\.filter\(forClient\),transactions:\(data\.transactions\|\|\[\]\)\.filter\(forClient\)/);
});

test('invoice, statement, and transaction changes republish the portal snapshot',()=>{
  assert.match(source,/invoices:root\.S\.invoices,statements:root\.S\.statements,transactions:root\.S\.transactions/);
});
