import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../CSS/styles.css',import.meta.url),'utf8');

test('dashboard summarizes the ten latest tasks across completion states',()=>{
  assert.match(app,/آخر 10 مهام/);
  assert.match(app,/sort\(\(a,b\)=>_dashboardTaskTimestamp\(b\)-_dashboardTaskTimestamp\(a\)\)\.slice\(0,10\)/);
  assert.match(app,/_dashboardTaskStatus\(t\)/);
  assert.match(app,/_dashboardTaskPayment\(t\)/);
  assert.match(app,/done:'مكتمل'/);
  assert.match(css,/\.dash-recent-task\{/);
  assert.match(css,/\.dash-task-status\{/);
});
