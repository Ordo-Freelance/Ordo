import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');

test('root is the public landing page while dashboard keeps account login',()=>{
  const routes=JSON.parse(read('../vercel.json'));
  assert.equal(routes.rewrites.find(item=>item.source==='/')?.destination,'/HTML/landing.html');
  assert.equal(routes.rewrites.find(item=>item.source==='/landing')?.destination,'/HTML/landing.html');
  assert.equal(routes.rewrites.find(item=>item.source==='/dashboard')?.destination,'/HTML/index.html');
  const landing=read('../HTML/landing.html');
  assert.match(landing,/\/dashboard\?auth=register/);
  assert.match(landing,/\/dashboard\?auth=login/);
  assert.match(read('../JavaScript/landing.js'),/public\.plans/);
  assert.match(read('../JavaScript/landing.js'),/auth\.session/);
  assert.match(read('../JavaScript/landing.js'),/location\.replace\('\/dashboard'\)/);
});

test('client portal loading theme does not reference undefined tone variables',()=>{
  const portal=read('../HTML/client-portal.html');
  assert.match(portal,/getComputedStyle\(document\.body\)\.getPropertyValue\('--bg'\)/);
  assert.doesNotMatch(portal,/tone&&toneLight/);
});
