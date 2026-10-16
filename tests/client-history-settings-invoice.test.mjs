import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const finance=fs.readFileSync(new URL('../JavaScript/client_finance_fix.js',import.meta.url),'utf8');

test('client card prefers the currency of the clients actual tasks over stale client currency',()=>{
  assert.match(app,/const actualWorkCurrency=clientTaskCurrency/);
  assert.match(app,/_salaryCurrencyMeta\(actualWorkCurrency\|\|c\.currency_code/);
  assert.match(app,/const dueCurrency=dueCurrencyMeta\.symbol/);
});

test('paid legacy archived tasks remain settled without inventing a transaction',()=>{
  assert.match(finance,/var legacyPaid=t\._archived/);
  assert.match(finance,/Object\.assign\(\{_archived:true\},t\)/);
});

test('studio email save awaits persistence and invoice recognizes legacy completed states',()=>{
  assert.match(app,/async function saveSettings\(\)/);
  assert.match(app,/await cloudSaveNow\(S\)/);
  assert.match(app,/sourceStatus==='مكتملة'/);
  assert.match(app,/sourceTask\.completed/);
});
