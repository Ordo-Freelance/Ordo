import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../JavaScript/client_finance_fix.js',import.meta.url),'utf8');

test('collected task list requires a real linked finance transaction',()=>{
  assert.match(source,/var tx=collectionTransaction\(r\);\s*if\(!tx \|\| num\(tx\.amount\)<=0\) return/);
  assert.doesNotMatch(source,/bundle\.tasks\.forEach\(function\(t\)\{ addFallback/);
});

test('opening client accounts never recreates deleted collection transactions',()=>{
  assert.doesNotMatch(source,/if\(ensureCollectionTransactions\(bundle\)\)/);
});
