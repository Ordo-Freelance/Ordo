import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');

test('dashboard performance and orders use the current calendar month across task sources',()=>{
  assert.match(app,/_dashboardDateInMonth/);
  assert.match(app,/_ordoAllDashboardTasks\(\)\.forEach/);
  assert.match(app,/_dashboardTaskCreatedDate\(t\)/);
  assert.match(app,/_dashboardTaskCompletedDate\(t\)/);
  assert.match(app,/t\.type==='income'&&_dashboardDateInMonth/);
});

test('dashboard income card totals only income from the current calendar month',()=>{
  assert.match(html,/function monthlyIncome\(code\)/);
  assert.match(html,/d\.getFullYear\(\) === year && d\.getMonth\(\) === month/);
  assert.match(html,/دخل الشهر الحالي/);
  assert.match(html,/من يوم 1 حتى آخر يوم في الشهر/);
});
