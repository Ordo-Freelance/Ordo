import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');

test('client cards and red overview alert use the unified finance net due',()=>{
  const calls=app.match(/OrdoClientFinanceFix\.summary\(c\.id\)/g)||[];
  assert.ok(calls.length>=2);
  assert.match(app,/unifiedSummary\[code\]\.netDue/);
  assert.match(app,/unifiedAccount\[code\]\.netDue/);
  assert.match(app,/client-simple-alert/);
});
