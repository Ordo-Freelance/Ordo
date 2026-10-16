import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const finance=fs.readFileSync(new URL('../JavaScript/client_finance_fix.js',import.meta.url),'utf8');

test('parent invoice shows subclient tasks in a separate task-card panel',()=>{
  assert.match(html,/inv-subclient-item-panel/);
  assert.match(html,/inv-subclient-tasks-list/);
  assert.match(app,/ctx\.names\.includes\(t\.client\)/);
  assert.match(app,/const subTasks = allClientTasks\.filter/);
  assert.match(app,/rows\.map\(t=>renderTaskChip/);
});

test('parent finance ledger labels tasks belonging to a subclient',()=>{
  assert.match(finance,/affiliate:String\(t\.client/);
  assert.match(finance,/تابع لـ.*r\.affiliate/);
});

test('invoice live summary includes paid in advance',()=>{
  assert.match(html,/id="inv-prepaid-live"/);
  assert.match(app,/prepaidEl\.textContent=dep\.toLocaleString\(\)/);
});

test('printed invoice isolates every subclient into its own section',()=>{
  assert.match(app,/const subClientGroups=Array\.from/);
  assert.match(app,/!x\.subClientName&&x\.status==='done'/);
  assert.match(app,/subClientGroups\.forEach\(g=>pushSplitSection/);
  assert.match(app,/تابع للعميل الرئيسي/);
});
