import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');

test('subscriptions have a finance sidebar page and due-date form',()=>{
  assert.match(html,/group\('finance'[^\n]*\['finance','subscriptions','invoices'/);
  assert.match(html,/id="page-subscriptions"/);
  for(const id of ['sub-next-date','sub-cadence','sub-currency','sub-remind-days']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/subscriptions:'finance'/);
  assert.match(app,/f\.fin_subscriptions===false/);
});

test('monthly billing retains original billing day after a short month',()=>{
  const fn=app.match(/function _subscriptionDateKey[\s\S]*?(?=function _subscriptionDue)/)?.[0];
  assert.ok(fn);
  const context=vm.createContext({Date,String,Math});
  vm.runInContext(fn,context);
  assert.equal(vm.runInContext("_subscriptionAdvance('2026-01-31','monthly',31)",context),'2026-02-28');
  assert.equal(vm.runInContext("_subscriptionAdvance('2026-02-28','monthly',31)",context),'2026-03-31');
  assert.equal(vm.runInContext("_subscriptionAdvance('2026-12-24','yearly',24)",context),'2027-12-24');
});

test('payment is linked to one due date and reminder is per obligation',()=>{
  assert.match(app,/t\.subscriptionId\)===String\(subId\)&&t\.subscriptionDue===due/);
  assert.match(app,/subscriptionId:subId,subscriptionDue:due/);
  assert.match(app,/var key='sub_reminder_'/);
  assert.match(app,/if\(localStorage\.getItem\(todayKey\)\) return/);
  assert.ok(app.indexOf("var key='sub_reminder_'")<app.indexOf('if(localStorage.getItem(todayKey)) return'));
});
