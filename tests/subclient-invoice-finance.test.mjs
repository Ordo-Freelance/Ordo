import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const finance=fs.readFileSync(new URL('../JavaScript/client_finance_fix.js',import.meta.url),'utf8');

test('parent invoice can add a labelled subclient item and include subclient tasks',()=>{
  assert.match(html,/inv-subclient-item-panel/);
  assert.match(app,/function addSubClientInvoiceItem\(\)/);
  assert.match(app,/ctx\.names\.includes\(t\.client\)/);
  assert.match(app,/تابع لـ.*it\.subClientName/);
});

test('parent finance ledger labels tasks belonging to a subclient',()=>{
  assert.match(finance,/affiliate:String\(t\.client/);
  assert.match(finance,/تابع لـ.*r\.affiliate/);
});

test('invoice live summary includes paid in advance',()=>{
  assert.match(html,/id="inv-prepaid-live"/);
  assert.match(app,/prepaidEl\.textContent=dep\.toLocaleString\(\)/);
});
