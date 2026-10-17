import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');

test('every business WhatsApp share type has an editable settings template',()=>{
  for(const key of ['invoice','task','done','remind','collection','taskQuick','memberTask','tracking','statement','followup','contract','memberProject','memberLate','serviceShare']){
    assert.match(html,new RegExp(`id="wa-tpl-${key}"`));
    assert.match(app,new RegExp(`${key}:\\s*cleanWaTemplate`));
  }
  assert.match(app,/waTemplates\?\.statement/);
  assert.match(app,/waTemplates\?\.followup/);
  assert.match(app,/waTemplates\?\.contract/);
  assert.match(app,/waTemplates\?\.serviceShare/);
});

test('subscriptions can be edited with price date and details',()=>{
  assert.match(html,/id="sub-edit-id"/);
  assert.match(html,/id="sub-details"/);
  assert.match(app,/function openSubscriptionModal\(editId\)/);
  assert.match(app,/تم '\+\(editId\?'تعديل':'إضافة'\)/);
});

test('personal treasury transfers are recorded but excluded from operating profit',()=>{
  assert.match(html,/openPersonalTreasuryTransfer\(\)/);
  assert.match(app,/function openPersonalTreasuryTransfer\(\)/);
  assert.match(app,/تحويل\\s\*للخزنة\\s\*الشخصية/);
  assert.match(app,/const exp = _profitExpenseSum\(mTrans\)/);
  assert.match(app,/mTrans\.filter\(_isPersonalExpense\)/);
});
